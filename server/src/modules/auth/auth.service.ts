import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
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
import { MailService } from "./mail.service";

const VERIFICATION_TOKEN_TTL_SEC = 24 * 60 * 60; // 24 hours
const VERIFICATION_COOLDOWN_SEC = 60; // 60 seconds
const PASSWORD_RESET_TOKEN_TTL_SEC = 60 * 60; // 1 hour
const PASSWORD_RESET_COOLDOWN_SEC = 60; // 60 seconds

export class AuthService {
  private fastify: FastifyInstance;
  private mailService: MailService;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.mailService = new MailService(fastify.log);
  }

  /**
   * Generates a cryptographically random 32-byte token,
   * stores its SHA-256 hash in Redis, and sets a 60-second cooldown.
   */
  private async generateAndStoreVerificationToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await redis.set(
      `email_verify:${tokenHash}`,
      userId,
      "EX",
      VERIFICATION_TOKEN_TTL_SEC
    );

    await redis.set(
      `email_verify_cooldown:${userId}`,
      "1",
      "EX",
      VERIFICATION_COOLDOWN_SEC
    );

    return rawToken;
  }

  /**
   * Generates a cryptographically random 32-byte password reset token,
   * stores its SHA-256 hash in Redis, and sets a 60-second cooldown on the email.
   */
  private async generateAndStorePasswordResetToken(
    userId: string,
    email: string
  ): Promise<string> {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await redis.set(
      `pwd_reset:${tokenHash}`,
      userId,
      "EX",
      PASSWORD_RESET_TOKEN_TTL_SEC
    );

    await redis.set(
      `pwd_reset_cooldown:${email}`,
      "1",
      "EX",
      PASSWORD_RESET_COOLDOWN_SEC
    );

    return rawToken;
  }

  /**
   * Generates Access Token and Refresh Token pair, persisting session in Redis.
   */
  public async issueTokenPair(user: {
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
   * 1. users row (isEmailVerified = false)
   * 2. user_subscriptions row (plan: 'free')
   * 3. outbox_events row (USER_REGISTERED)
   * Dispatches email verification link asynchronously without issuing auth tokens.
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

    // 4. Generate email verification token & dispatch asynchronously
    const rawToken = await this.generateAndStoreVerificationToken(newUser.id);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const verificationUrl = `${clientUrl}/verify-email?token=${rawToken}`;

    this.mailService
      .sendVerificationEmail({
        to: newUser.email,
        displayName: newUser.displayName,
        verificationUrl,
      })
      .catch((err) => {
        this.fastify.log.error(
          { err: err.message, userId: newUser.id },
          "Failed to dispatch initial verification email"
        );
      });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
        isEmailVerified: false,
      },
      message:
        "Account created successfully. Please check your email to verify your account before logging in.",
    };
  }

  /**
   * Login with email and password with timing attack mitigation and verification guard.
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

    // Require email verification before logging in
    if (!user.isEmailVerified) {
      throw this.fastify.httpErrors.forbidden(
        "Please verify your email before logging in. Check your inbox for the verification link."
      );
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

    // Case A: Missing session (expired naturally or evicted)
    // Return 401 without incrementing tokenVersion (do NOT penalize legitimate expired sessions)
    if (!sessionStatus) {
      throw this.fastify.httpErrors.unauthorized(
        "Refresh token expired or invalid. Please sign in again."
      );
    }

    // Case B: Token was already rotated — check concurrency grace window (30s)
    if (sessionStatus !== "active") {
      let parsed: {
        status?: string;
        rotatedAt?: number;
        accessToken?: string;
        refreshToken?: string;
      } | null = null;

      try {
        parsed = JSON.parse(sessionStatus);
      } catch {
        // legacy non-JSON value
      }

      const GRACE_PERIOD_MS = 30_000; // 30s leeway for network retries and React StrictMode
      if (
        parsed &&
        parsed.status === "rotated" &&
        parsed.rotatedAt &&
        Date.now() - parsed.rotatedAt < GRACE_PERIOD_MS &&
        parsed.accessToken &&
        parsed.refreshToken
      ) {
        this.fastify.log.info(
          { userId: user.id, familyId, jti },
          "Refresh token presented within concurrency grace window. Returning rotated token pair."
        );
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
        };
      }

      // Case C: Reuse Detection / Theft Alert!
      // Old token replayed past the grace window — attacker has compromised this token family!
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
        "🚨 SECURITY ALERT: Refresh token reuse detected outside grace window! All user sessions revoked."
      );

      throw this.fastify.httpErrors.unauthorized(
        "Security Alert: Compromised session detected. All sessions have been logged out."
      );
    }

    // Case D: Legitimate rotation (sessionStatus === "active")
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

    // Mark current token as rotated with 120s TTL (allows 30s grace window + theft detection)
    const rotatedRecord = {
      status: "rotated",
      rotatedAt: Date.now(),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };

    await redis.set(sessionKey, JSON.stringify(rotatedRecord), "EX", 120);

    // Register new session as active
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

      // Purge any associated grace-window or older rotation keys for this token family
      const familyKeys = await redis.keys(`session:${payload.familyId}:*`);
      if (familyKeys.length > 0) {
        await redis.del(...familyKeys);
      }
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
   * Validates an email verification token, marks user verified, and issues auth tokens.
   */
  async verifyEmail(rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const redisKey = `email_verify:${tokenHash}`;
    const userId = await redis.get(redisKey);

    if (!userId) {
      throw this.fastify.httpErrors.badRequest(
        "Verification link has expired or is invalid. Please request a new verification email."
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw this.fastify.httpErrors.notFound("User not found");
    }

    if (!user.isActive) {
      throw this.fastify.httpErrors.forbidden("Account has been suspended");
    }

    // Mark user as email-verified
    const [updatedUser] = await db
      .update(users)
      .set({
        isEmailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    // Consume verification token from Redis
    await redis.del(redisKey);
    await redis.del(`email_verify_cooldown:${userId}`);

    // Issue initial token pair so user is automatically logged in upon verification
    const tokens = await this.issueTokenPair({
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      tokenVersion: updatedUser.tokenVersion,
    });

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        role: updatedUser.role,
        avatarUrl: updatedUser.avatarUrl,
        isEmailVerified: true,
      },
      ...tokens,
    };
  }

  /**
   * Resends verification email for unverified user accounts (public endpoint).
   * Defends against user enumeration and rate-limits via 60-second Redis cooldown.
   */
  async resendVerification(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Email enumeration protection: return uniform response if user doesn't exist
    if (!user) {
      return {
        success: true,
        message:
          "If an unverified account exists with that email, a verification link has been sent.",
      };
    }

    if (user.isEmailVerified) {
      throw this.fastify.httpErrors.badRequest(
        "This account's email is already verified. You can sign in directly."
      );
    }

    if (!user.isActive) {
      throw this.fastify.httpErrors.forbidden("Account has been suspended");
    }

    // Check cooldown
    const isCooldownActive = await redis.get(`email_verify_cooldown:${user.id}`);
    if (isCooldownActive) {
      throw this.fastify.httpErrors.tooManyRequests(
        "Please wait 60 seconds before requesting another verification email."
      );
    }

    const rawToken = await this.generateAndStoreVerificationToken(user.id);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const verificationUrl = `${clientUrl}/verify-email?token=${rawToken}`;

    try {
      await this.mailService.sendVerificationEmail({
        to: user.email,
        displayName: user.displayName,
        verificationUrl,
      });
    } catch (err: any) {
      this.fastify.log.error(
        { err: err.message, userId: user.id },
        "MailService failed during resendVerification"
      );
      throw this.fastify.httpErrors.serviceUnavailable(
        "Unable to send verification email right now. Please try again in a few moments."
      );
    }

    return {
      success: true,
      message: "Verification email sent successfully. Please check your inbox.",
    };
  }

  /**
   * Dispatches a password reset link to the user's email.
   * Defends against email enumeration by returning a uniform success message,
   * and rate-limits via a 60-second Redis cooldown on the email address.
   */
  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check cooldown on email
    const isCooldownActive = await redis.get(`pwd_reset_cooldown:${normalizedEmail}`);
    if (isCooldownActive) {
      throw this.fastify.httpErrors.tooManyRequests(
        "Please wait 60 seconds before requesting another password reset email."
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Uniform response if user doesn't exist or is suspended (prevents user enumeration)
    if (!user || !user.isActive) {
      // Set cooldown anyway to prevent spam / timing enumeration
      await redis.set(
        `pwd_reset_cooldown:${normalizedEmail}`,
        "1",
        "EX",
        PASSWORD_RESET_COOLDOWN_SEC
      );
      // Run dummy password check for timing attack equalization
      await runDummyPasswordCheck();

      return {
        success: true,
        message:
          "If an account with that email exists, password reset instructions have been sent.",
      };
    }

    const rawToken = await this.generateAndStorePasswordResetToken(
      user.id,
      normalizedEmail
    );
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        displayName: user.displayName,
        resetUrl,
      });
    } catch (err: any) {
      this.fastify.log.error(
        { err: err.message, userId: user.id },
        "MailService failed during forgotPassword"
      );
    }

    return {
      success: true,
      message:
        "If an account with that email exists, password reset instructions have been sent.",
    };
  }

  /**
   * Resets password using a validated cryptographic token.
   * Updates password hash with Argon2id, revokes all active sessions via tokenVersion++,
   * invalidates the token in Redis, and emits a transactional outbox event.
   */
  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const redisKey = `pwd_reset:${tokenHash}`;
    const userId = await redis.get(redisKey);

    if (!userId) {
      throw this.fastify.httpErrors.badRequest(
        "Password reset link has expired or is invalid. Please request a new one."
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw this.fastify.httpErrors.notFound("User not found");
    }

    if (!user.isActive) {
      throw this.fastify.httpErrors.forbidden("Account has been suspended");
    }

    const newPasswordHash = await hashPassword(newPassword);
    const nextTokenVersion = user.tokenVersion + 1;

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          tokenVersion: nextTokenVersion,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      await tx.insert(outboxEvents).values({
        aggregateType: "USER",
        aggregateId: user.id,
        eventType: "USER_PASSWORD_RESET",
        payload: {
          userId: user.id,
          email: user.email,
        },
      });
    });

    // Revoke cached session / update tokenVersion in Redis
    await redis.set(
      `user:${userId}:token_version`,
      nextTokenVersion,
      "EX",
      REFRESH_TOKEN_TTL_SEC
    );

    // Consume the token from Redis
    await redis.del(redisKey);
    await redis.del(`pwd_reset_cooldown:${user.email}`);

    return {
      success: true,
      message:
        "Your password has been successfully reset. You can now log in with your new password.",
    };
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
        isPrivateAccount: users.isPrivateAccount,
        listeningActivityPrivacy: users.listeningActivityPrivacy,
        libraryPrivacy: users.libraryPrivacy,
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
