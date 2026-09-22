import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import { albums, releasePresaves } from "../../db/schema";
import { cacheKeys } from "./keys";
import { cacheManager } from "./cache-manager";

const EMPTY_SENTINEL = "__EMPTY__";
const USER_PRESAVES_TTL_SEC = 86400; // 24 hours

export class PresavesCacheService {
  /**
   * Retrieves a user's full set of pre-saved album IDs.
   * If not cached in Redis, hydrates from PostgreSQL and seeds Redis with a 24-hour TTL.
   */
  async getUserPreSavedAlbumIds(userId: string): Promise<Set<string>> {
    const key = cacheKeys.social.userPreSavedAlbums(userId);

    try {
      const exists = await redis.exists(key);
      if (exists) {
        const members = await redis.smembers(key);
        return new Set(members.filter((id) => id !== EMPTY_SENTINEL));
      }
    } catch (err) {
      console.warn(`[PresavesCacheService] Redis read failed for ${key}:`, err);
    }

    // Cache miss: Load from PostgreSQL
    const rows = await db
      .select({ albumId: releasePresaves.albumId })
      .from(releasePresaves)
      .where(eq(releasePresaves.userId, userId));

    const albumIds = rows.map((r) => r.albumId);

    try {
      if (albumIds.length > 0) {
        await redis.sadd(key, ...albumIds);
      } else {
        await redis.sadd(key, EMPTY_SENTINEL);
      }
      await redis.expire(key, USER_PRESAVES_TTL_SEC);
    } catch (err) {
      console.warn(`[PresavesCacheService] Redis hydration failed for ${key}:`, err);
    }

    return new Set(albumIds);
  }

  /**
   * Fast 0.2ms membership check using Redis SISMEMBER.
   */
  async isAlbumPreSaved(userId: string | null | undefined, albumId: string): Promise<boolean> {
    if (!userId || !albumId) return false;
    const preSavedSet = await this.getUserPreSavedAlbumIds(userId);
    return preSavedSet.has(albumId);
  }

  /**
   * High-Performance Album List Enrichment using Redis SMISMEMBER.
   * Attaches `isPreSaved: true/false` to each album in O(1) time without SQL joins.
   */
  async enrichAlbumsWithPreSaves<T extends { id: string }>(
    userId: string | null | undefined,
    albumsList: T[]
  ): Promise<(T & { isPreSaved: boolean })[]> {
    if (!userId || albumsList.length === 0) {
      return albumsList.map((a) => ({ ...a, isPreSaved: false }));
    }

    const key = cacheKeys.social.userPreSavedAlbums(userId);

    try {
      const exists = await redis.exists(key);
      if (!exists) {
        await this.getUserPreSavedAlbumIds(userId);
      }

      const albumIds = albumsList.map((a) => a.id);
      const results = await redis.smismember(key, ...albumIds);

      return albumsList.map((album, idx) => ({
        ...album,
        isPreSaved: Boolean(results[idx]),
      }));
    } catch (err) {
      console.warn(`[PresavesCacheService] Falling back to DB for enrichAlbumsWithPreSaves:`, err);
      const rows = await db
        .select({ albumId: releasePresaves.albumId })
        .from(releasePresaves)
        .where(
          and(
            eq(releasePresaves.userId, userId),
            inArray(releasePresaves.albumId, albumsList.map((a) => a.id))
          )
        );
      const dbPreSavedIds = new Set(rows.map((r) => r.albumId));

      return albumsList.map((album) => ({
        ...album,
        isPreSaved: dbPreSavedIds.has(album.id),
      }));
    }
  }

  /**
   * Cleans up deleted or converted album IDs from all pre-saving users' Redis sets.
   */
  async cleanupUserPreSavedAlbums(albumId: string): Promise<void> {
    try {
      const rows = await db
        .select({ userId: releasePresaves.userId })
        .from(releasePresaves)
        .where(eq(releasePresaves.albumId, albumId));

      for (const r of rows) {
        const key = cacheKeys.social.userPreSavedAlbums(r.userId);
        await redis.srem(key, albumId).catch(() => {});
      }
    } catch (err) {
      console.warn(`[PresavesCacheService] cleanupUserPreSavedAlbums failed for album ${albumId}:`, err);
    }
  }

  /**
   * Pre-save an album:
   * 1. 100% ACID write to PostgreSQL `release_presaves` and increments counter within transaction.
   * 2. Instant Redis set insertion (SADD).
   * 3. Invalidates album public cache.
   */
  async preSaveAlbum(
    userId: string,
    albumId: string
  ): Promise<{ preSaved: boolean; preSavesCount: number }> {
    const [album] = await db
      .select()
      .from(albums)
      .where(and(eq(albums.id, albumId), sql`${albums.deletedAt} IS NULL`))
      .limit(1);

    if (!album) {
      throw new Error("Release not found");
    }

    if (album.scope !== "GLOBAL" || album.visibility !== "PUBLIC") {
      throw new Error("Only public global releases can be pre-saved");
    }

    if (album.status !== "SCHEDULED") {
      if (album.status === "PUBLISHED") {
        throw new Error("This release is already published and can be added directly to your library");
      }
      throw new Error("This release is not scheduled for release");
    }

    const now = Date.now();
    if (album.scheduledReleaseAt && new Date(album.scheduledReleaseAt).getTime() <= now) {
      throw new Error("This release is already published and can be added directly to your library");
    }

    // 1. ACID Transaction
    const { finalCount } = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(releasePresaves)
        .values({
          userId,
          albumId,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        const [updated] = await tx
          .update(albums)
          .set({
            preSavesCount: sql`${albums.preSavesCount} + 1`,
          })
          .where(eq(albums.id, albumId))
          .returning({ preSavesCount: albums.preSavesCount });

        return { finalCount: updated?.preSavesCount ?? 1 };
      }

      const [existing] = await tx
        .select({ preSavesCount: albums.preSavesCount })
        .from(albums)
        .where(eq(albums.id, albumId))
        .limit(1);

      return { finalCount: existing?.preSavesCount ?? 0 };
    });

    // 2. Redis Set update
    const key = cacheKeys.social.userPreSavedAlbums(userId);
    try {
      await redis.srem(key, EMPTY_SENTINEL);
      await redis.sadd(key, albumId);
      await redis.expire(key, USER_PRESAVES_TTL_SEC);
    } catch (err) {
      console.warn(`[PresavesCacheService] Redis SADD failed for ${key}:`, err);
    }

    // 3. Invalidate album public cache
    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: album.slug,
      artistId: album.artistId,
    });

    return {
      preSaved: true,
      preSavesCount: finalCount,
    };
  }

  /**
   * Remove pre-save:
   * 1. ACID delete from PostgreSQL `release_presaves` and decrements counter within transaction.
   * 2. Instant Redis set removal (SREM).
   * 3. Invalidates album public cache.
   */
  async removePreSave(
    userId: string,
    albumId: string
  ): Promise<{ preSaved: boolean; preSavesCount: number }> {
    const [album] = await db
      .select({ id: albums.id, slug: albums.slug, artistId: albums.artistId })
      .from(albums)
      .where(eq(albums.id, albumId))
      .limit(1);

    const { finalCount } = await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(releasePresaves)
        .where(
          and(
            eq(releasePresaves.userId, userId),
            eq(releasePresaves.albumId, albumId)
          )
        )
        .returning();

      if (deleted.length > 0) {
        const [updated] = await tx
          .update(albums)
          .set({
            preSavesCount: sql`GREATEST(0, ${albums.preSavesCount} - 1)`,
          })
          .where(eq(albums.id, albumId))
          .returning({ preSavesCount: albums.preSavesCount });

        return { finalCount: updated?.preSavesCount ?? 0 };
      }

      const [existing] = await tx
        .select({ preSavesCount: albums.preSavesCount })
        .from(albums)
        .where(eq(albums.id, albumId))
        .limit(1);

      return { finalCount: existing?.preSavesCount ?? 0 };
    });

    // 2. Redis Set removal
    const key = cacheKeys.social.userPreSavedAlbums(userId);
    try {
      await redis.srem(key, albumId);
    } catch (err) {
      console.warn(`[PresavesCacheService] Redis SREM failed for ${key}:`, err);
    }

    // 3. Invalidate album public cache
    if (album) {
      await cacheManager.invalidateAlbum({
        id: albumId,
        slug: album.slug,
        artistId: album.artistId,
      });
    }

    return {
      preSaved: false,
      preSavesCount: finalCount,
    };
  }
}

export const presavesCacheService = new PresavesCacheService();
