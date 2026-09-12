import { redis } from "../../db/redis";
import { cacheKeys } from "./keys";

export interface CachedUserEntitlements {
  planId: string;
  planName: string;
  status: string;
  currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd: boolean;
  features: Record<string, boolean | number>;
}

const USER_ENTITLEMENTS_TTL_SEC = 3600; // 1 hour
const EMPTY_SENTINEL = "__NONE__";

export class EntitlementsCacheService {
  /**
   * Retrieves user's full cached entitlements result (JSON) from Redis.
   */
  async getUserCachedEntitlements(userId: string): Promise<CachedUserEntitlements | null> {
    const key = cacheKeys.subscriptions.userEntitlements(userId);
    try {
      const cached = await redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedUserEntitlements;
        if (parsed.currentPeriodEnd) {
          parsed.currentPeriodEnd = new Date(parsed.currentPeriodEnd);
        }
        return parsed;
      }
    } catch (err) {
      console.warn(`[EntitlementsCacheService] Redis get failed for ${key}:`, err);
    }
    return null;
  }

  /**
   * Caches resolved user entitlements both as JSON (for full payload & numeric thresholds)
   * and as a Redis Set (for sub-0.5ms SISMEMBER checks on boolean gates).
   */
  async setUserCachedEntitlements(userId: string, entitlements: CachedUserEntitlements): Promise<void> {
    const jsonKey = cacheKeys.subscriptions.userEntitlements(userId);
    const setKey = cacheKeys.subscriptions.userEntitlementsSet(userId);

    try {
      const pipeline = redis.pipeline();

      // 1. Cache full JSON
      pipeline.set(jsonKey, JSON.stringify(entitlements), "EX", USER_ENTITLEMENTS_TTL_SEC);

      // 2. Refresh Redis Set of active enabled boolean features
      const activeBooleanFeatures: string[] = [];
      for (const [featKey, featVal] of Object.entries(entitlements.features)) {
        if (featVal === true) {
          activeBooleanFeatures.push(featKey);
        }
      }

      pipeline.del(setKey);
      if (activeBooleanFeatures.length > 0) {
        pipeline.sadd(setKey, ...activeBooleanFeatures);
      } else {
        pipeline.sadd(setKey, EMPTY_SENTINEL);
      }
      pipeline.expire(setKey, USER_ENTITLEMENTS_TTL_SEC);

      await pipeline.exec();
    } catch (err) {
      console.warn(`[EntitlementsCacheService] Redis cache update failed for user ${userId}:`, err);
    }
  }

  /**
   * Fast SISMEMBER check for boolean entitlement features.
   * Returns:
   *   boolean if Set was cached in Redis.
   *   null if Redis Set missed (needs hydration).
   */
  async checkBooleanEntitlementFast(userId: string, featureKey: string): Promise<boolean | null> {
    const setKey = cacheKeys.subscriptions.userEntitlementsSet(userId);
    try {
      const exists = await redis.exists(setKey);
      if (exists) {
        const isMember = await redis.sismember(setKey, featureKey);
        return isMember === 1;
      }
    } catch (err) {
      console.warn(`[EntitlementsCacheService] Fast SISMEMBER check failed for ${setKey}:`, err);
    }
    return null;
  }

  /**
   * Invalidates all cached subscription and entitlement keys for a user.
   */
  async invalidateUserEntitlements(userId: string): Promise<void> {
    const metaKey = cacheKeys.subscriptions.userMeta(userId);
    const jsonKey = cacheKeys.subscriptions.userEntitlements(userId);
    const setKey = cacheKeys.subscriptions.userEntitlementsSet(userId);

    try {
      await redis.del(metaKey, jsonKey, setKey);
    } catch (err) {
      console.warn(`[EntitlementsCacheService] Invalidation failed for user ${userId}:`, err);
    }
  }
}

export const entitlementsCacheService = new EntitlementsCacheService();
