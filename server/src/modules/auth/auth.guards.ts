import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import { redis } from "../../index";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  AuthenticatedUser,
  UserRole,
} from "./auth.schemas";
import { REFRESH_TOKEN_TTL_SEC } from "./auth.utils";

// Module augmentation for Fastify Request and JWT
declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload | RefreshTokenPayload;
    user: AuthenticatedUser;
  }
}

/**
 * PreHandler Guard: Ensures the request carries a valid, unexpired, and unrevoked JWT.
 * Validates against token_version in Redis (falling back to PostgreSQL).
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  let token: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (request.cookies?.access_token) {
    token = request.cookies.access_token;
  }

  if (!token) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  let payload: AccessTokenPayload;
  try {
    payload = request.server.jwt.verify<AccessTokenPayload>(token);
  } catch (err: any) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message:
        err.name === "TokenExpiredError"
          ? "Access token has expired"
          : "Invalid access token",
    });
  }

  // Check token_version for instant revocation
  const redisKey = `user:${payload.sub}:token_version`;
  let activeVersionStr = await redis.get(redisKey);

  let activeVersion: number;
  if (activeVersionStr !== null) {
    activeVersion = parseInt(activeVersionStr, 10);
  } else {
    // Cache miss: query PostgreSQL
    const [user] = await db
      .select({ tokenVersion: users.tokenVersion, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Account is inactive or does not exist",
      });
    }

    activeVersion = user.tokenVersion;
    await redis.set(
      redisKey,
      activeVersion.toString(),
      "EX",
      REFRESH_TOKEN_TTL_SEC
    );
  }

  if (payload.tokenVersion < activeVersion) {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Session has been revoked. Please sign in again.",
    });
  }

  // Attach authenticated identity to Fastify request
  request.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    tokenVersion: payload.tokenVersion,
  };
}

/**
 * PreHandler Guard: Enforces Role-Based Access Control (RBAC).
 * Must be used in combination with requireAuth.
 *
 * Example: preHandler: [requireAuth, requireRole('ARTIST', 'ADMIN')]
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "You do not have permission to access this resource",
      });
    }
  };
}
