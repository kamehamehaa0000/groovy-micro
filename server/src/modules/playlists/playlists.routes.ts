import type { FastifyPluginAsync } from "fastify";
import { PlaylistsService } from "./playlists.service";
import { requireAuth, optionalAuth } from "../auth/auth.guards";
import {
  createPlaylistSchema,
  updatePlaylistSchema,
  addTracksSchema,
  reorderTracksSchema,
  searchPlaylistsQuerySchema,
  joinCollaborationSchema,
} from "./playlists.schemas";

const playlistsService = new PlaylistsService();

export const playlistsRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // 1. PUBLIC & DISCOVERY
  // =========================================================================

  /**
   * GET /
   * Search and browse public playlists with mosaic covers and saves enrichment.
   */
  fastify.get(
    "/",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = searchPlaylistsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid query parameters",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await playlistsService.searchPublicPlaylists(
        parseResult.data,
        request.user?.id
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * POST /
   * Creates a new playlist for the authenticated user.
   */
  fastify.post(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = createPlaylistSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const playlist = await playlistsService.createPlaylist(
        request.user.id,
        parseResult.data
      );
      return reply.status(201).send(playlist);
    }
  );

  // =========================================================================
  // 2. USER LIBRARIES & FAST SYNC (STATIC PATHS BEFORE /:id)
  // =========================================================================

  /**
   * GET /me
   * Returns all playlists owned by current user.
   */
  fastify.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userPlaylists = await playlistsService.getUserPlaylists(
        request.user.id,
        request.user.id
      );
      return reply.status(200).send({ playlists: userPlaylists });
    }
  );

  /**
   * GET /saved/ids
   * Fast sync endpoint returning all playlist IDs saved by current user.
   */
  fastify.get(
    "/saved/ids",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const playlistIds = await playlistsService.getUserSavedPlaylistIds(request.user.id);
      return reply.status(200).send({ playlistIds });
    }
  );

  /**
   * GET /saved
   * Returns complete saved playlists in user's library.
   */
  fastify.get(
    "/saved",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const saved = await playlistsService.getUserSavedPlaylists(request.user.id);
      return reply.status(200).send({ playlists: saved });
    }
  );

  // =========================================================================
  // 3. PARAMETERIZED PLAYLIST ENDPOINTS (/:id)
  // =========================================================================

  /**
   * GET /:id
   * Detailed view with enriched tracks, likes, and mosaic covers.
   */
  fastify.get(
    "/:id",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { shareToken, collabToken } = request.query as { shareToken?: string; collabToken?: string };

      try {
        const playlist = await playlistsService.getPlaylistById(
          id,
          request.user?.id,
          shareToken,
          collabToken
        );
        return reply.status(200).send(playlist);
      } catch (err: any) {
        if (err.message === "Playlist not found") {
          return reply.status(404).send({ statusCode: 404, error: "Not Found", message: err.message });
        }
        return reply.status(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
      }
    }
  );

  /**
   * PATCH /:id
   * Updates playlist metadata & settings (Owner only).
   */
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updatePlaylistSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await playlistsService.updatePlaylist(
          request.user.id,
          id,
          parseResult.data
        );
        return reply.status(200).send(updated);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * DELETE /:id
   * Deletes playlist (Owner only).
   */
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await playlistsService.deletePlaylist(request.user.id, id);
        return reply.status(200).send({ success: true, message: "Playlist deleted successfully" });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  // =========================================================================
  // 4. TRACKLIST OPERATIONS
  // =========================================================================

  /**
   * POST /:id/tracks
   * Adds song(s) to playlist (Owner or Collaborator).
   */
  fastify.post(
    "/:id/tracks",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = addTracksSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await playlistsService.addTracks(
          request.user.id,
          id,
          parseResult.data.songIds
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * DELETE /:id/tracks/:entryId
   * Removes specific track entry from playlist (Owner or Collaborator).
   */
  fastify.delete(
    "/:id/tracks/:entryId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id, entryId } = request.params as { id: string; entryId: string };
      try {
        await playlistsService.removeTrack(request.user.id, id, entryId);
        return reply.status(200).send({ success: true, message: "Track removed from playlist" });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * PATCH /:id/tracks/reorder
   * Atomic batch reorder tracks via sequential integers (Owner or Collaborator).
   */
  fastify.patch(
    "/:id/tracks/reorder",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = reorderTracksSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await playlistsService.reorderTracks(
          request.user.id,
          id,
          parseResult.data.orderedEntryIds
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  // =========================================================================
  // 5. CLONING
  // =========================================================================

  /**
   * POST /:id/clone
   * Clones a playlist into current user's library.
   */
  fastify.post(
    "/:id/clone",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { shareToken } = request.query as { shareToken?: string };

      try {
        const cloned = await playlistsService.clonePlaylist(request.user.id, id, shareToken);
        return reply.status(201).send({
          message: "Playlist cloned successfully",
          playlist: cloned,
        });
      } catch (err: any) {
        return reply.status(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
      }
    }
  );

  // =========================================================================
  // 6. LIBRARY SAVES (HYBRID PATTERN)
  // =========================================================================

  /**
   * POST /:id/save
   * Saves playlist to user library.
   */
  fastify.post(
    "/:id/save",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const res = await playlistsService.savePlaylist(request.user.id, id);
        return reply.status(200).send(res);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * DELETE /:id/save
   * Removes playlist from user library.
   */
  fastify.delete(
    "/:id/save",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const res = await playlistsService.unsavePlaylist(request.user.id, id);
        return reply.status(200).send(res);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  // =========================================================================
  // 7. COLLABORATION LIFECYCLE
  // =========================================================================

  /**
   * POST /:id/collaboration/enable
   * Enables collaboration and generates invite token (Owner only).
   */
  fastify.post(
    "/:id/collaboration/enable",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const res = await playlistsService.enableCollaboration(request.user.id, id);
        return reply.status(200).send(res);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * POST /:id/collaboration/regenerate
   * Regenerates collaboration token, invalidating previous links (Owner only).
   */
  fastify.post(
    "/:id/collaboration/regenerate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const res = await playlistsService.regenerateCollaborationToken(request.user.id, id);
        return reply.status(200).send(res);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * POST /:id/collaboration/disable
   * Disables collaboration and purges non-owner collaborators (Owner only).
   */
  fastify.post(
    "/:id/collaboration/disable",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await playlistsService.disableCollaboration(request.user.id, id);
        return reply.status(200).send({ success: true, message: "Collaboration disabled successfully" });
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * POST /:id/collaborate/join
   * Joins collaboration via invite token.
   */
  fastify.post(
    "/:id/collaborate/join",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = joinCollaborationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const res = await playlistsService.joinCollaboration(
          request.user.id,
          id,
          parseResult.data.token
        );
        return reply.status(200).send(res);
      } catch (err: any) {
        return reply.status(400).send({ statusCode: 400, error: "Bad Request", message: err.message });
      }
    }
  );

  /**
   * GET /:id/collaborators
   * Lists collaborators of the playlist (Owner or Collaborator).
   */
  fastify.get(
    "/:id/collaborators",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const collaborators = await playlistsService.listCollaborators(request.user.id, id);
        return reply.status(200).send({ collaborators });
      } catch (err: any) {
        return reply.status(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
      }
    }
  );

  /**
   * DELETE /:id/collaborators/:userId
   * Removes specific collaborator (Owner only).
   */
  fastify.delete(
    "/:id/collaborators/:targetUserId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id, targetUserId } = request.params as { id: string; targetUserId: string };
      try {
        await playlistsService.removeCollaborator(request.user.id, id, targetUserId);
        return reply.status(200).send({ success: true, message: "Collaborator removed successfully" });
      } catch (err: any) {
        return reply.status(403).send({ statusCode: 403, error: "Forbidden", message: err.message });
      }
    }
  );
};
