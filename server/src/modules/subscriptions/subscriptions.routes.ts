import type { FastifyPluginAsync } from "fastify";
import { SubscriptionsService } from "./subscriptions.service";
import { requireAuth, requireRole } from "../auth/auth.guards";
import {
  createFeatureDefinitionSchema,
  updateFeatureDefinitionSchema,
  createPlanSchema,
  updatePlanSchema,
  upgradeSubscriptionSchema,
} from "./subscriptions.schemas";

const subscriptionsService = new SubscriptionsService();

/**
 * Public & Listener Subscriptions Routes (/api/v1/subscriptions)
 */
export const subscriptionsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /plans
   * Lists active subscription plans for pricing comparison and upgrades.
   */
  fastify.get("/plans", async (_request, reply) => {
    const plans = await subscriptionsService.listPlans(false);
    return reply.status(200).send({ plans });
  });

  /**
   * GET /features
   * Lists active features from the dynamic Feature Catalog.
   */
  fastify.get("/features", async (_request, reply) => {
    const features = await subscriptionsService.listFeatures(false);
    return reply.status(200).send({ features });
  });

  /**
   * GET /me
   * Returns current user's active subscription tier and resolved entitlement capabilities.
   */
  fastify.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const entitlements = await subscriptionsService.getUserEntitlements(
        request.user.id
      );
      return reply.status(200).send(entitlements);
    }
  );

  /**
   * POST /upgrade
   * Mock checkout / dev upgrade endpoint to instantly switch plans.
   */
  fastify.post(
    "/upgrade",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = upgradeSubscriptionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await subscriptionsService.upgradeUserPlan(
          request.user.id,
          parseResult.data.planId
        );
        return reply.status(200).send({
          message: `Successfully switched to ${result.planName}`,
          subscription: result,
        });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to upgrade subscription",
        });
      }
    }
  );

  /**
   * POST /cancel
   * Cancels user subscription (sets cancelAtPeriodEnd = true).
   */
  fastify.post(
    "/cancel",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const result = await subscriptionsService.cancelUserSubscription(
          request.user.id
        );
        return reply.status(200).send({
          message: "Subscription scheduled for cancellation at the end of the current billing cycle",
          subscription: result,
        });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to cancel subscription",
        });
      }
    }
  );
};

/**
 * Admin Desk Routes for Subscription Plans & Dynamic Features (/api/v1/admin/subscriptions)
 */
export const adminSubscriptionsRoutes: FastifyPluginAsync = async (fastify) => {
  // Enforce ADMIN role for all routes in this plugin
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireRole("ADMIN"));

  // =========================================================================
  // PLANS MANAGEMENT
  // =========================================================================

  /**
   * GET /plans
   * Lists all plans (active & inactive) with full features dictionary.
   */
  fastify.get("/plans", async (_request, reply) => {
    const plans = await subscriptionsService.listPlans(true);
    return reply.status(200).send({ plans });
  });

  /**
   * POST /plans
   * Creates a new subscription plan with dynamic feature assignments.
   */
  fastify.post("/plans", async (request, reply) => {
    const parseResult = createPlanSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const plan = await subscriptionsService.createPlan(parseResult.data);
      return reply.status(201).send({ plan });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to create plan",
      });
    }
  });

  /**
   * PATCH /plans/:id
   * Updates an existing subscription plan and invalidates cache.
   */
  fastify.patch("/plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updatePlanSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const plan = await subscriptionsService.updatePlan(id, parseResult.data);
      return reply.status(200).send({ plan });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to update plan",
      });
    }
  });

  // =========================================================================
  // FEATURE CATALOG MANAGEMENT (ADMIN DYNAMIC FEATURES)
  // =========================================================================

  /**
   * GET /features
   * Lists all registered features in the Feature Catalog (active & inactive).
   */
  fastify.get("/features", async (_request, reply) => {
    const features = await subscriptionsService.listFeatures(true);
    return reply.status(200).send({ features });
  });

  /**
   * POST /features
   * Registers a new dynamic feature in the Feature Catalog.
   */
  fastify.post("/features", async (request, reply) => {
    const parseResult = createFeatureDefinitionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const feature = await subscriptionsService.createFeature(parseResult.data);
      return reply.status(201).send({ feature });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to create feature definition",
      });
    }
  });

  /**
   * PATCH /features/:key
   * Updates an existing feature definition.
   */
  fastify.patch("/features/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const parseResult = updateFeatureDefinitionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const feature = await subscriptionsService.updateFeature(
        key,
        parseResult.data
      );
      return reply.status(200).send({ feature });
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to update feature definition",
      });
    }
  });

  /**
   * DELETE /features/:key
   * Soft-deactivates a feature definition.
   */
  fastify.delete("/features/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    try {
      const result = await subscriptionsService.deleteFeature(key);
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to delete feature definition",
      });
    }
  });
};
