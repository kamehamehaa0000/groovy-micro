import type { FastifyPluginAsync } from "fastify";
import { ArtistsService } from "./artists.service";
import { AuthService } from "../auth/auth.service";
import {
  requireAuth,
  requireRole,
  optionalAuth,
} from "../auth/auth.guards";
import { setRefreshTokenCookie } from "../auth/auth.utils";
import {
  createArtistSchema,
  updateArtistSchema,
  requestVerificationSchema,
  searchArtistsQuerySchema,
  adminListArtistsQuerySchema,
  adminVerifyArtistSchema,
} from "./artists.schemas";

export const artistsRoutes: FastifyPluginAsync = async (fastify) => {
  const artistsService = new ArtistsService();
  const authService = new AuthService(fastify);

  /**
   * POST /
   * Instantly upgrades an authenticated listener to ARTIST and creates profile.
   * Issues fresh access token with role 'ARTIST' and updates refresh cookie.
   */
  fastify.post(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = createArtistSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await artistsService.createArtistProfile(
          request.user.id,
          parseResult.data
        );

        // Issue refreshed tokens reflecting new role
        const tokens = await authService.issueTokenPair(result.user);
        setRefreshTokenCookie(reply, tokens.refreshToken);

        return reply.status(201).send({
          profile: result.profile,
          user: result.user,
          accessToken: tokens.accessToken,
        });
      } catch (err: any) {
        const isConflict =
          err.message?.includes("already") || err.message?.includes("taken");
        return reply.status(isConflict ? 409 : 400).send({
          statusCode: isConflict ? 409 : 400,
          error: isConflict ? "Conflict" : "Bad Request",
          message: err.message || "Failed to create artist profile",
        });
      }
    }
  );

  /**
   * GET /me
   * Retrieves logged-in artist's own profile and studio telemetry.
   */
  fastify.get(
    "/me",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const profile = await artistsService.getMyArtistProfile(request.user.id);
      if (!profile) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Artist profile not found",
        });
      }

      return reply.status(200).send(profile);
    }
  );

  /**
   * PATCH /me
   * Updates own artist profile (stage name, slug, bio, banner, socials).
   */
  fastify.patch(
    "/me",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const parseResult = updateArtistSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await artistsService.updateArtistProfile(
          request.user.id,
          parseResult.data
        );

        return reply.status(200).send({
          profile: updated,
        });
      } catch (err: any) {
        const isConflict = err.message?.includes("already taken");
        return reply.status(isConflict ? 409 : 400).send({
          statusCode: isConflict ? 409 : 400,
          error: isConflict ? "Conflict" : "Bad Request",
          message: err.message || "Failed to update artist profile",
        });
      }
    }
  );

  /**
   * POST /me/request-verification
   * Submits a verification pitch and portfolio links to the admin desk.
   */
  fastify.post(
    "/me/request-verification",
    { preHandler: [requireAuth, requireRole("ARTIST", "ADMIN")] },
    async (request, reply) => {
      const parseResult = requestVerificationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await artistsService.requestVerification(
          request.user.id,
          parseResult.data
        );

        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to submit verification request",
        });
      }
    }
  );

  /**
   * GET /
   * Searches and lists artists with pagination.
   */
  fastify.get("/", async (request, reply) => {
    const parseResult = searchArtistsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid query parameters",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const result = await artistsService.searchArtists(parseResult.data);
    return reply.status(200).send(result);
  });

  /**
   * GET /:idOrSlug
   * Retrieves an artist profile by either UUID or custom slug.
   * Public endpoint; enriches with isFollowing if authenticated.
   */
  fastify.get(
    "/:idOrSlug",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const { idOrSlug } = request.params as { idOrSlug: string };
      const profile = await artistsService.getArtistByIdOrSlug(
        idOrSlug,
        request.user?.id
      );

      if (!profile) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Artist not found",
        });
      }

      return reply.status(200).send(profile);
    }
  );

  /**
   * POST /:id/follow
   * Follows an artist.
   */
  fastify.post(
    "/:id/follow",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await artistsService.followArtist(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        const isNotFound = err.message?.includes("not found");
        return reply.status(isNotFound ? 404 : 400).send({
          statusCode: isNotFound ? 404 : 400,
          error: isNotFound ? "Not Found" : "Bad Request",
          message: err.message || "Failed to follow artist",
        });
      }
    }
  );

  /**
   * DELETE /:id/follow
   * Unfollows an artist.
   */
  fastify.delete(
    "/:id/follow",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await artistsService.unfollowArtist(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message || "Failed to unfollow artist",
        });
      }
    }
  );

  /**
   * GET /:id/following
   * Checks whether the authenticated user follows the artist.
   */
  fastify.get(
    "/:id/following",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const isFollowing = await artistsService.checkIsFollowing(
        request.user.id,
        id
      );
      return reply.status(200).send({ isFollowing });
    }
  );
};

/**
 * Admin Verification Desk Routes (/api/v1/admin/artists)
 */
export const adminArtistsRoutes: FastifyPluginAsync = async (fastify) => {
  const artistsService = new ArtistsService();

  /**
   * GET /
   * Lists artist profiles filtered by verification status with pagination.
   */
  fastify.get(
    "/",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const parseResult = adminListArtistsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid query parameters",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await artistsService.adminListArtists(parseResult.data);
      return reply.status(200).send(result);
    }
  );

  /**
   * PATCH /:id/verify
   * Approves or rejects an artist's verification application.
   */
  fastify.patch(
    "/:id/verify",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = adminVerifyArtistSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await artistsService.adminReviewVerification(
          id,
          parseResult.data
        );

        return reply.status(200).send({
          id: updated.id,
          verified: updated.verified,
          verificationStatus: updated.verificationStatus,
          rejectionReason: updated.rejectionReason,
        });
      } catch (err: any) {
        const isNotFound = err.message?.includes("not found");
        return reply.status(isNotFound ? 404 : 400).send({
          statusCode: isNotFound ? 404 : 400,
          error: isNotFound ? "Not Found" : "Bad Request",
          message: err.message || "Failed to update verification status",
        });
      }
    }
  );
};
