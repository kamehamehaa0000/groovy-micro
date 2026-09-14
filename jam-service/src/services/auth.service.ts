import type { FastifyInstance } from "fastify";
import { redis, redisKeys } from "../redis";
import type { AuthenticatedUser } from "../types";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number;
}

/**
 * Validates a JWT access token and checks active token_version in Redis.
 */
export async function authenticateToken(
  fastify: FastifyInstance,
  token: string,
  extraProfile?: { displayName?: string; avatarUrl?: string | null }
): Promise<AuthenticatedUser | null> {
  try {
    const payload = fastify.jwt.verify<AccessTokenPayload>(token);

    if (!payload || !payload.sub) {
      return null;
    }

    // Check token_version for instant session revocation
    const versionKey = redisKeys.userTokenVersion(payload.sub);
    const activeVersionStr = await redis.get(versionKey);

    if (activeVersionStr !== null) {
      const activeVersion = parseInt(activeVersionStr, 10);
      if (payload.tokenVersion < activeVersion) {
        return null; // Session revoked
      }
    }

    // Retrieve cached user profile from Redis if available
    let displayName = extraProfile?.displayName;
    let avatarUrl = extraProfile?.avatarUrl ?? null;

    if (!displayName) {
      const cachedProfile = await redis.get(`user:${payload.sub}:profile`);
      if (cachedProfile) {
        try {
          const parsed = JSON.parse(cachedProfile);
          displayName = parsed.displayName;
          avatarUrl = parsed.avatarUrl ?? null;
        } catch {
          // ignore parsing error
        }
      }
    }

    if (!displayName) {
      displayName = payload.email ? payload.email.split("@")[0] : "Listener";
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "LISTENER",
      displayName,
      avatarUrl,
      tokenVersion: payload.tokenVersion,
    };
  } catch {
    return null;
  }
}
