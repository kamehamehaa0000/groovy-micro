import type { FastifyPluginAsync } from "fastify";
import { SearchService } from "./search.service";
import { searchQuerySchema } from "./search.schemas";
import { optionalAuth } from "../auth/auth.guards";

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const searchService = new SearchService();

  /**
   * GET /
   * Unified global search across songs, albums, artists, playlists, and users.
   * Query: ?q=query&limit=5&type=all|songs|albums|artists|playlists|users
   */
  fastify.get(
    "/",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseQuery = searchQuerySchema.safeParse(request.query);
      if (!parseQuery.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid search query parameters",
          errors: parseQuery.error.flatten().fieldErrors,
        });
      }

      const results = await searchService.search(
        parseQuery.data,
        request.user?.id
      );

      return reply.status(200).send(results);
    }
  );
};
