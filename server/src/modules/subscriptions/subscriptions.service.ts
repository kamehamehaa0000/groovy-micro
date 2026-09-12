import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  subscriptionPlans,
  userSubscriptions,
  planFeatureDefinitions,
  outboxEvents,
  type SubscriptionPlan,
  type UserSubscription,
  type PlanFeatureDefinition,
} from "../../db/schema";
import { redis } from "../../index";
import { cacheKeys, entitlementsCacheService } from "../../lib/cache";
import type {
  CreateFeatureDefinitionInput,
  UpdateFeatureDefinitionInput,
  CreatePlanInput,
  UpdatePlanInput,
} from "./subscriptions.schemas";

export interface UserEntitlementsResult {
  planId: string;
  planName: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  features: Record<string, boolean | number>;
}

export class SubscriptionsService {
  private readonly PLAN_CACHE_TTL_SEC = 86400; // 24 hours
  private readonly USER_SUB_CACHE_TTL_SEC = 3600; // 1 hour

  // =========================================================================
  // CACHE HELPERS
  // =========================================================================

  private async invalidatePlanCache(planId?: string) {
    try {
      const keys = ["plans:active", "plans:all"];
      if (planId) keys.push(`plan:${planId}`);
      await redis.del(...keys);
    } catch (err) {
      console.warn("Redis plan cache invalidation warning:", err);
    }
  }

  private async invalidateFeatureCache(key?: string) {
    try {
      const keys = ["features:active", "features:all"];
      if (key) keys.push(`feature:${key}`);
      await redis.del(...keys);
    } catch (err) {
      console.warn("Redis feature cache invalidation warning:", err);
    }
  }

  private async invalidateUserSubscriptionCache(userId: string) {
    try {
      await entitlementsCacheService.invalidateUserEntitlements(userId);
    } catch (err) {
      console.warn("Redis user subscription cache invalidation warning:", err);
    }
  }

  // =========================================================================
  // 1. FEATURE DEFINITIONS (FEATURE CATALOG / REGISTRY)
  // =========================================================================

  /**
   * Lists all feature definitions from the Feature Catalog.
   */
  async listFeatures(includeInactive = false): Promise<PlanFeatureDefinition[]> {
    const cacheKey = includeInactive ? "features:all" : "features:active";
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.warn("Redis get features error:", err);
    }

    const query = db.select().from(planFeatureDefinitions);
    const features = includeInactive
      ? await query.orderBy(planFeatureDefinitions.key)
      : await query
          .where(eq(planFeatureDefinitions.isActive, true))
          .orderBy(planFeatureDefinitions.key);

    try {
      await redis.set(cacheKey, JSON.stringify(features), "EX", this.PLAN_CACHE_TTL_SEC);
    } catch (err) {
      console.warn("Redis set features error:", err);
    }

    return features;
  }

  /**
   * Retrieves single feature definition by key.
   */
  async getFeatureByKey(key: string): Promise<PlanFeatureDefinition | null> {
    const cacheKey = `feature:${key}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.warn("Redis get feature error:", err);
    }

    const [feature] = await db
      .select()
      .from(planFeatureDefinitions)
      .where(eq(planFeatureDefinitions.key, key))
      .limit(1);

    if (!feature) return null;

    try {
      await redis.set(cacheKey, JSON.stringify(feature), "EX", this.PLAN_CACHE_TTL_SEC);
    } catch (err) {
      console.warn("Redis set feature error:", err);
    }

    return feature;
  }

  /**
   * Creates a new dynamic feature in the Feature Catalog (Admin).
   */
  async createFeature(input: CreateFeatureDefinitionInput): Promise<PlanFeatureDefinition> {
    const existing = await this.getFeatureByKey(input.key);
    if (existing) {
      throw new Error(`Feature with key '${input.key}' already exists`);
    }

    const [created] = await db
      .insert(planFeatureDefinitions)
      .values({
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        valueType: input.valueType,
        defaultValue: input.defaultValue,
        category: input.category,
        isActive: true,
      })
      .returning();

    await this.invalidateFeatureCache(input.key);
    return created;
  }

  /**
   * Updates an existing dynamic feature definition (Admin).
   */
  async updateFeature(
    key: string,
    input: UpdateFeatureDefinitionInput
  ): Promise<PlanFeatureDefinition> {
    const existing = await this.getFeatureByKey(key);
    if (!existing) {
      throw new Error(`Feature with key '${key}' not found`);
    }

    const [updated] = await db
      .update(planFeatureDefinitions)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(planFeatureDefinitions.key, key))
      .returning();

    await this.invalidateFeatureCache(key);
    return updated;
  }

  /**
   * Soft-deactivates a dynamic feature definition (Admin).
   */
  async deleteFeature(key: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.getFeatureByKey(key);
    if (!existing) {
      throw new Error(`Feature with key '${key}' not found`);
    }

    await db
      .update(planFeatureDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(planFeatureDefinitions.key, key));

    await this.invalidateFeatureCache(key);
    return { success: true, message: `Feature '${key}' deactivated successfully` };
  }

  // =========================================================================
  // 2. SUBSCRIPTION PLANS
  // =========================================================================

  /**
   * Lists all subscription plans.
   */
  async listPlans(includeInactive = false): Promise<SubscriptionPlan[]> {
    const cacheKey = includeInactive ? "plans:all" : "plans:active";
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.warn("Redis get plans error:", err);
    }

    const query = db.select().from(subscriptionPlans);
    const plans = includeInactive
      ? await query.orderBy(subscriptionPlans.priceCents)
      : await query
          .where(eq(subscriptionPlans.isActive, true))
          .orderBy(subscriptionPlans.priceCents);

    try {
      await redis.set(cacheKey, JSON.stringify(plans), "EX", this.PLAN_CACHE_TTL_SEC);
    } catch (err) {
      console.warn("Redis set plans error:", err);
    }

    return plans;
  }

  /**
   * Retrieves single subscription plan by ID.
   */
  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    const cacheKey = `plan:${planId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.warn("Redis get plan error:", err);
    }

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!plan) return null;

    try {
      await redis.set(cacheKey, JSON.stringify(plan), "EX", this.PLAN_CACHE_TTL_SEC);
    } catch (err) {
      console.warn("Redis set plan error:", err);
    }

    return plan;
  }

  /**
   * Creates a new subscription plan with dynamic feature assignments (Admin).
   */
  async createPlan(input: CreatePlanInput): Promise<SubscriptionPlan> {
    const existing = await this.getPlanById(input.id);
    if (existing) {
      throw new Error(`Subscription plan with ID '${input.id}' already exists`);
    }

    const [created] = await db
      .insert(subscriptionPlans)
      .values({
        id: input.id,
        name: input.name,
        priceCents: input.priceCents,
        currency: input.currency,
        interval: input.interval,
        features: input.features,
        isActive: input.isActive,
      })
      .returning();

    await this.invalidatePlanCache(input.id);
    return created;
  }

  /**
   * Updates an existing subscription plan (Admin).
   * Automatically invalidates Redis cache, propagating updates instantly to all users on this plan.
   */
  async updatePlan(planId: string, input: UpdatePlanInput): Promise<SubscriptionPlan> {
    const existing = await this.getPlanById(planId);
    if (!existing) {
      throw new Error(`Subscription plan with ID '${planId}' not found`);
    }

    // Merge existing features with new features if provided
    let updatedFeatures = existing.features as Record<string, boolean | number>;
    if (input.features) {
      updatedFeatures = {
        ...updatedFeatures,
        ...input.features,
      };
    }

    const [updated] = await db
      .update(subscriptionPlans)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.interval !== undefined ? { interval: input.interval } : {}),
        ...(input.features !== undefined ? { features: updatedFeatures } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      .where(eq(subscriptionPlans.id, planId))
      .returning();

    await this.invalidatePlanCache(planId);
    return updated;
  }

  // =========================================================================
  // 3. USER SUBSCRIPTIONS & ENTITLEMENT EVALUATION
  // =========================================================================

  /**
   * Retrieves active subscription metadata for a user (with Redis caching).
   */
  async getUserSubscription(userId: string): Promise<{
    planId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }> {
    const cacheKey = cacheKeys.subscriptions.userMeta(userId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.currentPeriodStart) parsed.currentPeriodStart = new Date(parsed.currentPeriodStart);
        if (parsed.currentPeriodEnd) parsed.currentPeriodEnd = new Date(parsed.currentPeriodEnd);
        return parsed;
      }
    } catch (err) {
      console.warn("Redis get user sub error:", err);
    }

    const [sub] = await db
      .select({
        planId: userSubscriptions.planId,
        status: userSubscriptions.status,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
      })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .limit(1);

    const result = sub || {
      planId: "free",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", this.USER_SUB_CACHE_TTL_SEC);
    } catch (err) {
      console.warn("Redis set user sub error:", err);
    }

    return result;
  }

  /**
   * Resolves complete active entitlements for a user by merging:
   * 1. The user's active plan features
   * 2. The dynamic feature catalog default values (fail-safe fallback)
   * Backed by Redis JSON + Redis Set caching for 0ms repeated checks.
   */
  async getUserEntitlements(userId: string): Promise<UserEntitlementsResult> {
    const cached = await entitlementsCacheService.getUserCachedEntitlements(userId);
    if (cached) {
      return cached as UserEntitlementsResult;
    }

    const userSub = await this.getUserSubscription(userId);

    // If subscription is canceled, past_due, or inactive, fallback to free tier
    const isEntitled = userSub.status === "active" || userSub.status === "trialing";
    const effectivePlanId = isEntitled ? userSub.planId : "free";

    const plan = await this.getPlanById(effectivePlanId);
    const planFeatures = (plan?.features || {}) as Record<string, boolean | number>;
    const featureCatalog = await this.listFeatures(false);

    // Start with default values from the feature catalog
    const resolvedFeatures: Record<string, boolean | number> = {};
    for (const def of featureCatalog) {
      resolvedFeatures[def.key] = def.defaultValue as boolean | number;
    }

    // Override with plan-specific assigned values
    for (const [key, value] of Object.entries(planFeatures)) {
      resolvedFeatures[key] = value;
    }

    const result: UserEntitlementsResult = {
      planId: effectivePlanId,
      planName: plan?.name || "Groovy Free",
      status: userSub.status,
      currentPeriodEnd: userSub.currentPeriodEnd,
      cancelAtPeriodEnd: userSub.cancelAtPeriodEnd,
      features: resolvedFeatures,
    };

    await entitlementsCacheService.setUserCachedEntitlements(userId, result);
    return result;
  }

  /**
   * Retrieves a single feature value for a user (boolean or numeric).
   */
  async getFeatureValue(userId: string, featureKey: string): Promise<boolean | number> {
    const entitlements = await this.getUserEntitlements(userId);
    if (entitlements.features[featureKey] !== undefined) {
      return entitlements.features[featureKey];
    }

    // Defensive fallback: check catalog definition default
    const featureDef = await this.getFeatureByKey(featureKey);
    if (featureDef) {
      return featureDef.defaultValue as boolean | number;
    }

    // Absolute fail-safe closed
    return false;
  }

  /**
   * Checks whether a user has a specific entitlement.
   * - Ultra-fast O(1) Redis Set (SISMEMBER) check for boolean features (~0.2ms)
   * - Cached JSON evaluation for numeric thresholds
   */
  async hasEntitlement(
    userId: string,
    featureKey: string,
    minNumericValue?: number
  ): Promise<boolean> {
    // 1. Ultra-fast Redis Set path for boolean entitlements (sub-0.5ms)
    if (minNumericValue === undefined) {
      const fastCheck = await entitlementsCacheService.checkBooleanEntitlementFast(
        userId,
        featureKey
      );
      if (fastCheck !== null) {
        return fastCheck;
      }
    }

    // 2. Cache miss or numeric check: evaluate from cached entitlements
    const value = await this.getFeatureValue(userId, featureKey);

    if (typeof value === "boolean") {
      return value === true;
    }

    if (typeof value === "number") {
      const threshold = minNumericValue !== undefined ? minNumericValue : 1;
      return value >= threshold;
    }

    return false;
  }

  /**
   * Upgrades or switches a user's subscription plan (Mock checkout for dev/testing).
   * Emits transactional outbox event 'USER_SUBSCRIPTION_CHANGED'.
   */
  async upgradeUserPlan(
    userId: string,
    targetPlanId: string
  ): Promise<UserEntitlementsResult> {
    const targetPlan = await this.getPlanById(targetPlanId);
    if (!targetPlan || !targetPlan.isActive) {
      throw new Error(`Subscription plan '${targetPlanId}' is invalid or inactive`);
    }

    const periodEnd =
      targetPlan.interval === "lifetime"
        ? null
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

    await db.transaction(async (tx) => {
      // 1. Upsert user subscription
      await tx
        .insert(userSubscriptions)
        .values({
          userId,
          planId: targetPlanId,
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        })
        .onConflictDoUpdate({
          target: userSubscriptions.userId,
          set: {
            planId: targetPlanId,
            status: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          },
        });

      // 2. Emit transactional outbox event
      await tx.insert(outboxEvents).values({
        aggregateType: "USER",
        aggregateId: userId,
        eventType: "USER_SUBSCRIPTION_CHANGED",
        payload: {
          userId,
          planId: targetPlanId,
          planName: targetPlan.name,
          status: "active",
          currentPeriodEnd: periodEnd?.toISOString() ?? null,
        },
      });
    });

    // Invalidate user cache
    await this.invalidateUserSubscriptionCache(userId);

    // Return newly resolved entitlements
    return await this.getUserEntitlements(userId);
  }

  /**
   * Cancels user subscription (sets cancelAtPeriodEnd = true).
   */
  async cancelUserSubscription(userId: string): Promise<UserEntitlementsResult> {
    const [updated] = await db
      .update(userSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, userId))
      .returning();

    if (!updated) {
      throw new Error("No active subscription found to cancel");
    }

    await this.invalidateUserSubscriptionCache(userId);
    return await this.getUserEntitlements(userId);
  }
}
