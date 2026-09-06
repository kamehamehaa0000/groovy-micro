import type { FastifyPluginAsync } from "fastify";
import { UsersService } from "./users.service";
import {
  updateProfileSchema,
  updatePasswordSchema,
} from "./users.schemas";
import { requireAuth } from "../auth/auth.guards";
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
};
