import type { FastifyPluginAsync } from "fastify";
import { RecommendationsService } from "./recommendations.service";
import { requireAuth, optionalAuth } from "../auth/auth.guards";
import {
  recommendationLimitQuerySchema,
  radioParamsSchema,
} from "./recommendations.schemas";

const recommendationsService = new RecommendationsService();

export const recommendationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /home
   * Returns complete consolidated personalized feed in a single sub-15ms request.
   */
  fastify.get(
    "/home",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const feed = await recommendationsService.getPersonalizedHomeFeed(
        request.user?.id || null
      );
      return reply.status(200).send({ feed });
    }
  );

  /**
   * GET /taste-profile
   * Returns user's computed sonic affinity vector (top genres, moods, average BPM/energy).
   */
  fastify.get(
    "/taste-profile",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const profile = await recommendationsService.getUserTasteProfile(
        request.user.id
      );
      return reply.status(200).send({ profile });
    }
  );

  /**
   * GET /heavy-rotation
   * User's repeat favorites with high completion rate over the last 45 days.
   */
  fastify.get(
    "/heavy-rotation",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const tracks = await recommendationsService.getHeavyRotation(
        request.user.id,
        limit
      );
      return reply.status(200).send({ tracks });
    }
  );

  /**
   * GET /for-you
   * Content-based personalized discoveries factoring genre affinity, mood, and BPM proximity.
   */
  fastify.get(
    "/for-you",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 10;

      const tracks = await recommendationsService.getRecommendedForYou(
        request.user.id,
        limit
      );
      return reply.status(200).send({ tracks });
    }
  );

  /**
   * GET /playlist-assisted
   * Playlist-curated discoveries (unheard tracks in saved playlists + playlist co-occurrences).
   */
  fastify.get(
    "/playlist-assisted",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const tracks = await recommendationsService.getPlaylistAssistedRecommendations(
        request.user.id,
        limit
      );
      return reply.status(200).send({ tracks });
    }
  );

  /**
   * GET /radar
   * New albums, EPs, and singles dropped in the last 6 months by artists the user follows.
   */
  fastify.get(
    "/radar",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const releases = await recommendationsService.getArtistRadar(
        request.user.id,
        limit
      );
      return reply.status(200).send({ releases });
    }
  );

  /**
   * GET /forgotten
   * Rediscover past favorites (completed >= 3 times, but unspun in 30+ days).
   */
  fastify.get(
    "/forgotten",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const tracks = await recommendationsService.getForgottenFavorites(
        request.user.id,
        limit
      );
      return reply.status(200).send({ tracks });
    }
  );

  /**
   * GET /radio/:songId
   * Smart Autoplay / Track Radio: delivers an endless, sonically harmonious queue matching the seed song.
   */
  fastify.get(
    "/radio/:songId",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const paramResult = radioParamsSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid song ID format",
        });
      }

      const queryResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = queryResult.success ? queryResult.data.limit : 20;

      const data = await recommendationsService.getRadioDetails(
        paramResult.data.songId,
        limit,
        request.user?.id || null
      );
      return reply.status(200).send(data);
    }
  );

  /**
   * GET /similar-artists
   * Dedicated artists shelf featuring similar artists to top/seed artist.
   */
  fastify.get(
    "/similar-artists",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const result = await recommendationsService.getSimilarArtists(
        request.user?.id || null,
        limit
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /new-releases
   * New releases matching user's taste profile.
   */
  fastify.get(
    "/new-releases",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const releases = await recommendationsService.getNewReleasesForYou(
        request.user?.id || null,
        limit
      );
      return reply.status(200).send({ releases });
    }
  );

  /**
   * GET /global-hits
   * Platform-wide high velocity hits matching user taste.
   */
  fastify.get(
    "/global-hits",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const tracks = await recommendationsService.getGlobalHitsForYou(
        request.user?.id || null,
        limit
      );
      return reply.status(200).send({ tracks });
    }
  );

  /**
   * GET /more-like-artist
   * Discoveries inspired by user's top-listened artist.
   */
  fastify.get(
    "/more-like-artist",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const result = await recommendationsService.getMoreLikeTopArtist(
        request.user?.id || null,
        limit
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /more-like-song
   * Continuous harmonious queue inspired by user's top favorite song.
   */
  fastify.get(
    "/more-like-song",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const result = await recommendationsService.getMoreLikeTopSong(
        request.user?.id || null,
        limit
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /user-playlists
   * Compact shelf summary of user's created and saved playlists.
   */
  fastify.get(
    "/user-playlists",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const playlists = await recommendationsService.getUserPlaylistsSummary(
        request.user.id,
        limit
      );
      return reply.status(200).send({ playlists });
    }
  );

  /**
   * GET /radio-mixes
   * Dynamic radio mixes seeded from 5 diverse top songs.
   */
  fastify.get(
    "/radio-mixes",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const mixes = await recommendationsService.getRadioMixes(
        request.user?.id || null,
        5
      );
      return reply.status(200).send({ mixes });
    }
  );

  /**
   * GET /artist/:idOrSlug/similar
   * Retrieves similar artists for an artist (strictly global variant).
   */
  fastify.get(
    "/artist/:idOrSlug/similar",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const { idOrSlug } = request.params as { idOrSlug: string };
      const parseResult = recommendationLimitQuerySchema.safeParse(request.query);
      const limit = parseResult.success ? parseResult.data.limit : 8;

      const result = await recommendationsService.getSimilarArtistsForArtist(
        idOrSlug,
        limit
      );
      if (!result) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Artist not found",
        });
      }
      return reply.status(200).send(result);
    }
  );
};

