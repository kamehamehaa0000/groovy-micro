import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { commentsService } from "./comments.service";
import {
  listCommentsQuerySchema,
  listRepliesQuerySchema,
  createCommentSchema,
  updateCommentSchema,
  voteCommentSchema,
} from "./comments.schemas";
import { requireAuth, optionalAuth } from "../auth/auth.guards";
import { z } from "zod";

export const commentsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /
   * Lists top-level comments for a song, album, or playlist.
   */
  fastify.get(
    "/",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = listCommentsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid query parameters",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await commentsService.getComments(
          parseResult.data,
          request.user?.id,
          request.user?.role
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  /**
   * GET /votes/mine
   * Fast sync: returns current user's comment vote map ({ [commentId]: 1 | -1 }).
   */
  fastify.get(
    "/votes/mine",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const votes = await commentsService.getUserVotes(request.user.id);
      return reply.status(200).send({ votes });
    }
  );

  /**
   * GET /:id/replies
   * Retrieves paginated child replies for a comment.
   */
  fastify.get(
    "/:id/replies",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = listRepliesQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid query parameters",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await commentsService.getReplies(
          id,
          parseResult.data,
          request.user?.id,
          request.user?.role
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  /**
   * POST /
   * Creates a root comment or reply.
   */
  fastify.post(
    "/",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parseResult = createCommentSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const newComment = await commentsService.createComment(
          request.user.id,
          parseResult.data
        );
        return reply.status(201).send({ comment: newComment });
      } catch (err: any) {
        if (err.message.includes("disabled")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        }
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  /**
   * PATCH /:id
   * Updates an existing comment's text.
   */
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateCommentSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const updated = await commentsService.updateComment(
          request.user.id,
          id,
          parseResult.data
        );
        return reply.status(200).send({ comment: updated });
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err.message.includes("only edit your own") || err.message.includes("Cannot edit a deleted")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  /**
   * DELETE /:id
   * Deletes or soft-deletes a comment.
   */
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await commentsService.deleteComment(
          request.user.id,
          id,
          request.user.role
        );
        return reply.status(200).send({
          success: true,
          message: result.softDeleted
            ? "Comment soft-deleted to preserve thread"
            : "Comment deleted successfully",
          softDeleted: result.softDeleted,
        });
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err.message.includes("permission")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  /**
   * POST /:id/vote
   * Votes on a comment (+1 like, -1 dislike, 0 remove).
   */
  fastify.post(
    "/:id/vote",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = voteCommentSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await commentsService.voteComment(
          request.user.id,
          id,
          parseResult.data.vote
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err.message.includes("deleted")) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  /**
   * PATCH /:id/pin
   * Toggles pin status on a root comment (entity owner only).
   */
  fastify.patch(
    "/:id/pin",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await commentsService.pinComment(request.user.id, id);
        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message.includes("not found")) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err.message.includes("creator") || err.message.includes("top-level")) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );
};
