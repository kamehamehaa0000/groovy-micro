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
      const lockRes = await redis.set(lockKey, "1", "EX", 5, "NX");
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
        cacheKeys.catalog.artistAlbumsTag(input.artistId),
        cacheKeys.catalog.artistOverview(input.artistId)
      );
    }

    await this.invalidate(...keysToDelete);
    await this.invalidateVisitorRecommendations();
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
      keysToDelete.push(
        cacheKeys.catalog.artist(input.artistId),
        cacheKeys.catalog.artistOverview(input.artistId)
      );
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
    const keysToDelete: string[] = [
      cacheKeys.catalog.artist(input.id),
      cacheKeys.catalog.artistOverview(input.id),
    ];

    if (input.slug) {
      keysToDelete.push(
        cacheKeys.catalog.artistSlug(input.slug),
        cacheKeys.catalog.artistOverviewSlug(input.slug)
      );
    }

    await this.invalidate(...keysToDelete);
  }

  /**
   * Invalidates the authenticated user's own composite profile (GET /auth/me).
   * Call after any write that changes the identity, preferences, subscription or
   * artist pointer that endpoint reports.
   */
  async invalidateSelfProfile(userId: string): Promise<void> {
    await this.invalidate(cacheKeys.profile.self(userId));
  }

  /**
   * Invalidates the owner's own artist view (GET /artists/me). The composite
   * profile is dropped too, because it embeds stageName, slug and verified.
   */
  async invalidateSelfArtist(userId: string): Promise<void> {
    await this.invalidate(
      cacheKeys.profile.selfArtist(userId),
      cacheKeys.profile.self(userId)
    );
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

  /**
   * Scans and non-blockingly unlinks all keys matching a specific pattern.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.unlink(...keys);
        }
      } while (cursor !== "0");
    } catch (err) {
      console.warn(
        `[CacheManager] Failed to scan & unlink pattern "${pattern}":`,
        err
      );
    }
  }

  /**
   * Invalidates visitor recommendations and unauthenticated home discovery shelves.
   */
  async invalidateVisitorRecommendations(): Promise<void> {
    await this.invalidate(
      cacheKeys.recommendations.homeFeed(null),
      cacheKeys.recommendations.newReleases(null),
      cacheKeys.recommendations.globalHits(null),
      cacheKeys.recommendations.similarArtists(null),
      cacheKeys.recommendations.moreLikeArtist(null),
      cacheKeys.recommendations.moreLikeSong(null),
      cacheKeys.recommendations.radioMixes(null)
    );
  }

  /**
   * Invalidates personalized recommendation and home feed shelves for a specific user.
   */
  async invalidateRecommendationsForUser(userId: string): Promise<void> {
    const modes = ["global", "mixed"];
    const keys: string[] = [];
    for (const mode of modes) {
      keys.push(
        cacheKeys.recommendations.homeFeed(userId, mode),
        cacheKeys.recommendations.newReleases(userId, mode),
        cacheKeys.recommendations.radar(userId, mode),
        cacheKeys.recommendations.globalHits(userId, mode),
        cacheKeys.recommendations.forYou(userId, mode),
        cacheKeys.recommendations.heavyRotation(userId, mode),
        cacheKeys.recommendations.radioMixes(userId, mode)
      );
    }
    keys.push(
      cacheKeys.recommendations.tasteProfile(userId),
      cacheKeys.recommendations.playlistAssisted(userId),
      cacheKeys.recommendations.userPlaylists(userId)
    );
    await this.invalidate(...keys);
  }

  /**
   * Invalidates global discovery & feed caches across the platform
   * (e.g. after an album is published, unpublished, deleted, or restored).
   */
  async invalidateGlobalDiscoveryFeeds(): Promise<void> {
    await this.invalidateVisitorRecommendations();
    await this.invalidatePattern("groovy:rec:home:*");
    await this.invalidatePattern("groovy:rec:new_rel:*");
    await this.invalidatePattern("groovy:rec:radar:*");
    await this.invalidatePattern("groovy:rec:hits:*");
  }
}

export const cacheManager = new CacheManager();
