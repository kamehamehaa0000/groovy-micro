import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { users, artistProfiles } from '../../db/schema'
import { redis } from '../../index'
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  AuthenticatedUser,
  UserRole,
} from './auth.schemas'
import { REFRESH_TOKEN_TTL_SEC } from './auth.utils'
import { cacheKeys } from '../../lib/cache'

// Module augmentation for Fastify Request and JWT
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload | RefreshTokenPayload
    user: AuthenticatedUser
  }
}

/**
 * PreHandler Guard: Ensures the request carries a valid, unexpired, and unrevoked JWT.
 * Validates against token_version in Redis (falling back to PostgreSQL).
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let token: string | undefined

  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  } else if (request.cookies?.access_token) {
    token = request.cookies.access_token
  } else if (typeof (request.query as any)?.token === 'string') {
    token = (request.query as any).token
  }

  if (!token) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required',
    })
  }

  let payload: AccessTokenPayload
  try {
    payload = request.server.jwt.verify<AccessTokenPayload>(token)
  } catch (err: any) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message:
        err.name === 'TokenExpiredError'
          ? 'Access token has expired'
          : 'Invalid access token',
    })
  }

  // Check token_version for instant revocation
  const redisKey = cacheKeys.auth.tokenVersion(payload.sub)
  let activeVersionStr = await redis.get(redisKey)

  let activeVersion: number
  if (activeVersionStr !== null) {
    activeVersion = parseInt(activeVersionStr, 10)
  } else {
    // Cache miss: query PostgreSQL
    const [user] = await db
      .select({ tokenVersion: users.tokenVersion, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)

    if (!user || !user.isActive) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Account is inactive or does not exist',
      })
    }

    activeVersion = user.tokenVersion
    await redis.set(
      redisKey,
      activeVersion.toString(),
      'EX',
      REFRESH_TOKEN_TTL_SEC,
    )
  }

  if (payload.tokenVersion < activeVersion) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Session has been revoked. Please sign in again.',
    })
  }

  // Attach authenticated identity to Fastify request
  request.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    tokenVersion: payload.tokenVersion,
  }
}

/**
 * Resolves the role a user should be authorized as, reading the database rather than
 * trusting a token claim that may predate a promotion.
 *
 * `users.role` is a denormalized view of "this account owns an artist profile", so a
 * column that lags behind must never lock an artist out of their own studio: when the
 * stored role is LISTENER, the profile decides. Resolving the fact here is what lets
 * the GET endpoints report an effective role without repairing the column as a side
 * effect.
 */
export async function resolveUserRole(
  userId: string,
  storedRole?: UserRole | null,
): Promise<UserRole | null> {
  let role = storedRole ?? null

  if (!role) {
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    role = row?.role ?? null
  }

  if (role && role !== 'LISTENER') {
    return role
  }

  // Only a listener can be hidden behind a promotion, so this extra lookup stays rare.
  const [profile] = await db
    .select({ id: artistProfiles.id })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId))
    .limit(1)

  return profile ? 'ARTIST' : role
}

/**
 * PreHandler Guard: Enforces Role-Based Access Control (RBAC).
 * Must be used in combination with requireAuth.
 *
 * Example: preHandler: [requireAuth, requireRole('ARTIST', 'ADMIN')]
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      })
    }

    if (allowedRoles.includes(request.user.role)) {
      return
    }

    // The claim can be stale (a promotion does not invalidate access tokens), so
    // resolve the role from the database, treating a profile owner as an artist even
    // if the stored role lags behind.
    const freshRole = await resolveUserRole(request.user.id, request.user.role)

    if (freshRole && allowedRoles.includes(freshRole)) {
      request.user.role = freshRole
      return
    }

    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
    })
  }
}

/**
 * PreHandler Guard: Optionally populates request.user if a valid JWT is supplied,
 * but never fails or rejects the request if unauthenticated or anonymous.
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  let token: string | undefined

  const authHeader = request.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  } else if (request.cookies?.access_token) {
    token = request.cookies.access_token
  } else if (typeof (request.query as any)?.token === 'string') {
    token = (request.query as any).token
  }

  if (!token) {
    return
  }

  try {
    const payload = request.server.jwt.verify<AccessTokenPayload>(token)

    const redisKey = cacheKeys.auth.tokenVersion(payload.sub)
    let activeVersionStr = await redis.get(redisKey)

    let activeVersion: number
    if (activeVersionStr !== null) {
      activeVersion = parseInt(activeVersionStr, 10)
    } else {
      const [user] = await db
        .select({ tokenVersion: users.tokenVersion, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1)

      if (!user || !user.isActive) {
        return
      }
      activeVersion = user.tokenVersion
    }

    if (payload.tokenVersion >= activeVersion) {
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tokenVersion: payload.tokenVersion,
      }
    }
  } catch {
    // Unauthenticated/invalid token - silently continue as anonymous visitor
  }
}
