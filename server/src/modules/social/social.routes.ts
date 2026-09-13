import type { FastifyPluginAsync } from "fastify";
import { SocialService } from "./social.service";
import {
  userFollowParamSchema,
  respondFollowRequestSchema,
  searchUsersQuerySchema,
  socialFeedQuerySchema,
} from "./social.schemas";
import { requireAuth } from "../auth/auth.guards";

export const socialRoutes: FastifyPluginAsync = async (fastify) => {
  const socialService = new SocialService();

  /**
   * POST /users/:targetUserId/follow
   * Follow a user or sends a follow request if target is private.
   */
  fastify.post(
    "/users/:targetUserId/follow",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseParams = userFollowParamSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid target user ID",
        });
      }

      try {
        const result = await socialService.followUser(
          request.user.id,
          parseParams.data.targetUserId
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message,
        });
      }
    }
  );

  /**
   * DELETE /users/:targetUserId/follow
   * Unfollow a user or cancel an outgoing pending request.
   */
  fastify.delete(
    "/users/:targetUserId/follow",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseParams = userFollowParamSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid target user ID",
        });
      }

      const result = await socialService.unfollowUser(
        request.user.id,
        parseParams.data.targetUserId
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /users/:targetUserId/relationship
   * Retrieves granular relationship (SELF, NONE, PENDING_SENT, PENDING_RECEIVED, FOLLOWING, FRIENDS).
   */
  fastify.get(
    "/users/:targetUserId/relationship",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseParams = userFollowParamSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid target user ID",
        });
      }

      const status = await socialService.getRelationshipStatus(
        request.user.id,
        parseParams.data.targetUserId
      );

      return reply.status(200).send({ status });
    }
  );

  /**
   * GET /requests/incoming
   * List all pending follow requests received by the authenticated user.
   */
  fastify.get(
    "/requests/incoming",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const requests = await socialService.getIncomingRequests(request.user.id);
      return reply.status(200).send({ requests });
    }
  );

  /**
   * POST /requests/:requesterId/accept
   * Accept an incoming follow request.
   */
  fastify.post(
    "/requests/:requesterId/accept",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseParams = respondFollowRequestSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid requester ID",
        });
      }

      try {
        const result = await socialService.acceptFollowRequest(
          request.user.id,
          parseParams.data.requesterId
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message,
        });
      }
    }
  );

  /**
   * POST /requests/:requesterId/reject
   * Reject an incoming follow request.
   */
  fastify.post(
    "/requests/:requesterId/reject",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseParams = respondFollowRequestSchema.safeParse(request.params);
      if (!parseParams.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid requester ID",
        });
      }

      const result = await socialService.rejectFollowRequest(
        request.user.id,
        parseParams.data.requesterId
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /friends
   * List mutual friends (two-way accepted follows) for the authenticated user.
   */
  fastify.get(
    "/friends",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const friends = await socialService.getMutualFriends(request.user.id);
      return reply.status(200).send({ friends });
    }
  );

  /**
   * GET /users/:targetUserId/followers
   * Public or authenticated lookup of a user's followers.
   */
  fastify.get("/users/:targetUserId/followers", async (request, reply) => {
    const parseParams = userFollowParamSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid target user ID",
      });
    }

    const followers = await socialService.getFollowers(
      parseParams.data.targetUserId
    );
    return reply.status(200).send({ followers });
  });

  /**
   * GET /users/:targetUserId/following
   * Public or authenticated lookup of who a user follows.
   */
  fastify.get("/users/:targetUserId/following", async (request, reply) => {
    const parseParams = userFollowParamSchema.safeParse(request.params);
    if (!parseParams.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid target user ID",
      });
    }

    const following = await socialService.getFollowing(
      parseParams.data.targetUserId
    );
    return reply.status(200).send({ following });
  });

  /**
   * GET /users/search
   * Community directory search with live relationship status.
   */
  fastify.get(
    "/users/search",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseQuery = searchUsersQuerySchema.safeParse(request.query);
      const query = parseQuery.success ? parseQuery.data.query : undefined;
      const limit = parseQuery.success ? parseQuery.data.limit : 20;

      const users = await socialService.searchUsers(
        request.user.id,
        query,
        limit
      );
      return reply.status(200).send({ users });
    }
  );

  /**
   * GET /feed
   * Aggregated social activity feed (new releases from followed artists, friend playlists & likes).
   * Supports cursor pagination: ?cursor=...&limit=20&filter=all|releases|playlists|friends
   */
  fastify.get(
    "/feed",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseQuery = socialFeedQuerySchema.safeParse(request.query);
      if (!parseQuery.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid feed query parameters",
          errors: parseQuery.error.flatten().fieldErrors,
        });
      }

      const feed = await socialService.getFeed(
        request.user.id,
        parseQuery.data
      );
      return reply.status(200).send(feed);
    }
  );
};
