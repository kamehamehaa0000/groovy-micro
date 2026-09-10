import type { FastifyPluginAsync } from "fastify";
import { CatalogService } from "./catalog.service";
import {
  requireAuth,
  requireRole,
  optionalAuth,
} from "../auth/auth.guards";
import {
  createAlbumSchema,
  updateAlbumSchema,
  createSongSchema,
  updateSongSchema,
  searchAlbumsQuerySchema,
  searchSongsQuerySchema,
} from "./catalog.schemas";

const catalogService = new CatalogService();

/**
 * Albums API Routes (/api/v1/albums)
 */
export const albumsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /
   * Search and browse albums with filters and pagination.
   */
  fastify.get("/", async (request, reply) => {
    const parseResult = searchAlbumsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid query parameters",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const result = await catalogService.searchAlbums(parseResult.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /
   * Creates a new album (with optional initial tracks and credits).
   */
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const parseResult = createAlbumSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const album = await catalogService.createAlbum(
          request.user.id,
          parseResult.data
        );
        return reply.status(201).send(album);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to create album",
        });
      }
    }
  );

  /**
   * GET /:idOrSlug
   * Dual lookup by album UUID or vanity slug, includes tracklist and like state.
   */
  fastify.get(
    "/:idOrSlug",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const { idOrSlug } = request.params as { idOrSlug: string };
      const album = await catalogService.getAlbumByIdOrSlug(
        idOrSlug,
        request.user?.id
      );

      if (!album) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Album not found",
        });
      }

      return reply.status(200).send(album);
    }
  );

  /**
   * PATCH /:id
   * Updates album metadata.
   */
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateAlbumSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await catalogService.updateAlbum(
          request.user.id,
          id,
          parseResult.data
        );
        return reply.status(200).send(updated);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to update album",
        });
      }
    }
  );

  /**
   * DELETE /:id
   * Soft-deletes an album and cascades soft-delete to its songs (30-day restore).
   */
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await catalogService.softDeleteAlbum(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to archive album",
        });
      }
    }
  );

  /**
   * POST /:id/restore
   * Restores a soft-deleted album and its tracks within the 30-day restore window.
   */
  fastify.post(
    "/:id/restore",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await catalogService.restoreAlbum(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to restore album",
        });
      }
    }
  );

  /**
   * POST /:id/like
   * Toggles like/unlike on an album.
   */
  fastify.post(
    "/:id/like",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await catalogService.toggleAlbumLike(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to toggle album like",
        });
      }
    }
  );
};

/**
 * Songs API Routes (/api/v1/songs)
 */
export const songsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /liked
   * Retrieves authenticated user's Liked Songs library.
   * Defined before /:id to prevent routing collisions.
   */
  fastify.get(
    "/liked",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { page = "1", limit = "50" } = request.query as {
        page?: string;
        limit?: string;
      };

      const result = await catalogService.getLikedSongs(
        request.user.id,
        parseInt(page, 10) || 1,
        parseInt(limit, 10) || 50
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /
   * Searches and discovers songs (by title, genre, artist, popularity).
   */
  fastify.get(
    "/",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = searchSongsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid query parameters",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await catalogService.searchSongs(
        parseResult.data,
        request.user?.id
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * POST /
   * Creates a standalone track or appends to an album.
   */
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const parseResult = createSongSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const song = await catalogService.createSong(
          request.user.id,
          parseResult.data
        );
        return reply.status(201).send(song);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to create song",
        });
      }
    }
  );

  /**
   * GET /:id
   * Retrieves song details, credits, and direct stream URL.
   */
  fastify.get(
    "/:id",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const song = await catalogService.getSongById(id, request.user?.id);

      if (!song) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Song not found",
        });
      }

      return reply.status(200).send(song);
    }
  );

  /**
   * PATCH /:id
   * Updates song details (supports detaching from album, re-ordering, credits).
   */
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateSongSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await catalogService.updateSong(
          request.user.id,
          id,
          parseResult.data
        );
        return reply.status(200).send(updated);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to update song",
        });
      }
    }
  );

  /**
   * DELETE /:id
   * Soft-deletes a song (30-day restore window).
   */
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await catalogService.softDeleteSong(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to archive song",
        });
      }
    }
  );

  /**
   * POST /:id/restore
   * Restores a soft-deleted song.
   */
  fastify.post(
    "/:id/restore",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await catalogService.restoreSong(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to restore song",
        });
      }
    }
  );

  /**
   * POST /:id/like
   * Toggles like/unlike on a song.
   */
  fastify.post(
    "/:id/like",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await catalogService.toggleSongLike(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to toggle song like",
        });
      }
    }
  );
};

/**
 * Studio Catalog & Discography Routes (/api/v1/studio/releases)
 */
export const studioCatalogRoutes: FastifyPluginAsync = async (fastify) => {
  const getReleasesHandler = async (
    request: any,
    reply: any
  ) => {
    const { trash } = request.query as { trash?: string };
    const showTrash = trash === "true" || trash === "1";

    try {
      const result = await catalogService.getStudioReleases(
        request.user.id,
        showTrash
      );
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.message || "Failed to retrieve studio releases",
      });
    }
  };

  fastify.get(
    "/",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    getReleasesHandler
  );

  fastify.get(
    "/releases",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    getReleasesHandler
  );
};
