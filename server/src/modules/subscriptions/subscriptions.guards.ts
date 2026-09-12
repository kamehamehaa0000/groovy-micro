import type { FastifyRequest, FastifyReply } from "fastify";
import { SubscriptionsService } from "./subscriptions.service";

export const subscriptionsService = new SubscriptionsService();

/**
 * Fastify preHandler guard to enforce feature entitlement gating.
 *
 * Usage:
 * fastify.post("/jam/rooms", {
 *   preHandler: [requireAuth, requireEntitlement("can_host_jam")]
 * }, handler);
 *
 * fastify.post("/jam/rooms/large", {
 *   preHandler: [requireAuth, requireEntitlement("max_jam_participants", 10)]
 * }, handler);
 */
export function requireEntitlement(featureKey: string, minNumericValue?: number) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required to access entitled features",
      });
    }

    const hasAccess = await subscriptionsService.hasEntitlement(
      request.user.id,
      featureKey,
      minNumericValue
    );

    if (!hasAccess) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: `Your current subscription does not include '${featureKey}'. Upgrade your plan to unlock this feature.`,
        code: "ENTITLEMENT_REQUIRED",
        requiredFeature: featureKey,
      });
    }
  };
}

/**
 * Fastify preHandler hook to attach user's resolved entitlements dictionary to request.user.
 * Enables handlers to inspect features like request.user.entitlements.max_bitrate_kbps.
 */
export async function attachEntitlements(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  if (request.user) {
    const entitlements = await subscriptionsService.getUserEntitlements(
      request.user.id
    );
    (request.user as any).entitlements = entitlements.features;
    (request.user as any).planId = entitlements.planId;
  }
}
