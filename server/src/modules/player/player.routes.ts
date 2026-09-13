import type { FastifyPluginAsync } from "fastify";
import { PlayerService } from "./player.service";
import { requireAuth, optionalAuth } from "../auth/auth.guards";
import {
  savePlayerStateSchema,
  playerHeartbeatSchema,
  telemetryPlaySchema,
} from "./player.schemas";

const playerService = new PlayerService();

export const playerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /state
   * Retrieves authenticated user's current playback state snapshot (<1ms).
   */
  fastify.get(
    "/state",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const state = await playerService.getPlayerState(request.user.id);
      return reply.status(200).send({ state });
    }
  );

  /**
   * PUT /state
   * Debounced cross-device playback state snapshot sync.
   */
  fastify.put(
    "/state",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = savePlayerStateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid player state format",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const snapshot = await playerService.savePlayerState(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send({
        success: true,
        state: snapshot,
      });
    }
  );

  /**
   * POST /heartbeat
   * Regular playback pulse (every 15s) enforcing single-device takeover (Option A)
   * and publishing live presence.
   */
  fastify.post(
    "/heartbeat",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = playerHeartbeatSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid heartbeat payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await playerService.recordHeartbeat(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /active-device
   * Retrieves current active device playing session.
   */
  fastify.get(
    "/active-device",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const session = await playerService.getActiveDevice(request.user.id);
      return reply.status(200).send({ activeDevice: session });
    }
  );

  /**
   * POST /telemetry/play
   * Records qualified play count after 30 seconds of playback.
   */
  fastify.post(
    "/telemetry/play",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = telemetryPlaySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid telemetry payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const userId = request.user?.id || null;
      const result = await playerService.recordPlayTelemetry(
        userId,
        parseResult.data
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /history/recent
   * Retrieves authenticated user's recent listening history.
   */
  fastify.get(
    "/history/recent",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const history = await playerService.getRecentHistory(request.user.id);
      return reply.status(200).send({ history });
    }
  );
};
