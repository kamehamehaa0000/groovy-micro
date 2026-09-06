import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db";
import {
  users,
  userSubscriptions,
  subscriptionPlans,
  outboxEvents,
  type User,
} from "../../db/schema";
import { redis } from "../../index";
import {
  hashPassword,
  verifyPassword,
  runDummyPasswordCheck,
} from "./auth.hasher";
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  generateTokenIdentifiers,
  type GoogleUserInfo,
} from "./auth.utils";
import type {
  RegisterInput,
  LoginInput,
  AccessTokenPayload,
  RefreshTokenPayload,
  UserRole,
} from "./auth.schemas";

export class AuthService {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Generates Access Token and Refresh Token pair, persisting session in Redis.
   */
  private async issueTokenPair(user: {
    id: string;
    email: string;
    role: UserRole;
    tokenVersion: number;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const { familyId, jti } = generateTokenIdentifiers();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      familyId,
      jti,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.fastify.jwt.sign(accessPayload, {
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });

    const refreshToken = this.fastify.jwt.sign(refreshPayload, {
      expiresIn: REFRESH_TOKEN_TTL_SEC,
    });

    // Store active session in Redis: session:<familyId>:<jti> = "active"
    const sessionKey = `session:${familyId}:${jti}`;
    await redis.set(sessionKey, "active", "EX", REFRESH_TOKEN_TTL_SEC);

    // Cache latest token_version for quick lookup
    await redis.set(
      `user:${user.id}:token_version`,
      user.tokenVersion.toString(),
      "EX",
      REFRESH_TOKEN_TTL_SEC
    );

    return { accessToken, refreshToken };
  }

  /**
   * Register a new user with single ACID transaction:
   * 1. users row
   * 2. user_subscriptions row (plan: 'free')
   * 3. outbox_events row (USER_REGISTERED)
   */
  async register(input: RegisterInput) {
    // 1. Check if email exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existing) {
      throw this.fastify.httpErrors.conflict("Email is already registered");
    }

    // 2. Hash password with Argon2id
    const passwordHash = await hashPassword(input.password);

    // 3. Single ACID transaction
    const newUser = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          role: "LISTENER",
          isEmailVerified: false,
          isActive: true,
          tokenVersion: 0,
        })
        .returning();

      await tx.insert(userSubscriptions).values({
        userId: user.id,
        planId: "free",
        status: "active",
      });

      await tx.insert(outboxEvents).values({
        aggregateType: "USER",
        aggregateId: user.id,
        eventType: "USER_REGISTERED",
        payload: {
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
          registeredAt: new Date().toISOString(),
        },
      });

      return user;
    });

    // 4. Issue tokens
    const tokens = await this.issueTokenPair({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      tokenVersion: newUser.tokenVersion,
    });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
        isEmailVerified: newUser.isEmailVerified,
      },
      ...tokens,
    };
  }

  /**
   * Login with email and password with timing attack mitigation.
   */
  async login(input: LoginInput) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    // Timing attack defense: execute dummy hash verification if user not found
    if (!user) {
      await runDummyPasswordCheck();
      throw this.fastify.httpErrors.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw this.fastify.httpErrors.forbidden("Account has been suspended");
    }

    if (!user.passwordHash) {
      // Account created via OAuth without local password
      await runDummyPasswordCheck();
      throw this.fastify.httpErrors.badRequest(
        "This account was created with Google OAuth. Please sign in with Google."
      );
    }

    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw this.fastify.httpErrors.unauthorized("Invalid email or password");
    }

    const tokens = await this.issueTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
      },
      ...tokens,
    };
  }

  /**
   * Refresh Token Rotation with automatic theft reuse detection.
   */
  async rotateRefreshToken(rawRefreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = this.fastify.jwt.verify<RefreshTokenPayload>(rawRefreshToken);
    } catch {
      throw this.fastify.httpErrors.unauthorized("Invalid or expired refresh token");
    }

    const { sub: userId, familyId, jti, tokenVersion } = payload;

    // 1. Verify user status
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw this.fastify.httpErrors.unauthorized("User account is inactive or not found");
    }

    // 2. Global revocation check
    if (user.tokenVersion !== tokenVersion) {
      throw this.fastify.httpErrors.unauthorized(
        "Session has been revoked. Please sign in again."
      );
    }

    // 3. Inspect session state in Redis
    const sessionKey = `session:${familyId}:${jti}`;
    const sessionStatus = await redis.get(sessionKey);

    // Case A: Reuse Detection / Theft Alert!
    // If the session key is missing or marked "used", an attacker replayed an old token!
    if (sessionStatus === "used" || !sessionStatus) {
      // Global revocation: increment tokenVersion for user
      const [updated] = await db
        .update(users)
        .set({
          tokenVersion: user.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning({ tokenVersion: users.tokenVersion });

      await redis.set(
        `user:${user.id}:token_version`,
        updated.tokenVersion.toString(),
        "EX",
        REFRESH_TOKEN_TTL_SEC
      );

      this.fastify.log.warn(
        { userId: user.id, familyId, jti },
        "🚨 SECURITY ALERT: Refresh token reuse detected! All user sessions revoked."
      );

      throw this.fastify.httpErrors.unauthorized(
        "Security Alert: Compromised session detected. All sessions have been logged out."
      );
    }

    // Case B: Legitimate rotation
    // Mark current token as consumed (keep for 120s to detect rapid replay attacks)
    await redis.set(sessionKey, "used", "EX", 120);

    // Issue brand-new pair within the same token family
    const { jti: newJti } = generateTokenIdentifiers();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const newRefreshPayload: RefreshTokenPayload = {
      sub: user.id,
      familyId,
      jti: newJti,
      tokenVersion: user.tokenVersion,
    };

    const newAccessToken = this.fastify.jwt.sign(accessPayload, {
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });

    const newRefreshToken = this.fastify.jwt.sign(newRefreshPayload, {
      expiresIn: REFRESH_TOKEN_TTL_SEC,
    });

    await redis.set(
      `session:${familyId}:${newJti}`,
      "active",
      "EX",
      REFRESH_TOKEN_TTL_SEC
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Log out single session.
   */
  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) return;

    try {
      const payload =
        this.fastify.jwt.verify<RefreshTokenPayload>(rawRefreshToken);
      const sessionKey = `session:${payload.familyId}:${payload.jti}`;
      await redis.del(sessionKey);
    } catch {
      // If token is invalid or expired, no session cleanup needed
    }
  }

  /**
   * Revoke all sessions for a user (e.g. password reset or manual logout all).
   */
  async revokeAllUserSessions(userId: string) {
    const [user] = await db
      .select({ tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw this.fastify.httpErrors.notFound("User not found");
    }

    const newVersion = user.tokenVersion + 1;
    await db
      .update(users)
      .set({ tokenVersion: newVersion, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await redis.set(
      `user:${userId}:token_version`,
      newVersion.toString(),
      "EX",
      REFRESH_TOKEN_TTL_SEC
    );
  }

  /**
   * Google OAuth login & automatic account linking.
   */
  async handleGoogleUser(info: GoogleUserInfo) {
    // 1. Search by permanent googleId
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, info.sub))
      .limit(1);

    if (user) {
      if (!user.isActive) {
        throw this.fastify.httpErrors.forbidden("Account has been suspended");
      }

      const tokens = await this.issueTokenPair({
        id: user.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: user.avatarUrl,
          isEmailVerified: user.isEmailVerified,
        },
        ...tokens,
      };
    }

    // 2. Account linking via email match
    const [existingByEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, info.email.toLowerCase()))
      .limit(1);

    if (existingByEmail) {
      if (!existingByEmail.isActive) {
        throw this.fastify.httpErrors.forbidden("Account has been suspended");
      }

      // Link googleId to existing account and verify email
      const [updated] = await db
        .update(users)
        .set({
          googleId: info.sub,
          isEmailVerified: true,
          avatarUrl: existingByEmail.avatarUrl || info.picture,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id))
        .returning();

      const tokens = await this.issueTokenPair({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        tokenVersion: updated.tokenVersion,
      });

      return {
        user: {
          id: updated.id,
          email: updated.email,
          displayName: updated.displayName,
          role: updated.role,
          avatarUrl: updated.avatarUrl,
          isEmailVerified: updated.isEmailVerified,
        },
        ...tokens,
      };
    }

    // 3. Provision brand-new user via OAuth
    const newUser = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email: info.email.toLowerCase(),
          displayName: info.name,
          googleId: info.sub,
          avatarUrl: info.picture,
          role: "LISTENER",
          isEmailVerified: true,
          isActive: true,
          tokenVersion: 0,
        })
        .returning();

      await tx.insert(userSubscriptions).values({
        userId: created.id,
        planId: "free",
        status: "active",
      });

      await tx.insert(outboxEvents).values({
        aggregateType: "USER",
        aggregateId: created.id,
        eventType: "USER_REGISTERED",
        payload: {
          userId: created.id,
          email: created.email,
          displayName: created.displayName,
          provider: "google",
          registeredAt: new Date().toISOString(),
        },
      });

      return created;
    });

    const tokens = await this.issueTokenPair({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      tokenVersion: newUser.tokenVersion,
    });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
        isEmailVerified: newUser.isEmailVerified,
      },
      ...tokens,
    };
  }

  /**
   * Retrieves current authenticated user with subscription details.
   */
  async getCurrentUserProfile(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        isEmailVerified: users.isEmailVerified,
        createdAt: users.createdAt,
        subscription: {
          planId: userSubscriptions.planId,
          status: userSubscriptions.status,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
        },
        plan: {
          name: subscriptionPlans.name,
          features: subscriptionPlans.features,
        },
      })
      .from(users)
      .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .leftJoin(
        subscriptionPlans,
        eq(subscriptionPlans.id, userSubscriptions.planId)
      )
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw this.fastify.httpErrors.notFound("User not found");
    }

    return user;
  }
}
