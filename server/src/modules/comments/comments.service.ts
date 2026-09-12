import { db } from "../../db";
import { redis } from "../../db/redis";
import { cacheKeys } from "../../lib/cache/keys";
import {
  comments,
  commentVotes,
  users,
  songs,
  albums,
  playlists,
  artistProfiles,
} from "../../db/schema";
import { eq, and, isNull, sql, inArray, desc, asc, SQL } from "drizzle-orm";
import type {
  ListCommentsQuery,
  ListRepliesQuery,
  CreateCommentInput,
  UpdateCommentInput,
  VoteCommentInput,
  EnrichedComment,
} from "./comments.schemas";

export class CommentsService {
  /**
   * Resolves the target entity, verifying its existence, creator ownership, and comments permission.
   */
  async getTargetEntity(target: {
    songId?: string;
    albumId?: string;
    playlistId?: string;
  }): Promise<{
    exists: boolean;
    allowComments: boolean;
    ownerUserId: string;
    targetType: "SONG" | "ALBUM" | "PLAYLIST";
    targetId: string;
  }> {
    if (target.songId) {
      const [song] = await db
        .select({
          id: songs.id,
          allowComments: songs.allowComments,
          ownerUserId: artistProfiles.userId,
        })
        .from(songs)
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .where(and(eq(songs.id, target.songId), isNull(songs.deletedAt)))
        .limit(1);

      if (!song) return { exists: false, allowComments: false, ownerUserId: "", targetType: "SONG", targetId: target.songId };
      return { exists: true, allowComments: song.allowComments, ownerUserId: song.ownerUserId, targetType: "SONG", targetId: song.id };
    }

    if (target.albumId) {
      const [album] = await db
        .select({
          id: albums.id,
          allowComments: albums.allowComments,
          ownerUserId: artistProfiles.userId,
        })
        .from(albums)
        .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
        .where(and(eq(albums.id, target.albumId), isNull(albums.deletedAt)))
        .limit(1);

      if (!album) return { exists: false, allowComments: false, ownerUserId: "", targetType: "ALBUM", targetId: target.albumId };
      return { exists: true, allowComments: album.allowComments, ownerUserId: album.ownerUserId, targetType: "ALBUM", targetId: album.id };
    }

    if (target.playlistId) {
      const [playlist] = await db
        .select({
          id: playlists.id,
          allowComments: playlists.allowComments,
          ownerUserId: playlists.ownerId,
        })
        .from(playlists)
        .where(eq(playlists.id, target.playlistId))
        .limit(1);

      if (!playlist) return { exists: false, allowComments: false, ownerUserId: "", targetType: "PLAYLIST", targetId: target.playlistId };
      return { exists: true, allowComments: playlist.allowComments, ownerUserId: playlist.ownerUserId, targetType: "PLAYLIST", targetId: playlist.id };
    }

    throw new Error("No target entity specified");
  }

  /**
   * Retrieves user vote states from Redis hash cache for a list of comment IDs.
   */
  private async getVotesForComments(
    userId: string | undefined,
    commentIds: string[]
  ): Promise<Map<string, 1 | -1>> {
    const voteMap = new Map<string, 1 | -1>();
    if (!userId || commentIds.length === 0) return voteMap;

    const key = cacheKeys.social.userCommentVotes(userId);
    try {
      const rawVotes = await redis.hmget(key, ...commentIds);
      let hasMissing = false;

      for (let i = 0; i < commentIds.length; i++) {
        const val = rawVotes[i];
        if (val === "1" || val === "-1") {
          voteMap.set(commentIds[i], parseInt(val, 10) as 1 | -1);
        } else if (val === null) {
          // Key or field might not exist in cache; we'll check DB if key is unpopulated
          hasMissing = true;
        }
      }

      // If Redis key has never been initialized, seed it from DB
      if (hasMissing) {
        const keyExists = await redis.exists(key);
        if (!keyExists) {
          const userDbVotes = await db
            .select({ commentId: commentVotes.commentId, vote: commentVotes.vote })
            .from(commentVotes)
            .where(eq(commentVotes.userId, userId));

          if (userDbVotes.length > 0) {
            const pipeline = redis.pipeline();
            const kv: Record<string, string> = {};
            for (const row of userDbVotes) {
              kv[row.commentId] = row.vote.toString();
              if (commentIds.includes(row.commentId)) {
                voteMap.set(row.commentId, row.vote as 1 | -1);
              }
            }
            pipeline.hset(key, kv);
            pipeline.expire(key, 86400 * 7);
            await pipeline.exec();
          }
        }
      }
    } catch (err) {
      console.warn("[CommentsService] Redis HMGET failed for comment votes:", err);
    }

    return voteMap;
  }

  /**
   * Lists top-level comments for a target entity with preview replies and voting status.
   */
  async getComments(
    query: ListCommentsQuery,
    currentUserId?: string,
    currentUserRole?: string
  ): Promise<{
    data: EnrichedComment[];
    comments?: EnrichedComment[];
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
    allowComments: boolean;
  }> {
    const { songId, albumId, playlistId, sort, page, limit } = query;
    const offset = (page - 1) * limit;

    const targetInfo = await this.getTargetEntity({ songId, albumId, playlistId });
    if (!targetInfo.exists) {
      throw new Error("Target entity not found");
    }

    const targetCondition = songId
      ? eq(comments.songId, songId)
      : albumId
      ? eq(comments.albumId, albumId)
      : eq(comments.playlistId, playlistId!);

    // Root comments only, excluding soft-deleted comments that have 0 replies
    const baseWhere = and(
      targetCondition,
      isNull(comments.parentId),
      sql`(${comments.deletedAt} IS NULL OR ${comments.repliesCount} > 0)`
    );

    // Dynamic sorting
    let orderClauses: SQL[] = [];
    switch (sort) {
      case "newest":
        orderClauses = [desc(comments.isPinned), desc(comments.createdAt)];
        break;
      case "oldest":
        orderClauses = [desc(comments.isPinned), asc(comments.createdAt)];
        break;
      case "disliked":
        orderClauses = [desc(comments.isPinned), desc(comments.dislikesCount), desc(comments.createdAt)];
        break;
      case "controversial":
        // Tension: minimum of likes and dislikes weighted by total engagement
        orderClauses = [
          desc(comments.isPinned),
          desc(sql`LEAST(${comments.likesCount}, ${comments.dislikesCount})`),
          desc(sql`(${comments.likesCount} + ${comments.dislikesCount})`),
          desc(comments.createdAt),
        ];
        break;
      case "top":
      default:
        orderClauses = [desc(comments.isPinned), desc(comments.likesCount), desc(comments.createdAt)];
        break;
    }

    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(comments)
      .where(baseWhere);

    const rootCommentRows = await db
      .select({
        id: comments.id,
        userId: comments.userId,
        userName: users.displayName,
        userAvatarUrl: users.avatarUrl,
        songId: comments.songId,
        albumId: comments.albumId,
        playlistId: comments.playlistId,
        parentId: comments.parentId,
        replyToUserId: comments.replyToUserId,
        timestampSeconds: comments.timestampSeconds,
        content: comments.content,
        likesCount: comments.likesCount,
        dislikesCount: comments.dislikesCount,
        repliesCount: comments.repliesCount,
        isEdited: comments.isEdited,
        isPinned: comments.isPinned,
        deletedAt: comments.deletedAt,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(baseWhere)
      .orderBy(...orderClauses)
      .limit(limit)
      .offset(offset);

    const rootCommentIds = rootCommentRows.map((c) => c.id);

    // Fetch top 2 preview replies for each root comment
    let previewRepliesRows: any[] = [];
    if (rootCommentIds.length > 0) {
      previewRepliesRows = await db
        .select({
          id: comments.id,
          userId: comments.userId,
          userName: users.displayName,
          userAvatarUrl: users.avatarUrl,
          songId: comments.songId,
          albumId: comments.albumId,
          playlistId: comments.playlistId,
          parentId: comments.parentId,
          replyToUserId: comments.replyToUserId,
          timestampSeconds: comments.timestampSeconds,
          content: comments.content,
          likesCount: comments.likesCount,
          dislikesCount: comments.dislikesCount,
          repliesCount: comments.repliesCount,
          isEdited: comments.isEdited,
          isPinned: comments.isPinned,
          deletedAt: comments.deletedAt,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
        })
        .from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .where(
          and(
            inArray(comments.parentId, rootCommentIds),
            isNull(comments.deletedAt)
          )
        )
        .orderBy(asc(comments.createdAt));
    }

    // Collect all comment IDs for vote resolution
    const allCommentIds = [
      ...rootCommentIds,
      ...previewRepliesRows.map((r) => r.id),
    ];
    const voteMap = await this.getVotesForComments(currentUserId, allCommentIds);

    // Map replies by parentId
    const repliesMap = new Map<string, EnrichedComment[]>();
    for (const reply of previewRepliesRows) {
      const isDeleted = !!reply.deletedAt;
      const enrichedReply: EnrichedComment = {
        id: reply.id,
        userId: isDeleted ? "" : reply.userId,
        userName: isDeleted ? "User" : reply.userName,
        userAvatarUrl: isDeleted ? null : reply.userAvatarUrl,
        songId: reply.songId,
        albumId: reply.albumId,
        playlistId: reply.playlistId,
        parentId: reply.parentId,
        replyToUserId: reply.replyToUserId,
        timestampSeconds: reply.timestampSeconds,
        content: isDeleted ? "[Comment deleted]" : reply.content,
        likesCount: reply.likesCount,
        dislikesCount: reply.dislikesCount,
        repliesCount: reply.repliesCount,
        isEdited: reply.isEdited,
        isPinned: reply.isPinned,
        isDeleted,
        userVote: voteMap.get(reply.id) ?? null,
        canEdit: !!(currentUserId && currentUserId === reply.userId && !isDeleted),
        canDelete: !!(
          currentUserId &&
          (currentUserId === reply.userId ||
            currentUserId === targetInfo.ownerUserId ||
            currentUserRole === "ADMIN")
        ),
        canPin: false,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
      };

      const existing = repliesMap.get(reply.parentId) || [];
      if (existing.length < 2) {
        existing.push(enrichedReply);
        repliesMap.set(reply.parentId, existing);
      }
    }

    const data: EnrichedComment[] = rootCommentRows.map((c) => {
      const isDeleted = !!c.deletedAt;
      return {
        id: c.id,
        userId: isDeleted ? "" : c.userId,
        userName: isDeleted ? "User" : c.userName,
        userAvatarUrl: isDeleted ? null : c.userAvatarUrl,
        songId: c.songId,
        albumId: c.albumId,
        playlistId: c.playlistId,
        parentId: null,
        replyToUserId: null,
        timestampSeconds: c.timestampSeconds,
        content: isDeleted ? "[Comment deleted]" : c.content,
        likesCount: c.likesCount,
        dislikesCount: c.dislikesCount,
        repliesCount: c.repliesCount,
        isEdited: c.isEdited,
        isPinned: c.isPinned,
        isDeleted,
        userVote: voteMap.get(c.id) ?? null,
        canEdit: !!(currentUserId && currentUserId === c.userId && !isDeleted),
        canDelete: !!(
          currentUserId &&
          (currentUserId === c.userId ||
            currentUserId === targetInfo.ownerUserId ||
            currentUserRole === "ADMIN")
        ),
        canPin: !!(currentUserId && currentUserId === targetInfo.ownerUserId),
        previewReplies: repliesMap.get(c.id) || [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    const total = countRow?.count ?? 0;
    return {
      data,
      comments: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      allowComments: targetInfo.allowComments,
    };
  }

  /**
   * Retrieves paginated child replies for a specific parent comment.
   */
  async getReplies(
    commentId: string,
    query: ListRepliesQuery,
    currentUserId?: string,
    currentUserRole?: string
  ): Promise<{
    data: EnrichedComment[];
    replies?: EnrichedComment[];
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
  }> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [parent] = await db
      .select({
        id: comments.id,
        songId: comments.songId,
        albumId: comments.albumId,
        playlistId: comments.playlistId,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (!parent) throw new Error("Parent comment not found");

    const targetInfo = await this.getTargetEntity({
      songId: parent.songId ?? undefined,
      albumId: parent.albumId ?? undefined,
      playlistId: parent.playlistId ?? undefined,
    });

    const whereClause = and(
      eq(comments.parentId, commentId),
      isNull(comments.deletedAt)
    );

    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(comments)
      .where(whereClause);

    const replyRows = await db
      .select({
        id: comments.id,
        userId: comments.userId,
        userName: users.displayName,
        userAvatarUrl: users.avatarUrl,
        songId: comments.songId,
        albumId: comments.albumId,
        playlistId: comments.playlistId,
        parentId: comments.parentId,
        replyToUserId: comments.replyToUserId,
        timestampSeconds: comments.timestampSeconds,
        content: comments.content,
        likesCount: comments.likesCount,
        dislikesCount: comments.dislikesCount,
        repliesCount: comments.repliesCount,
        isEdited: comments.isEdited,
        isPinned: comments.isPinned,
        deletedAt: comments.deletedAt,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(whereClause)
      .orderBy(asc(comments.createdAt))
      .limit(limit)
      .offset(offset);

    const replyIds = replyRows.map((r) => r.id);
    const voteMap = await this.getVotesForComments(currentUserId, replyIds);

    const data: EnrichedComment[] = replyRows.map((r) => {
      const isDeleted = !!r.deletedAt;
      return {
        id: r.id,
        userId: isDeleted ? "" : r.userId,
        userName: isDeleted ? "User" : r.userName,
        userAvatarUrl: isDeleted ? null : r.userAvatarUrl,
        songId: r.songId,
        albumId: r.albumId,
        playlistId: r.playlistId,
        parentId: r.parentId,
        replyToUserId: r.replyToUserId,
        timestampSeconds: r.timestampSeconds,
        content: isDeleted ? "[Comment deleted]" : r.content,
        likesCount: r.likesCount,
        dislikesCount: r.dislikesCount,
        repliesCount: r.repliesCount,
        isEdited: r.isEdited,
        isPinned: r.isPinned,
        isDeleted,
        userVote: voteMap.get(r.id) ?? null,
        canEdit: !!(currentUserId && currentUserId === r.userId && !isDeleted),
        canDelete: !!(
          currentUserId &&
          (currentUserId === r.userId ||
            currentUserId === targetInfo.ownerUserId ||
            currentUserRole === "ADMIN")
        ),
        canPin: false,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    const total = countRow?.count ?? 0;
    return {
      data,
      replies: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Creates a root comment or a reply, enforcing 2-level nesting and creator comments permission.
   */
  async createComment(
    userId: string,
    input: CreateCommentInput
  ): Promise<EnrichedComment> {
    const targetInfo = await this.getTargetEntity({
      songId: input.songId,
      albumId: input.albumId,
      playlistId: input.playlistId,
    });

    if (!targetInfo.exists) {
      throw new Error("Target entity not found");
    }

    if (!targetInfo.allowComments) {
      throw new Error("Comments have been disabled for this release/playlist");
    }

    let resolvedParentId: string | null = null;
    let resolvedReplyToUserId: string | null = input.replyToUserId ?? null;

    if (input.parentId) {
      const [parent] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, input.parentId))
        .limit(1);

      if (!parent) throw new Error("Parent comment not found");

      // 2-Level Nesting Rule:
      // If the parent is already a reply, flatten it under the root comment!
      if (parent.parentId) {
        resolvedParentId = parent.parentId;
        resolvedReplyToUserId = parent.userId;
      } else {
        resolvedParentId = parent.id;
        resolvedReplyToUserId = input.replyToUserId ?? parent.userId;
      }
    }

    const [user] = await db
      .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const created = await db.transaction(async (tx) => {
      const [newComment] = await tx
        .insert(comments)
        .values({
          userId,
          songId: input.songId ?? null,
          albumId: input.albumId ?? null,
          playlistId: input.playlistId ?? null,
          parentId: resolvedParentId,
          replyToUserId: resolvedReplyToUserId,
          timestampSeconds: input.timestampSeconds ?? null,
          content: input.content,
        })
        .returning();

      // Increment parent's repliesCount if it's a reply
      if (resolvedParentId) {
        await tx
          .update(comments)
          .set({ repliesCount: sql`${comments.repliesCount} + 1` })
          .where(eq(comments.id, resolvedParentId));
      }

      return newComment;
    });

    return {
      id: created.id,
      userId: created.userId,
      userName: user?.displayName ?? "User",
      userAvatarUrl: user?.avatarUrl ?? null,
      songId: created.songId,
      albumId: created.albumId,
      playlistId: created.playlistId,
      parentId: created.parentId,
      replyToUserId: created.replyToUserId,
      timestampSeconds: created.timestampSeconds,
      content: created.content,
      likesCount: created.likesCount,
      dislikesCount: created.dislikesCount,
      repliesCount: created.repliesCount,
      isEdited: created.isEdited,
      isPinned: created.isPinned,
      isDeleted: false,
      userVote: null,
      canEdit: true,
      canDelete: true,
      canPin: userId === targetInfo.ownerUserId,
      previewReplies: [],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Updates an existing comment's content, setting isEdited to true.
   */
  async updateComment(
    userId: string,
    commentId: string,
    input: UpdateCommentInput
  ): Promise<EnrichedComment> {
    const [existing] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (!existing) throw new Error("Comment not found");
    if (existing.deletedAt) throw new Error("Cannot edit a deleted comment");
    if (existing.userId !== userId) throw new Error("You can only edit your own comment");

    const [updated] = await db
      .update(comments)
      .set({
        content: input.content,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId))
      .returning();

    const [user] = await db
      .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      id: updated.id,
      userId: updated.userId,
      userName: user?.displayName ?? "User",
      userAvatarUrl: user?.avatarUrl ?? null,
      songId: updated.songId,
      albumId: updated.albumId,
      playlistId: updated.playlistId,
      parentId: updated.parentId,
      replyToUserId: updated.replyToUserId,
      timestampSeconds: updated.timestampSeconds,
      content: updated.content,
      likesCount: updated.likesCount,
      dislikesCount: updated.dislikesCount,
      repliesCount: updated.repliesCount,
      isEdited: updated.isEdited,
      isPinned: updated.isPinned,
      isDeleted: false,
      userVote: null,
      canEdit: true,
      canDelete: true,
      canPin: false,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Deletes or soft-deletes a comment (author, target entity owner, or admin).
   */
  async deleteComment(
    userId: string,
    commentId: string,
    userRole?: string
  ): Promise<{ success: boolean; softDeleted: boolean }> {
    const [existing] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (!existing) throw new Error("Comment not found");

    const targetInfo = await this.getTargetEntity({
      songId: existing.songId ?? undefined,
      albumId: existing.albumId ?? undefined,
      playlistId: existing.playlistId ?? undefined,
    });

    const isAuthor = existing.userId === userId;
    const isOwner = targetInfo.ownerUserId === userId;
    const isAdmin = userRole === "ADMIN";

    if (!isAuthor && !isOwner && !isAdmin) {
      throw new Error("You do not have permission to delete this comment");
    }

    if (existing.repliesCount > 0) {
      // Soft-delete to preserve reply thread tree
      await db
        .update(comments)
        .set({
          deletedAt: new Date(),
          content: "[Comment deleted]",
        })
        .where(eq(comments.id, commentId));

      return { success: true, softDeleted: true };
    } else {
      // Hard-delete when leaf node
      await db.transaction(async (tx) => {
        await tx.delete(comments).where(eq(comments.id, commentId));

        if (existing.parentId) {
          await tx
            .update(comments)
            .set({
              repliesCount: sql`GREATEST(0, ${comments.repliesCount} - 1)`,
            })
            .where(eq(comments.id, existing.parentId));
        }
      });

      return { success: true, softDeleted: false };
    }
  }

  /**
   * Casts or toggles a vote (+1, -1, 0) with ACID DB updates and Redis hash synchronization.
   */
  async voteComment(
    userId: string,
    commentId: string,
    vote: number
  ): Promise<{
    commentId: string;
    userVote: 1 | -1 | null;
    vote: 1 | -1 | null;
    likesCount: number;
    dislikesCount: number;
  }> {
    const [comment] = await db
      .select({ id: comments.id, deletedAt: comments.deletedAt })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (!comment) throw new Error("Comment not found");
    if (comment.deletedAt) throw new Error("Cannot vote on a deleted comment");

    const targetVote = vote === 1 ? 1 : vote === -1 ? -1 : 0;

    const result = await db.transaction(async (tx) => {
      const [existingVote] = await tx
        .select()
        .from(commentVotes)
        .where(
          and(
            eq(commentVotes.userId, userId),
            eq(commentVotes.commentId, commentId)
          )
        )
        .limit(1);

      const currentVote = existingVote ? existingVote.vote : 0;

      let likesDelta = 0;
      let dislikesDelta = 0;

      if (currentVote === 1) {
        if (targetVote === 0) {
          likesDelta = -1;
        } else if (targetVote === -1) {
          likesDelta = -1;
          dislikesDelta = 1;
        }
      } else if (currentVote === -1) {
        if (targetVote === 0) {
          dislikesDelta = -1;
        } else if (targetVote === 1) {
          dislikesDelta = -1;
          likesDelta = 1;
        }
      } else {
        // currentVote === 0
        if (targetVote === 1) {
          likesDelta = 1;
        } else if (targetVote === -1) {
          dislikesDelta = 1;
        }
      }

      // Update commentVotes table
      if (targetVote === 0) {
        if (existingVote) {
          await tx
            .delete(commentVotes)
            .where(
              and(
                eq(commentVotes.userId, userId),
                eq(commentVotes.commentId, commentId)
              )
            );
        }
      } else {
        if (existingVote) {
          await tx
            .update(commentVotes)
            .set({ vote: targetVote, updatedAt: new Date() })
            .where(
              and(
                eq(commentVotes.userId, userId),
                eq(commentVotes.commentId, commentId)
              )
            );
        } else {
          await tx.insert(commentVotes).values({
            userId,
            commentId,
            vote: targetVote,
          });
        }
      }

      // Atomically update likes/dislikes counts
      const [updatedComment] = await tx
        .update(comments)
        .set({
          likesCount: sql`GREATEST(0, ${comments.likesCount} + ${likesDelta})`,
          dislikesCount: sql`GREATEST(0, ${comments.dislikesCount} + ${dislikesDelta})`,
        })
        .where(eq(comments.id, commentId))
        .returning({
          likesCount: comments.likesCount,
          dislikesCount: comments.dislikesCount,
        });

      return {
        userVote: targetVote === 0 ? null : (targetVote as 1 | -1),
        likesCount: updatedComment.likesCount,
        dislikesCount: updatedComment.dislikesCount,
      };
    });

    // Synchronize Redis hash for sub-millisecond status checks
    const key = cacheKeys.social.userCommentVotes(userId);
    try {
      if (targetVote === 0) {
        await redis.hdel(key, commentId);
      } else {
        await redis.hset(key, commentId, targetVote.toString());
      }
      await redis.expire(key, 86400 * 7);
    } catch (err) {
      console.warn("[CommentsService] Redis HSET/HDEL failed for vote sync:", err);
    }

    return {
      commentId,
      userVote: result.userVote,
      vote: result.userVote,
      likesCount: result.likesCount,
      dislikesCount: result.dislikesCount,
    };
  }

  /**
   * Toggles pinned status for a root comment (entity creator only).
   */
  async pinComment(
    userId: string,
    commentId: string
  ): Promise<{ commentId: string; isPinned: boolean }> {
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (!comment) throw new Error("Comment not found");
    if (comment.parentId) throw new Error("Only top-level comments can be pinned");

    const targetInfo = await this.getTargetEntity({
      songId: comment.songId ?? undefined,
      albumId: comment.albumId ?? undefined,
      playlistId: comment.playlistId ?? undefined,
    });

    if (targetInfo.ownerUserId !== userId) {
      throw new Error("Only the creator of this release/playlist can pin comments");
    }

    const nextPinned = !comment.isPinned;

    await db.transaction(async (tx) => {
      if (nextPinned) {
        // Unpin any previously pinned comment on this target
        const targetCondition = comment.songId
          ? eq(comments.songId, comment.songId)
          : comment.albumId
          ? eq(comments.albumId, comment.albumId)
          : eq(comments.playlistId, comment.playlistId!);

        await tx
          .update(comments)
          .set({ isPinned: false })
          .where(and(targetCondition, eq(comments.isPinned, true)));
      }

      await tx
        .update(comments)
        .set({ isPinned: nextPinned })
        .where(eq(comments.id, commentId));
    });

    return { commentId, isPinned: nextPinned };
  }

  /**
   * Fast sync endpoint for client hydration: returns all user's active votes as a map.
   */
  async getUserVotes(userId: string): Promise<Record<string, 1 | -1>> {
    const key = cacheKeys.social.userCommentVotes(userId);
    try {
      const cached = await redis.hgetall(key);
      if (cached && Object.keys(cached).length > 0) {
        const result: Record<string, 1 | -1> = {};
        for (const [id, val] of Object.entries(cached)) {
          if (val === "1" || val === "-1") {
            result[id] = parseInt(val, 10) as 1 | -1;
          }
        }
        return result;
      }
    } catch (err) {
      console.warn("[CommentsService] Redis HGETALL failed:", err);
    }

    // Fallback to PostgreSQL & repopulate Redis
    const rows = await db
      .select({ commentId: commentVotes.commentId, vote: commentVotes.vote })
      .from(commentVotes)
      .where(eq(commentVotes.userId, userId));

    const result: Record<string, 1 | -1> = {};
    if (rows.length > 0) {
      const kv: Record<string, string> = {};
      for (const row of rows) {
        result[row.commentId] = row.vote as 1 | -1;
        kv[row.commentId] = row.vote.toString();
      }

      try {
        await redis.hset(key, kv);
        await redis.expire(key, 86400 * 7);
      } catch (err) {
        console.warn("[CommentsService] Redis repopulation failed:", err);
      }
    }

    return result;
  }
}

export const commentsService = new CommentsService();
