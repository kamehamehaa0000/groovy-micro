import type { FastifyPluginAsync } from "fastify";
import { UsersService } from "./users.service";
import {
  updateProfileSchema,
  updatePasswordSchema,
  updatePrivacySettingsSchema,
  userParamSchema,
} from "./users.schemas";
import { requireAuth, optionalAuth } from "../auth/auth.guards";
import { setRefreshTokenCookie } from "../auth/auth.utils";

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const usersService = new UsersService(fastify);

  /**
   * PATCH /profile
   * Updates user display name and/or avatar URL.
   */
  fastify.patch(
    "/profile",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = updateProfileSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const updatedUser = await usersService.updateProfile(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send({
        user: updatedUser,
      });
    }
  );

  /**
   * PATCH /password
   * Updates user password using Argon2id and revokes other active sessions.
   */
  fastify.patch(
    "/password",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = updatePasswordSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await usersService.updatePassword(
        request.user.id,
        parseResult.data
      );

      if (result.tokens) {
        setRefreshTokenCookie(reply, result.tokens.refreshToken);
        return reply.status(200).send({
          message: result.message,
          accessToken: result.tokens.accessToken,
        });
      }

      return reply.status(200).send({
        message: result.message,
      });
    }
  );

  /**
   * PATCH /privacy-settings
   * Updates user privacy preferences (private account, listening activity, library privacy).
   */
  fastify.patch(
    "/privacy-settings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = updatePrivacySettingsSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const updated = await usersService.updatePrivacySettings(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send({
        settings: updated,
      });
    }
  );

  /**
   * GET /:id
   * Public user profile details with follower/following stats and relationship.
   */
  fastify.get(
    "/:id",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseParams = userParamSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid user ID format",
        });
      }

      try {
        const result = await usersService.getUserProfile(
          parseParams.data.id,
          request.user?.id
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        const statusCode = err.statusCode || 400;
        return reply.status(statusCode).send({
          statusCode,
          error: err.name || "Error",
          message: err.message,
        });
      }
    }
  );

  /**
   * GET /:id/profile
   * Alias for GET /:id
   */
  fastify.get(
    "/:id/profile",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseParams = userParamSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid user ID format",
        });
      }

      try {
        const result = await usersService.getUserProfile(
          parseParams.data.id,
          request.user?.id
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        const statusCode = err.statusCode || 400;
        return reply.status(statusCode).send({
          statusCode,
          error: err.name || "Error",
          message: err.message,
        });
      }
    }
  );

  /**
   * GET /:id/library
   * User's public/shared library collections (created playlists, saved playlists,
   * saved albums, presaved releases, liked songs).
   * Enforces target user's libraryPrivacy: PUBLIC, FOLLOWERS_ONLY, or PRIVATE.
   */
  fastify.get(
    "/:id/library",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseParams = userParamSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid user ID format",
        });
      }

      try {
        const result = await usersService.getUserLibrary(
          parseParams.data.id,
          request.user?.id
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        const statusCode = err.statusCode || 400;
        return reply.status(statusCode).send({
          statusCode,
          error: err.name || "Error",
          message: err.message,
          libraryPrivacy: err.libraryPrivacy,
        });
      }
    }
  );
};

