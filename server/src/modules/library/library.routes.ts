import type { FastifyPluginAsync } from "fastify";
import { LibraryService } from "./library.service";
import { requireAuth } from "../auth/auth.guards";
import { pinItemSchema } from "./library.schemas";

const libraryService = new LibraryService();

export const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /me
   * Returns user's unified library overview in a single fast call.
   */
  fastify.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const data = await libraryService.getUserLibrary(request.user.id);
      return reply.status(200).send(data);
    }
  );

  /**
   * POST /pins
   * Pins an item (Liked Songs, Personal Collection, Playlist, Album, Artist) to top.
   */
  fastify.post(
    "/pins",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = pinItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await libraryService.pinItem(
          request.user.id,
          parsed.data
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(err.statusCode || 500).send({
          statusCode: err.statusCode || 500,
          error: err.statusCode === 400 ? "Bad Request" : "Internal Server Error",
          message: err.message || "Failed to pin item",
        });
      }
    }
  );

  /**
   * DELETE /pins/:itemType/:itemId
   * Unpins an item from user's library.
   */
  fastify.delete(
    "/pins/:itemType/:itemId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { itemType, itemId } = request.params as {
        itemType: string;
        itemId: string;
      };

      const result = await libraryService.unpinItem(
        request.user.id,
        itemType,
        itemId
      );
      return reply.status(200).send(result);
    }
  );
};
