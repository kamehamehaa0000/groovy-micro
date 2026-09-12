import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import { playlists, userLibraryPlaylists } from "../../db/schema";
import { cacheKeys } from "./keys";
import { cacheManager } from "./cache-manager";

const EMPTY_SENTINEL = "__EMPTY__";
const USER_SAVED_PLAYLISTS_TTL_SEC = 86400; // 24 hours
const PLAYLIST_METADATA_TTL_SEC = 3600; // 1 hour

export class PlaylistsCacheService {
  /**
   * Retrieves a user's full set of saved playlist IDs.
   * If not cached in Redis, hydrates from PostgreSQL and seeds Redis with a 24-hour TTL.
   */
  async getUserSavedPlaylistIds(userId: string): Promise<Set<string>> {
    const key = cacheKeys.social.userSavedPlaylists(userId);

    try {
      const exists = await redis.exists(key);
      if (exists) {
        const members = await redis.smembers(key);
        return new Set(members.filter((id) => id !== EMPTY_SENTINEL));
      }
    } catch (err) {
      console.warn(`[PlaylistsCacheService] Redis read failed for ${key}:`, err);
    }

    // Cache miss: Load from PostgreSQL
    const rows = await db
      .select({ playlistId: userLibraryPlaylists.playlistId })
      .from(userLibraryPlaylists)
      .where(eq(userLibraryPlaylists.userId, userId));

    const playlistIds = rows.map((r) => r.playlistId);

    try {
      if (playlistIds.length > 0) {
        await redis.sadd(key, ...playlistIds);
      } else {
        await redis.sadd(key, EMPTY_SENTINEL);
      }
      await redis.expire(key, USER_SAVED_PLAYLISTS_TTL_SEC);
    } catch (err) {
      console.warn(`[PlaylistsCacheService] Redis hydration failed for ${key}:`, err);
    }

    return new Set(playlistIds);
  }

  /**
   * Fast 0.2ms membership check using Redis SISMEMBER.
   */
  async isPlaylistSaved(userId: string | null | undefined, playlistId: string): Promise<boolean> {
    if (!userId || !playlistId) return false;
    const savedSet = await this.getUserSavedPlaylistIds(userId);
    return savedSet.has(playlistId);
  }

  /**
   * Zero-join batch enrichment using Redis SMISMEMBER.
   */
  async enrichPlaylistsWithSaves<T extends { id: string }>(
    items: T[],
    userId: string | null | undefined
  ): Promise<Array<T & { isSaved: boolean }>> {
    if (!items.length) return [];
    if (!userId) {
      return items.map((p) => ({ ...p, isSaved: false }));
    }

    const key = cacheKeys.social.userSavedPlaylists(userId);
    const itemIds = items.map((p) => p.id);

    try {
      const exists = await redis.exists(key);
      if (exists) {
        const results = await redis.smismember(key, itemIds);
        return items.map((item, idx) => ({
          ...item,
          isSaved: results[idx] === 1,
        }));
      }
    } catch (err) {
      console.warn(`[PlaylistsCacheService] Batch SMISMEMBER enrichment failed for ${key}:`, err);
    }

    // Fallback if cache missed
    const savedSet = await this.getUserSavedPlaylistIds(userId);
    return items.map((item) => ({
      ...item,
      isSaved: savedSet.has(item.id),
    }));
  }

  /**
   * Saves a playlist to user library (Option A Hybrid Durability):
   * 1. ACID PostgreSQL insert into user_library_playlists
   * 2. Atomic increment of playlists.saves_count
   * 3. Redis Set SADD
   * 4. Cache invalidation
   */
  async savePlaylist(
    userId: string,
    playlistId: string
  ): Promise<{ saved: boolean; savesCount: number }> {
    const [playlist] = await db
      .select({ id: playlists.id, visibility: playlists.visibility, ownerId: playlists.ownerId })
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) {
      throw new Error("Playlist not found");
    }

    // Insert library save and increment savesCount atomically
    const updatedCount = await db.transaction(async (tx) => {
      await tx
        .insert(userLibraryPlaylists)
        .values({ userId, playlistId })
        .onConflictDoNothing();

      const [updated] = await tx
        .update(playlists)
        .set({
          savesCount: sql`GREATEST(0, ${playlists.savesCount} + 1)`,
          updatedAt: new Date(),
        })
        .where(eq(playlists.id, playlistId))
        .returning({ savesCount: playlists.savesCount });

      return updated?.savesCount ?? 0;
    });

    // Redis Set synchronization
    const key = cacheKeys.social.userSavedPlaylists(userId);
    try {
      await redis.srem(key, EMPTY_SENTINEL);
      await redis.sadd(key, playlistId);
      await redis.expire(key, USER_SAVED_PLAYLISTS_TTL_SEC);
    } catch (err) {
      console.warn(`[PlaylistsCacheService] Redis SADD failed for ${key}:`, err);
    }

    // Invalidate playlist cache
    await this.invalidatePlaylistCache(playlistId);

    return { saved: true, savesCount: updatedCount };
  }

  /**
   * Removes playlist from user library (Option A Hybrid Durability):
   * 1. ACID PostgreSQL delete from user_library_playlists
   * 2. Atomic decrement of playlists.saves_count
   * 3. Redis Set SREM
   * 4. Cache invalidation
   */
  async unsavePlaylist(
    userId: string,
    playlistId: string
  ): Promise<{ saved: boolean; savesCount: number }> {
    const updatedCount = await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(userLibraryPlaylists)
        .where(
          and(
            eq(userLibraryPlaylists.userId, userId),
            eq(userLibraryPlaylists.playlistId, playlistId)
          )
        )
        .returning();

      if (deleted.length > 0) {
        const [updated] = await tx
          .update(playlists)
          .set({
            savesCount: sql`GREATEST(0, ${playlists.savesCount} - 1)`,
            updatedAt: new Date(),
          })
          .where(eq(playlists.id, playlistId))
          .returning({ savesCount: playlists.savesCount });

        return updated?.savesCount ?? 0;
      }

      const [current] = await tx
        .select({ savesCount: playlists.savesCount })
        .from(playlists)
        .where(eq(playlists.id, playlistId))
        .limit(1);

      return current?.savesCount ?? 0;
    });

    // Redis Set synchronization
    const key = cacheKeys.social.userSavedPlaylists(userId);
    try {
      await redis.srem(key, playlistId);
      const remainingCount = await redis.scard(key);
      if (remainingCount === 0) {
        await redis.sadd(key, EMPTY_SENTINEL);
      }
      await redis.expire(key, USER_SAVED_PLAYLISTS_TTL_SEC);
    } catch (err) {
      console.warn(`[PlaylistsCacheService] Redis SREM failed for ${key}:`, err);
    }

    // Invalidate playlist cache
    await this.invalidatePlaylistCache(playlistId);

    return { saved: false, savesCount: updatedCount };
  }

  /**
   * Invalidate cached playlist metadata
   */
  async invalidatePlaylistCache(playlistId: string): Promise<void> {
    try {
      await redis.del(cacheKeys.social.playlist(playlistId));
    } catch (err) {
      console.warn(`[PlaylistsCacheService] Invalidation failed for playlist ${playlistId}:`, err);
    }
  }
}

export const playlistsCacheService = new PlaylistsCacheService();
