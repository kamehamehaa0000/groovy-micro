import { z } from "zod";

export const createArtistSchema = z.object({
  stageName: z
    .string()
    .min(1, "Stage name must be at least 1 character")
    .max(150, "Stage name cannot exceed 150 characters")
    .trim(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    )
    .optional(),
  bio: z
    .string()
    .max(5000, "Bio cannot exceed 5000 characters")
    .optional(),
  socialLinks: z
    .record(z.string().url("Invalid social media URL"))
    .optional(),
});

export const updateArtistSchema = z.object({
  stageName: z
    .string()
    .min(1, "Stage name must be at least 1 character")
    .max(150, "Stage name cannot exceed 150 characters")
    .trim()
    .optional(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    )
    .optional(),
  bio: z
    .string()
    .max(5000, "Bio cannot exceed 5000 characters")
    .nullable()
    .optional(),
  bannerUrl: z
    .string()
    .url("Banner URL must be a valid URL")
    .nullable()
    .optional(),
  socialLinks: z
    .record(z.string().url("Invalid social media URL"))
    .optional(),
});

export const requestVerificationSchema = z.object({
  message: z
    .string()
    .min(10, "Verification pitch must be at least 10 characters")
    .max(2000, "Verification pitch cannot exceed 2000 characters")
    .trim(),
  contactEmail: z
    .string()
    .email("Invalid contact email format")
    .optional(),
  contactPhone: z
    .string()
    .max(50, "Contact phone cannot exceed 50 characters")
    .optional(),
  links: z
    .array(z.string().url("Proof link must be a valid URL"))
    .min(1, "Please provide at least one official proof or portfolio link")
    .max(10, "Maximum 10 proof links allowed"),
});

export const adminVerifyArtistSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  reason: z
    .string()
    .min(5, "Rejection reason must be at least 5 characters")
    .max(1000, "Rejection reason cannot exceed 1000 characters")
    .optional(),
}).refine(
  (data) => {
    if (data.status === "REJECTED" && !data.reason) {
      return false;
    }
    return true;
  },
  {
    message: "A rejection reason is required when rejecting verification",
    path: ["reason"],
  }
);

export const searchArtistsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const adminListArtistsQuerySchema = z.object({
  status: z
    .enum(["ALL", "NONE", "PENDING", "VERIFIED", "REJECTED"])
    .default("ALL"),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateArtistInput = z.infer<typeof createArtistSchema>;
export type UpdateArtistInput = z.infer<typeof updateArtistSchema>;
export type RequestVerificationInput = z.infer<typeof requestVerificationSchema>;
export type AdminVerifyArtistInput = z.infer<typeof adminVerifyArtistSchema>;
export type SearchArtistsQuery = z.infer<typeof searchArtistsQuerySchema>;
export type AdminListArtistsQuery = z.infer<typeof adminListArtistsQuerySchema>;
