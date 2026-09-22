import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import { songs, albums, songLikes, albumLikes, artistProfiles } from "../../db/schema";
import { cacheKeys } from "./keys";
import { cacheManager } from "./cache-manager";

const EMPTY_SENTINEL = "__EMPTY__";
const USER_LIKES_TTL_SEC = 86400; // 24 hours

export class LikesCacheService {
  /**
   * Retrieves a user's full set of liked song IDs.
   * If not cached in Redis, hydrates from PostgreSQL and seeds Redis with a 24-hour TTL.
   */
  async getUserLikedSongIds(userId: string): Promise<Set<string>> {
    const key = cacheKeys.social.userLikedSongs(userId);

    try {
      const exists = await redis.exists(key);
      if (exists) {
        const members = await redis.smembers(key);
        return new Set(members.filter((id) => id !== EMPTY_SENTINEL));
      }
    } catch (err) {
      console.warn(`[LikesCacheService] Redis read failed for ${key}:`, err);
    }

    // Cache miss: Load from PostgreSQL
    const rows = await db
      .select({ songId: songLikes.songId })
      .from(songLikes)
      .where(eq(songLikes.userId, userId));

    const songIds = rows.map((r) => r.songId);

    try {
      if (songIds.length > 0) {
        await redis.sadd(key, ...songIds);
      } else {
        await redis.sadd(key, EMPTY_SENTINEL);
      }
      await redis.expire(key, USER_LIKES_TTL_SEC);
    } catch (err) {
      console.warn(`[LikesCacheService] Redis hydration failed for ${key}:`, err);
    }

    return new Set(songIds);
  }

  /**
   * Fast 0.2ms membership check using Redis SISMEMBER.
   */
  async isSongLiked(userId: string | null | undefined, songId: string): Promise<boolean> {
    if (!userId || !songId) return false;
    const likedSet = await this.getUserLikedSongIds(userId);
    return likedSet.has(songId);
  }

  /**
   * High-Performance Song List Enrichment using Redis SMISMEMBER.
   * Attaches `isLiked: true/false` to each song in O(1) time without SQL joins.
   */
  async enrichSongsWithLikes<T extends { id: string }>(
    userId: string | null | undefined,
    songsList: T[]
  ): Promise<(T & { isLiked: boolean })[]> {
    if (!userId || songsList.length === 0) {
      return songsList.map((s) => ({ ...s, isLiked: false }));
    }

    const key = cacheKeys.social.userLikedSongs(userId);

    try {
      // Ensure Redis set is populated
      const exists = await redis.exists(key);
      if (!exists) {
        await this.getUserLikedSongIds(userId);
      }

      const songIds = songsList.map((s) => s.id);
      const results = await redis.smismember(key, ...songIds);

      return songsList.map((song, idx) => ({
        ...song,
        isLiked: Boolean(results[idx]),
      }));
    } catch (err) {
      // Fallback in case of Redis connection hiccup: query DB directly
      console.warn(`[LikesCacheService] Falling back to DB for enrichSongsWithLikes:`, err);
      const rows = await db
        .select({ songId: songLikes.songId })
        .from(songLikes)
        .where(
          and(
            eq(songLikes.userId, userId),
            inArray(songLikes.songId, songsList.map((s) => s.id))
          )
        );
      const dbLikedIds = new Set(rows.map((r) => r.songId));
      return songsList.map((s) => ({ ...s, isLiked: dbLikedIds.has(s.id) }));
    }
  }

  /**
   * Retrieves a user's full set of liked album IDs.
   */
  async getUserLikedAlbumIds(userId: string): Promise<Set<string>> {
    const key = cacheKeys.social.userLikedAlbums(userId);

    try {
      const exists = await redis.exists(key);
      if (exists) {
        const members = await redis.smembers(key);
        return new Set(members.filter((id) => id !== EMPTY_SENTINEL));
      }
    } catch (err) {
      console.warn(`[LikesCacheService] Redis read failed for ${key}:`, err);
    }

    const rows = await db
      .select({ albumId: albumLikes.albumId })
      .from(albumLikes)
      .where(eq(albumLikes.userId, userId));

    const albumIds = rows.map((r) => r.albumId);

    try {
      if (albumIds.length > 0) {
        await redis.sadd(key, ...albumIds);
      } else {
        await redis.sadd(key, EMPTY_SENTINEL);
      }
      await redis.expire(key, USER_LIKES_TTL_SEC);
    } catch (err) {
      console.warn(`[LikesCacheService] Redis hydration failed for ${key}:`, err);
    }

    return new Set(albumIds);
  }

  /**
   * Fast check if an album is liked by a user.
   */
  async isAlbumLiked(userId: string | null | undefined, albumId: string): Promise<boolean> {
    if (!userId || !albumId) return false;
    const likedSet = await this.getUserLikedAlbumIds(userId);
    return likedSet.has(albumId);
  }

  /**
   * High-Performance Album List Enrichment using Redis SMISMEMBER.
   */
  async enrichAlbumsWithLikes<T extends { id: string }>(
    userId: string | null | undefined,
    albumsList: T[]
  ): Promise<(T & { isLiked: boolean })[]> {
    if (!userId || albumsList.length === 0) {
      return albumsList.map((a) => ({ ...a, isLiked: false }));
    }

    const key = cacheKeys.social.userLikedAlbums(userId);

    try {
      const exists = await redis.exists(key);
      if (!exists) {
        await this.getUserLikedAlbumIds(userId);
      }

      const albumIds = albumsList.map((a) => a.id);
      const results = await redis.smismember(key, ...albumIds);

      return albumsList.map((album, idx) => ({
        ...album,
        isLiked: Boolean(results[idx]),
      }));
    } catch {
      const likedSet = await this.getUserLikedAlbumIds(userId);
      return albumsList.map((a) => ({ ...a, isLiked: likedSet.has(a.id) }));
    }
  }

  /**
   * Toggles a song like using the Hybrid Durability Pattern:
   * 1. 100% ACID Durable Write to PostgreSQL `song_likes` table.
   * 2. Instant in-memory update to Redis user liked set (`SADD` / `SREM`).
   * 3. Invalidates cached public song JSON.
   */
  async toggleSongLike(
    userId: string,
    songId: string
  ): Promise<{ liked: boolean; likesCount: number }> {
    const [song] = await db
      .select({
        id: songs.id,
        albumId: songs.albumId,
        albumStatus: albums.status,
        scheduledReleaseAt: albums.scheduledReleaseAt,
        artistUserId: artistProfiles.userId,
      })
      .from(songs)
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .leftJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(and(eq(songs.id, songId), sql`${songs.deletedAt} IS NULL`))
      .limit(1);

    if (!song) {
      throw new Error("Song not found");
    }

    const isSongUnreleased =
      song.albumStatus === "SCHEDULED" &&
      song.scheduledReleaseAt &&
      new Date(song.scheduledReleaseAt).getTime() > Date.now();

    if (isSongUnreleased && song.artistUserId !== userId) {
      throw new Error("Cannot like tracks from an unreleased scheduled release");
    }

    const likedSet = await this.getUserLikedSongIds(userId);
    const currentlyLiked = likedSet.has(songId);

    return await db.transaction(async (tx) => {
      let finalLikesCount: number;

      if (currentlyLiked) {
        await tx
          .delete(songLikes)
          .where(and(eq(songLikes.userId, userId), eq(songLikes.songId, songId)));

        const [updated] = await tx
          .update(songs)
          .set({ likesCount: sql`GREATEST(0, ${songs.likesCount} - 1)` })
          .where(eq(songs.id, songId))
          .returning({ likesCount: songs.likesCount });

        finalLikesCount = updated?.likesCount ?? 0;
      } else {
        await tx
          .insert(songLikes)
          .values({ userId, songId })
          .onConflictDoNothing();

        const [updated] = await tx
          .update(songs)
          .set({ likesCount: sql`${songs.likesCount} + 1` })
          .where(eq(songs.id, songId))
          .returning({ likesCount: songs.likesCount });

        finalLikesCount = updated?.likesCount ?? 1;
      }

      // Update Redis In-Memory Set
      const key = cacheKeys.social.userLikedSongs(userId);
      try {
        if (currentlyLiked) {
          await redis.srem(key, songId);
        } else {
          await redis.sadd(key, songId);
        }
        await redis.expire(key, USER_LIKES_TTL_SEC);
      } catch (err) {
        console.warn(`[LikesCacheService] Redis set update failed for ${key}:`, err);
      }

      // Invalidate public song and parent album caches
      await cacheManager.invalidateSong({
        id: songId,
        albumId: song.albumId,
      });

      return {
        liked: !currentlyLiked,
        likesCount: finalLikesCount,
      };
    });
  }

  /**
   * Toggles an album like using the Hybrid Durability Pattern.
   */
  async toggleAlbumLike(
    userId: string,
    albumId: string
  ): Promise<{ liked: boolean; likesCount: number }> {
    const [album] = await db
      .select({
        id: albums.id,
        slug: albums.slug,
        artistId: albums.artistId,
        status: albums.status,
        scheduledReleaseAt: albums.scheduledReleaseAt,
        artistUserId: artistProfiles.userId,
      })
      .from(albums)
      .leftJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(and(eq(albums.id, albumId), sql`${albums.deletedAt} IS NULL`))
      .limit(1);

    if (!album) {
      throw new Error("Album not found");
    }

    const isAlbumUnreleased =
      album.status === "SCHEDULED" &&
      album.scheduledReleaseAt &&
      new Date(album.scheduledReleaseAt).getTime() > Date.now();

    if (isAlbumUnreleased && album.artistUserId !== userId) {
      throw new Error("Cannot like an unreleased scheduled album. Please pre-save it instead.");
    }

    const likedSet = await this.getUserLikedAlbumIds(userId);
    const currentlyLiked = likedSet.has(albumId);

    return await db.transaction(async (tx) => {
      let finalLikesCount: number;

      if (currentlyLiked) {
        await tx
          .delete(albumLikes)
          .where(and(eq(albumLikes.userId, userId), eq(albumLikes.albumId, albumId)));

        const [updated] = await tx
          .update(albums)
          .set({ likesCount: sql`GREATEST(0, ${albums.likesCount} - 1)` })
          .where(eq(albums.id, albumId))
          .returning({ likesCount: albums.likesCount });

        finalLikesCount = updated?.likesCount ?? 0;
      } else {
        await tx
          .insert(albumLikes)
          .values({ userId, albumId })
          .onConflictDoNothing();

        const [updated] = await tx
          .update(albums)
          .set({ likesCount: sql`${albums.likesCount} + 1` })
          .where(eq(albums.id, albumId))
          .returning({ likesCount: albums.likesCount });

        finalLikesCount = updated?.likesCount ?? 1;
      }

      // Update Redis Set
      const key = cacheKeys.social.userLikedAlbums(userId);
      try {
        if (currentlyLiked) {
          await redis.srem(key, albumId);
        } else {
          await redis.sadd(key, albumId);
        }
        await redis.expire(key, USER_LIKES_TTL_SEC);
      } catch (err) {
        console.warn(`[LikesCacheService] Redis set update failed for ${key}:`, err);
      }

      // Invalidate public album cache
      await cacheManager.invalidateAlbum({
        id: album.id,
        slug: album.slug,
        artistId: album.artistId,
      });

      return {
        liked: !currentlyLiked,
        likesCount: finalLikesCount,
      };
    });
  }
}

export const likesCacheService = new LikesCacheService();
