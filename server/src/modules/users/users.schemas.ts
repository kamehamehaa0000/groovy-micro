import { z } from "zod";

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Display name must be at least 2 characters")
      .max(100, "Display name must not exceed 100 characters")
      .optional(),
    avatarUrl: z
      .string()
      .url("Avatar URL must be a valid URL")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => data.displayName !== undefined || data.avatarUrl !== undefined,
    {
      message: "At least one field (displayName or avatarUrl) must be provided",
    }
  );

export const updatePasswordSchema = z.object({
  currentPassword: z.string().optional(), // Optional only for OAuth users setting a password for the first time
  newPassword: z
    .string({ required_error: "New password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  revokeOtherSessions: z.boolean().default(true),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
