import { and, eq, or, ilike, ne, desc } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import { users, userFollows } from "../../db/schema";
import { cacheKeys } from "../../lib/cache/keys";
import type { RelationshipStatus } from "./social.schemas";

export class SocialService {
  /**
   * Follows a user. If the target user has isPrivateAccount = true,
   * creates a PENDING follow request. Otherwise, creates an ACCEPTED follow immediately.
   */
  async followUser(followerId: string, targetUserId: string) {
    if (followerId === targetUserId) {
      throw new Error("You cannot follow yourself");
    }

    // 1. Verify target user exists & get privacy setting
    const [targetUser] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        isPrivateAccount: users.isPrivateAccount,
      })
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // 2. Check existing relationship
    const [existing] = await db
      .select()
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, followerId),
          eq(userFollows.followingId, targetUserId)
        )
      );

    if (existing) {
      if (existing.status === "ACCEPTED") {
        return { status: "ACCEPTED", alreadyFollowing: true, isMutualFriend: await this.isMutualFriend(followerId, targetUserId) };
      }
      return { status: "PENDING", alreadyPending: true, isMutualFriend: false };
    }

    const initialStatus = targetUser.isPrivateAccount ? "PENDING" : "ACCEPTED";

    // 3. Insert record
    await db.insert(userFollows).values({
      followerId,
      followingId: targetUserId,
      status: initialStatus,
    });

    // 4. Update Redis caches if ACCEPTED
    if (initialStatus === "ACCEPTED") {
      await redis.sadd(cacheKeys.social.userFollowing(followerId), targetUserId);
      await redis.sadd(cacheKeys.social.userFollowers(targetUserId), followerId);
    } else {
      await redis.sadd(cacheKeys.social.incomingRequests(targetUserId), followerId);
    }

    const isMutual = initialStatus === "ACCEPTED" ? await this.isMutualFriend(followerId, targetUserId) : false;

    return {
      status: initialStatus,
      isPrivateAccount: targetUser.isPrivateAccount,
      isMutualFriend: isMutual,
    };
  }

  /**
   * Unfollows a user or cancels a pending outgoing follow request.
   */
  async unfollowUser(followerId: string, targetUserId: string) {
    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerId, followerId),
          eq(userFollows.followingId, targetUserId)
        )
      );

    await redis.srem(cacheKeys.social.userFollowing(followerId), targetUserId);
    await redis.srem(cacheKeys.social.userFollowers(targetUserId), followerId);
    await redis.srem(cacheKeys.social.incomingRequests(targetUserId), followerId);

    return { success: true };
  }

  /**
   * Accepts a pending follow request.
   */
  async acceptFollowRequest(targetUserId: string, requesterId: string) {
    const [existing] = await db
      .select()
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, requesterId),
          eq(userFollows.followingId, targetUserId),
          eq(userFollows.status, "PENDING")
        )
      );

    if (!existing) {
      throw new Error("No pending follow request found from this user");
    }

    await db
      .update(userFollows)
      .set({ status: "ACCEPTED", updatedAt: new Date() })
      .where(
        and(
          eq(userFollows.followerId, requesterId),
          eq(userFollows.followingId, targetUserId)
        )
      );

    await redis.srem(cacheKeys.social.incomingRequests(targetUserId), requesterId);
    await redis.sadd(cacheKeys.social.userFollowing(requesterId), targetUserId);
    await redis.sadd(cacheKeys.social.userFollowers(targetUserId), requesterId);

    const isMutual = await this.isMutualFriend(targetUserId, requesterId);

    return { success: true, status: "ACCEPTED", isMutualFriend: isMutual };
  }

  /**
   * Rejects/declines a pending follow request.
   */
  async rejectFollowRequest(targetUserId: string, requesterId: string) {
    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerId, requesterId),
          eq(userFollows.followingId, targetUserId),
          eq(userFollows.status, "PENDING")
        )
      );

    await redis.srem(cacheKeys.social.incomingRequests(targetUserId), requesterId);

    return { success: true };
  }

  /**
   * Checks if two users mutually follow each other with ACCEPTED status (Friends).
   */
  async isMutualFriend(userA: string, userB: string): Promise<boolean> {
    const follows = await db
      .select({
        followerId: userFollows.followerId,
        followingId: userFollows.followingId,
      })
      .from(userFollows)
      .where(
        and(
          or(
            and(eq(userFollows.followerId, userA), eq(userFollows.followingId, userB)),
            and(eq(userFollows.followerId, userB), eq(userFollows.followingId, userA))
          ),
          eq(userFollows.status, "ACCEPTED")
        )
      );

    return follows.length === 2;
  }

  /**
   * Evaluates the granular relationship between current user and target user.
   */
  async getRelationshipStatus(
    currentUserId: string,
    targetUserId: string
  ): Promise<RelationshipStatus> {
    if (currentUserId === targetUserId) {
      return "SELF";
    }

    const records = await db
      .select({
        followerId: userFollows.followerId,
        followingId: userFollows.followingId,
        status: userFollows.status,
      })
      .from(userFollows)
      .where(
        or(
          and(
            eq(userFollows.followerId, currentUserId),
            eq(userFollows.followingId, targetUserId)
          ),
          and(
            eq(userFollows.followerId, targetUserId),
            eq(userFollows.followingId, currentUserId)
          )
        )
      );

    const forward = records.find(
      (r) => r.followerId === currentUserId && r.followingId === targetUserId
    );
    const reverse = records.find(
      (r) => r.followerId === targetUserId && r.followingId === currentUserId
    );

    if (forward?.status === "ACCEPTED" && reverse?.status === "ACCEPTED") {
      return "FRIENDS";
    }
    if (forward?.status === "ACCEPTED") {
      return "FOLLOWING";
    }
    if (forward?.status === "PENDING") {
      return "PENDING_SENT";
    }
    if (reverse?.status === "PENDING") {
      return "PENDING_RECEIVED";
    }

    return "NONE";
  }

  /**
   * Retrieves pending incoming follow requests for the authenticated user.
   */
  async getIncomingRequests(userId: string) {
    const requests = await db
      .select({
        requesterId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followerId, users.id))
      .where(
        and(
          eq(userFollows.followingId, userId),
          eq(userFollows.status, "PENDING")
        )
      )
      .orderBy(desc(userFollows.createdAt));

    return requests;
  }

  /**
   * Retrieves all mutual friends (two-way accepted follows) of the user.
   */
  async getMutualFriends(userId: string) {
    // 1. Get all users followed by userId with ACCEPTED status
    const following = await db
      .select({ targetId: userFollows.followingId })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, userId),
          eq(userFollows.status, "ACCEPTED")
        )
      );

    if (following.length === 0) return [];
    const followingIds = following.map((f) => f.targetId);

    // 2. Find which of those users also follow userId back with ACCEPTED status
    const mutuals = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        listeningActivityPrivacy: users.listeningActivityPrivacy,
        isPrivateAccount: users.isPrivateAccount,
      })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followerId, users.id))
      .where(
        and(
          eq(userFollows.followingId, userId),
          eq(userFollows.status, "ACCEPTED"),
          or(...followingIds.map((fid) => eq(userFollows.followerId, fid)))
        )
      );

    return mutuals;
  }

  /**
   * Retrieves users who follow the target user (with ACCEPTED status).
   */
  async getFollowers(targetUserId: string) {
    return await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followerId, users.id))
      .where(
        and(
          eq(userFollows.followingId, targetUserId),
          eq(userFollows.status, "ACCEPTED")
        )
      )
      .orderBy(desc(userFollows.createdAt));
  }

  /**
   * Retrieves users followed by the target user (with ACCEPTED status).
   */
  async getFollowing(targetUserId: string) {
    return await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followingId, users.id))
      .where(
        and(
          eq(userFollows.followerId, targetUserId),
          eq(userFollows.status, "ACCEPTED")
        )
      )
      .orderBy(desc(userFollows.createdAt));
  }

  /**
   * Searches for community members and enriches results with relationship status.
   */
  async searchUsers(currentUserId: string, query?: string, limit = 20) {
    const trimmed = query?.trim() || "";

    const condition = trimmed
      ? and(
          ne(users.id, currentUserId),
          or(
            ilike(users.displayName, `%${trimmed}%`),
            ilike(users.email, `%${trimmed}%`)
          )
        )
      : ne(users.id, currentUserId);

    const candidates = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        isPrivateAccount: users.isPrivateAccount,
      })
      .from(users)
      .where(condition)
      .limit(limit);

    // Enrich each user with relationship relative to current user
    const enriched = await Promise.all(
      candidates.map(async (candidate) => {
        const relationship = await this.getRelationshipStatus(
          currentUserId,
          candidate.id
        );
        return {
          ...candidate,
          relationship,
        };
      })
    );

    return enriched;
  }
}
