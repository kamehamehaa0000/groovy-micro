import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { NotificationService } from "./notification.service";
import {
  getNotificationsQuerySchema,
  notificationIdParamSchema,
  updateNotificationPreferencesSchema,
} from "./notification.schemas";
import { requireAuth } from "../auth/auth.guards";
import { redis } from "../../index";

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const notificationService = new NotificationService();


  /**
   * GET /api/v1/notifications
   * Cursor-paginated notifications with category filtering
   */
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsedQuery = getNotificationsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsedQuery.error.issues[0]?.message || "Invalid query parameters",
        });
      }

      const result = await notificationService.getNotifications(
        request.user.id,
        parsedQuery.data
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/v1/notifications/unread-count
   * O(1) Redis unread counter for navigation bell badge
   */
  fastify.get(
    "/unread-count",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const count = await notificationService.getUnreadCount(request.user.id);
      return reply.status(200).send({ unreadCount: count });
    }
  );

  /**
   * PATCH /api/v1/notifications/:id/read
   * Mark a specific notification as read
   */
  fastify.patch(
    "/:id/read",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsedParams = notificationIdParamSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid notification ID",
        });
      }

      const result = await notificationService.markAsRead(
        request.user.id,
        parsedParams.data.id
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * POST /api/v1/notifications/read-all
   * Mark all notifications as read for current user
   */
  fastify.post(
    "/read-all",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await notificationService.markAllAsRead(request.user.id);
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/v1/notifications/preferences
   * Get user notification preferences
   */
  fastify.get(
    "/preferences",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const preferences = await notificationService.getPreferences(request.user.id);
      return reply.status(200).send(preferences);
    }
  );

  /**
   * PATCH /api/v1/notifications/preferences
   * Update notification preferences
   */
  fastify.patch(
    "/preferences",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsedBody = updateNotificationPreferencesSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid preferences body",
        });
      }

      const preferences = await notificationService.updatePreferences(
        request.user.id,
        parsedBody.data
      );
      return reply.status(200).send(preferences);
    }
  );

  /**
   * GET /api/v1/notifications/stream
   * Real-time Server-Sent Events (SSE) notification stream
   */
  fastify.get(
    "/stream",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.user.id;
    const channelName = `notifications:events:${userId}`;

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": request.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
    });

    // Send initial connection event with current unread count
    const initialUnread = await notificationService.getUnreadCount(userId);
    reply.raw.write(
      `data: ${JSON.stringify({ type: "CONNECTED", unreadCount: initialUnread })}\n\n`
    );

    // Create a dedicated Redis subscriber connection
    const sub = redis.duplicate();
    await sub.connect().catch((err) => {
      console.warn("[NotificationRoutes] Redis subscriber connect deferred:", err);
    });

    await sub.subscribe(channelName, (err) => {
      if (err) {
        console.error(`[NotificationRoutes] Failed to subscribe to channel ${channelName}:`, err);
      }
    });

    // Forward Redis channel messages to HTTP SSE stream
    sub.on("message", (channel, message) => {
      if (channel === channelName) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    });

    // Keep-alive heartbeat ping every 25 seconds
    const pingInterval = setInterval(() => {
      reply.raw.write(": ping\n\n");
    }, 25000);

    // Clean up when client disconnects
    request.raw.on("close", () => {
      clearInterval(pingInterval);
      sub.unsubscribe(channelName).catch(() => {});
      sub.quit().catch(() => {});
    });
  });
};
