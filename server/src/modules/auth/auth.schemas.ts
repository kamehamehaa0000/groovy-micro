import { z } from "zod";
import type { userRoleEnum } from "../../db/schema/enums";

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const registerSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(255, "Email is too long"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  displayName: z
    .string({ required_error: "Display name is required" })
    .trim()
    .min(2, "Display name must be at least 2 characters")
    .max(100, "Display name must not exceed 100 characters"),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

export const googleTokenSchema = z.object({
  idToken: z
    .string({ required_error: "Google ID token is required" })
    .min(1, "ID token cannot be empty"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleTokenInput = z.infer<typeof googleTokenSchema>;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
  tokenVersion: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}
