import type { FastifyPluginAsync } from "fastify";
import { PlayerService } from "./player.service";
import { requireAuth } from "../auth/auth.guards";
import { savePlayerStateSchema } from "./player.schemas";

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
};
