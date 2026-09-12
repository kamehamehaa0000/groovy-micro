import { redis } from "../../db/redis";
import { cacheKeys } from "./keys";

const NOT_FOUND_SENTINEL = "__GROOVY_NOT_FOUND__";
const DEFAULT_TTL_SECONDS = 600; // 10 minutes

export class CacheManager {
  /**
   * Retrieves an item from Redis and deserializes it from JSON.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      if (raw === NOT_FOUND_SENTINEL) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[CacheManager] Failed to get key "${key}":`, err);
      return null;
    }
  }

  /**
   * Serializes an item to JSON and stores it in Redis with a TTL.
   */
  async set<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await redis.set(key, serialized, "EX", ttlSeconds);
      } else {
        await redis.set(key, serialized);
      }
    } catch (err) {
      console.warn(`[CacheManager] Failed to set key "${key}":`, err);
    }
  }

  /**
   * Standard Cache-Aside pattern with Single-Flight Stampede (Mutex Lock) Protection.
   *
   * If the key is cached, returns immediately.
   * If cache misses:
   * 1. Attempts to acquire a 5-second distributed mutex lock in Redis.
   * 2. If acquired, invokes fetcher(), stores in Redis, and unlocks.
   * 3. If lock was already held by a concurrent request, waits 50ms and re-reads from Redis.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T | null>,
    ttlSeconds = DEFAULT_TTL_SECONDS
  ): Promise<T | null> {
    // 1. Check existing cache
    const existing = await this.get<T>(key);
    if (existing !== null) {
      return existing;
    }

    // 2. Check if cached as not found
    try {
      const raw = await redis.get(key);
      if (raw === NOT_FOUND_SENTINEL) {
        return null;
      }
    } catch {}

    // 3. Single-Flight Mutex Lock
    const lockKey = `lock:${key}`;
    let lockAcquired = false;

    try {
      const lockRes = await redis.set(lockKey, "1", "NX", "EX", 5);
      lockAcquired = lockRes === "OK";
    } catch {
      // If redis lock fails, continue and execute fetcher directly
    }

    if (!lockAcquired) {
      // Another worker is already fetching; pause 60ms and retry reading
      await new Promise((resolve) => setTimeout(resolve, 60));
      const secondCheck = await this.get<T>(key);
      if (secondCheck !== null) {
        return secondCheck;
      }
    }

    try {
      const fresh = await fetcher();

      if (fresh !== null && fresh !== undefined) {
        await this.set(key, fresh, ttlSeconds);
      } else {
        // Negative Caching: Cache missing values for 30s to prevent penetration attacks
        await redis.set(key, NOT_FOUND_SENTINEL, "EX", 30).catch(() => {});
      }

      return fresh;
    } finally {
      if (lockAcquired) {
        await redis.del(lockKey).catch(() => {});
      }
    }
  }

  /**
   * Deletes one or more cache keys from Redis safely.
   */
  async invalidate(...keys: (string | null | undefined)[]): Promise<number> {
    const validKeys = keys.filter((k): k is string => Boolean(k && k.trim()));
    if (validKeys.length === 0) return 0;

    try {
      return await redis.del(...validKeys);
    } catch (err) {
      console.warn(`[CacheManager] Invalidation error on keys:`, validKeys, err);
      return 0;
    }
  }

  // =========================================================================
  // COMPOUND ENTITY INVALIDATORS (Eliminates dual-slug / orphan cache bugs)
  // =========================================================================

  /**
   * Atomically invalidates an album by ID, vanity slug, and clears parent artist album tags.
   */
  async invalidateAlbum(input: {
    id: string;
    slug?: string | null;
    artistId?: string | null;
  }): Promise<void> {
    const keysToDelete: string[] = [cacheKeys.catalog.album(input.id)];

    if (input.slug) {
      keysToDelete.push(cacheKeys.catalog.albumSlug(input.slug));
    }

    if (input.artistId) {
      keysToDelete.push(
        cacheKeys.catalog.artist(input.artistId),
        cacheKeys.catalog.artistAlbumsTag(input.artistId)
      );
    }

    await this.invalidate(...keysToDelete);
  }

  /**
   * Atomically invalidates a song and its parent album.
   */
  async invalidateSong(input: {
    id: string;
    albumId?: string | null;
    albumSlug?: string | null;
    artistId?: string | null;
  }): Promise<void> {
    const keysToDelete: string[] = [cacheKeys.catalog.song(input.id)];

    if (input.albumId) {
      keysToDelete.push(cacheKeys.catalog.album(input.albumId));
    }
    if (input.albumSlug) {
      keysToDelete.push(cacheKeys.catalog.albumSlug(input.albumSlug));
    }
    if (input.artistId) {
      keysToDelete.push(cacheKeys.catalog.artist(input.artistId));
    }

    await this.invalidate(...keysToDelete);
  }

  /**
   * Atomically invalidates an artist by ID and vanity slug.
   */
  async invalidateArtist(input: {
    id: string;
    slug?: string | null;
  }): Promise<void> {
    const keysToDelete: string[] = [cacheKeys.catalog.artist(input.id)];

    if (input.slug) {
      keysToDelete.push(cacheKeys.catalog.artistSlug(input.slug));
    }

    await this.invalidate(...keysToDelete);
  }

  /**
   * Clears a user's cached liked songs and albums sets.
   */
  async invalidateUserLikes(userId: string): Promise<void> {
    await this.invalidate(
      cacheKeys.social.userLikedSongs(userId),
      cacheKeys.social.userLikedAlbums(userId)
    );
  }
}

export const cacheManager = new CacheManager();
