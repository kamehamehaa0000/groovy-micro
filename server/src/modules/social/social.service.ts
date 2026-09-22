import { and, eq, or, ilike, ne, desc, inArray, lt } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import {
  users,
  userFollows,
  artistProfiles,
  artistFollowers,
  albums,
  songs,
  playlists,
  userLibraryPlaylists,
  songLikes,
} from "../../db/schema";
import { cacheKeys } from "../../lib/cache/keys";
import type {
  RelationshipStatus,
  SocialFeedQuery,
  SocialFeedResponse,
  FeedItem,
} from "./social.schemas";

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

  /**
   * Aggregates a chronological social activity feed for the current user.
   * Combines:
   * 1. New published releases from followed artists
   * 2. Public playlists created by followed users / friends
   * 3. Public playlists saved by friends
   * 4. Tracks liked by friends
   * If the user follows nobody or has no activity, smoothly falls back to Groovy platform highlights!
   */
  async getFeed(
    currentUserId: string,
    query: SocialFeedQuery
  ): Promise<SocialFeedResponse> {
    const { cursor, limit = 20, filter = "all" } = query;
    const cacheTag = `${cursor || "initial"}:${filter}:${limit}`;
    const cacheKey = cacheKeys.social.feed(currentUserId, cacheTag);

    // 1. Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as SocialFeedResponse;
      } catch {
        // invalid JSON cache, proceed to live query
      }
    }

    // 2. Fetch followed artist IDs & followed user IDs
    const [followedArtists, followedUsers] = await Promise.all([
      db
        .select({ artistId: artistFollowers.artistId })
        .from(artistFollowers)
        .where(eq(artistFollowers.userId, currentUserId)),
      db
        .select({ followingId: userFollows.followingId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, currentUserId),
            eq(userFollows.status, "ACCEPTED")
          )
        ),
    ]);

    const followedArtistIds = followedArtists.map((r) => r.artistId);
    const followedUserIds = followedUsers.map((r) => r.followingId);

    const cursorDate = cursor ? new Date(cursor) : null;
    const fetchLimit = limit + 10; // Fetch slightly more to ensure good variety when merging

    const items: FeedItem[] = [];

    // --- RELEASES ---
    if (filter === "all" || filter === "releases") {
      const releaseConditions = [
        eq(albums.status, "PUBLISHED"),
        eq(albums.visibility, "PUBLIC"),
      ];

      if (followedArtistIds.length > 0) {
        releaseConditions.push(inArray(albums.artistId, followedArtistIds));
      }
      if (cursorDate) {
        releaseConditions.push(lt(albums.publishedAt, cursorDate));
      }

      const releaseRows = await db
        .select({
          id: albums.id,
          title: albums.title,
          slug: albums.slug,
          albumType: albums.albumType,
          coverImageUrl: albums.coverImageUrl,
          publishedAt: albums.publishedAt,
          createdAt: albums.createdAt,
          artistId: artistProfiles.id,
          stageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          bannerUrl: artistProfiles.bannerUrl,
          avatarUrl: artistProfiles.avatarUrl,
        })
        .from(albums)
        .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
        .where(and(...releaseConditions))
        .orderBy(desc(albums.publishedAt))
        .limit(fetchLimit);

      for (const rel of releaseRows) {
        const itemDate = rel.publishedAt || rel.createdAt;
        items.push({
          id: `release:${rel.id}`,
          type: "NEW_RELEASE",
          timestamp: itemDate.toISOString(),
          actor: {
            id: rel.artistId,
            name: rel.stageName,
            avatarUrl: rel.avatarUrl || rel.bannerUrl,
            slug: rel.artistSlug,
            isArtist: true,
          },
          target: {
            id: rel.id,
            title: rel.title,
            subtitle: `${rel.albumType || "Album"} · ${rel.stageName}`,
            coverImageUrl: rel.coverImageUrl,
            slug: rel.slug,
            type: "album",
          },
        });
      }
    }

    // --- PLAYLISTS CREATED ---
    if (filter === "all" || filter === "playlists") {
      const playlistConditions = [eq(playlists.visibility, "PUBLIC")];

      if (followedUserIds.length > 0) {
        playlistConditions.push(inArray(playlists.ownerId, followedUserIds));
      }
      if (cursorDate) {
        playlistConditions.push(lt(playlists.createdAt, cursorDate));
      }

      const playlistRows = await db
        .select({
          id: playlists.id,
          title: playlists.title,
          coverImageUrl: playlists.coverImageUrl,
          savesCount: playlists.savesCount,
          createdAt: playlists.createdAt,
          ownerId: users.id,
          ownerName: users.displayName,
          ownerAvatar: users.avatarUrl,
        })
        .from(playlists)
        .innerJoin(users, eq(playlists.ownerId, users.id))
        .where(and(...playlistConditions))
        .orderBy(desc(playlists.createdAt))
        .limit(fetchLimit);

      for (const pl of playlistRows) {
        items.push({
          id: `playlist:${pl.id}`,
          type: "PLAYLIST_CREATED",
          timestamp: pl.createdAt.toISOString(),
          actor: {
            id: pl.ownerId,
            name: pl.ownerName,
            avatarUrl: pl.ownerAvatar,
            isArtist: false,
          },
          target: {
            id: pl.id,
            title: pl.title,
            subtitle: `Playlist · ${pl.savesCount || 0} saves`,
            coverImageUrl: pl.coverImageUrl,
            type: "playlist",
          },
        });
      }
    }

    // --- FRIEND ENGAGEMENTS (Saves & Likes) ---
    if ((filter === "all" || filter === "friends") && followedUserIds.length > 0) {
      // 1. Playlists saved by followed users
      const saveConditions = [
        inArray(userLibraryPlaylists.userId, followedUserIds),
        eq(playlists.visibility, "PUBLIC"),
      ];
      if (cursorDate) {
        saveConditions.push(lt(userLibraryPlaylists.savedAt, cursorDate));
      }

      const savedPlaylistRows = await db
        .select({
          userId: userLibraryPlaylists.userId,
          savedAt: userLibraryPlaylists.savedAt,
          playlistId: playlists.id,
          playlistTitle: playlists.title,
          coverImageUrl: playlists.coverImageUrl,
          userName: users.displayName,
          userAvatar: users.avatarUrl,
        })
        .from(userLibraryPlaylists)
        .innerJoin(playlists, eq(userLibraryPlaylists.playlistId, playlists.id))
        .innerJoin(users, eq(userLibraryPlaylists.userId, users.id))
        .where(and(...saveConditions))
        .orderBy(desc(userLibraryPlaylists.savedAt))
        .limit(fetchLimit);

      for (const sp of savedPlaylistRows) {
        items.push({
          id: `save:${sp.userId}:${sp.playlistId}`,
          type: "PLAYLIST_SAVED",
          timestamp: sp.savedAt.toISOString(),
          actor: {
            id: sp.userId,
            name: sp.userName,
            avatarUrl: sp.userAvatar,
            isArtist: false,
          },
          target: {
            id: sp.playlistId,
            title: sp.playlistTitle,
            subtitle: "Saved to library",
            coverImageUrl: sp.coverImageUrl,
            type: "playlist",
          },
        });
      }

      // 2. Songs liked by followed users
      const likeConditions = [
        inArray(songLikes.userId, followedUserIds),
      ];
      if (cursorDate) {
        likeConditions.push(lt(songLikes.createdAt, cursorDate));
      }

      const songLikeRows = await db
        .select({
          userId: songLikes.userId,
          createdAt: songLikes.createdAt,
          songId: songs.id,
          songTitle: songs.title,
          coverImageUrl: songs.coverImageUrl,
          audioUrl: songs.audioUrl,
          durationSeconds: songs.durationSeconds,
          isExplicit: songs.isExplicit,
          artistName: artistProfiles.stageName,
          userName: users.displayName,
          userAvatar: users.avatarUrl,
        })
        .from(songLikes)
        .innerJoin(songs, eq(songLikes.songId, songs.id))
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .innerJoin(users, eq(songLikes.userId, users.id))
        .where(and(...likeConditions))
        .orderBy(desc(songLikes.createdAt))
        .limit(fetchLimit);

      for (const sl of songLikeRows) {
        items.push({
          id: `like:${sl.userId}:${sl.songId}`,
          type: "SONG_LIKED",
          timestamp: sl.createdAt.toISOString(),
          actor: {
            id: sl.userId,
            name: sl.userName,
            avatarUrl: sl.userAvatar,
            isArtist: false,
          },
          target: {
            id: sl.songId,
            title: sl.songTitle,
            subtitle: `Track · ${sl.artistName}`,
            coverImageUrl: sl.coverImageUrl,
            type: "song",
            audioUrl: sl.audioUrl,
            durationSeconds: sl.durationSeconds,
            isExplicit: sl.isExplicit,
          },
        });
      }
    }

    // Deduplicate items by ID
    const uniqueMap = new Map<string, FeedItem>();
    for (const item of items) {
      uniqueMap.set(item.id, item);
    }

    // Sort chronologically descending
    const sorted = Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply limit & pagination
    const pageItems = sorted.slice(0, limit);
    const hasMore = sorted.length > limit;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1].timestamp : null;

    const response: SocialFeedResponse = {
      items: pageItems,
      nextCursor,
      hasMore,
    };

    // Cache in Redis for 45 seconds
    await redis.set(cacheKey, JSON.stringify(response), "EX", 45);

    return response;
  }
}
