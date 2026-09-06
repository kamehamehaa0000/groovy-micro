import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db";
import { users } from "../../db/schema";
import { redis } from "../../index";
import {
  hashPassword,
  verifyPassword,
} from "../auth/auth.hasher";
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  generateTokenIdentifiers,
} from "../auth/auth.utils";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  UserRole,
} from "../auth/auth.schemas";
import type {
  UpdateProfileInput,
  UpdatePasswordInput,
} from "./users.schemas";

export class UsersService {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Updates user display name and/or avatar URL.
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.displayName !== undefined) {
      updateData.displayName = input.displayName;
    }

    if (input.avatarUrl !== undefined) {
      updateData.avatarUrl = input.avatarUrl;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        isEmailVerified: users.isEmailVerified,
        updatedAt: users.updatedAt,
      });

    if (!updatedUser) {
      throw this.fastify.httpErrors.notFound("User not found");
    }

    return updatedUser;
  }

  /**
   * Updates user password with Argon2id and handles session revocation.
   */
  async updatePassword(userId: string, input: UpdatePasswordInput) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw this.fastify.httpErrors.notFound("User not found");
    }

    // 1. If account has existing password, verify current password
    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw this.fastify.httpErrors.badRequest(
          "Current password is required to change password"
        );
      }

      const isCurrentValid = await verifyPassword(
        input.currentPassword,
        user.passwordHash
      );

      if (!isCurrentValid) {
        throw this.fastify.httpErrors.unauthorized(
          "Current password does not match"
        );
      }
    }

    // 2. Hash new password with Argon2id
    const newHash = await hashPassword(input.newPassword);

    // 3. Increment token_version if revoking other sessions (security default)
    const newTokenVersion = input.revokeOtherSessions
      ? user.tokenVersion + 1
      : user.tokenVersion;

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: newTokenVersion,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    let tokens: { accessToken: string; refreshToken: string } | null = null;

    if (input.revokeOtherSessions) {
      // Sync to Redis fast-lookup cache
      await redis.set(
        `user:${userId}:token_version`,
        newTokenVersion.toString(),
        "EX",
        REFRESH_TOKEN_TTL_SEC
      );

      // Issue fresh tokens for the current device
      const { familyId, jti } = generateTokenIdentifiers();

      const accessPayload: AccessTokenPayload = {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        tokenVersion: newTokenVersion,
      };

      const refreshPayload: RefreshTokenPayload = {
        sub: user.id,
        familyId,
        jti,
        tokenVersion: newTokenVersion,
      };

      const accessToken = this.fastify.jwt.sign(accessPayload, {
        expiresIn: ACCESS_TOKEN_TTL_SEC,
      });

      const refreshToken = this.fastify.jwt.sign(refreshPayload, {
        expiresIn: REFRESH_TOKEN_TTL_SEC,
      });

      await redis.set(
        `session:${familyId}:${jti}`,
        "active",
        "EX",
        REFRESH_TOKEN_TTL_SEC
      );

      tokens = { accessToken, refreshToken };
    }

    return {
      message: input.revokeOtherSessions
        ? "Password changed successfully. All other devices have been logged out."
        : "Password changed successfully.",
      tokens,
    };
  }
}
