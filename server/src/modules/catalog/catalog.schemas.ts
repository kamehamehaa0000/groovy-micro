import { z } from "zod";

export const albumTypeEnumSchema = z.enum([
  "ALBUM",
  "SINGLE",
  "EP",
  "MIXTAPE",
  "LP",
]);

export const creditRoleEnumSchema = z.enum([
  "PRIMARY",
  "FEATURED",
  "PRODUCER",
  "COMPOSER",
  "LYRICIST",
  "ENGINEER",
  "MIX_AND_MASTER",
  "OTHER",
]);

export const songCreditInputSchema = z.object({
  artistId: z.string().uuid("Invalid artist ID"),
  role: creditRoleEnumSchema.default("PRIMARY"),
});

export const initialTrackInputSchema = z.object({
  title: z
    .string()
    .min(1, "Track title cannot be blank")
    .max(255, "Track title cannot exceed 255 characters")
    .trim(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  genre: z.string().max(60).optional(),
  durationSeconds: z.coerce.number().int().nonnegative().default(0),
  trackNumber: z.coerce.number().int().positive().optional(),
  discNumber: z.coerce.number().int().positive().default(1),
  isExplicit: z.boolean().default(false),
  rawAudioKey: z.string().optional(),
  audioUrl: z.string().min(1).optional(),
  coverImageUrl: z.string().min(1).optional(),
  credits: z.array(songCreditInputSchema).optional(),
});

export const createAlbumSchema = z.object({
  title: z
    .string()
    .min(1, "Album title cannot be blank")
    .max(255, "Album title cannot exceed 255 characters")
    .trim(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  albumType: albumTypeEnumSchema.default("ALBUM"),
  coverImageUrl: z.string().min(1, "Cover image is required"),
  description: z.string().max(4000, "Description cannot exceed 4000 characters").optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Release date must be in YYYY-MM-DD format")
    .default(() => new Date().toISOString().split("T")[0]),
  tracks: z.array(initialTrackInputSchema).optional(),
});

export const updateAlbumSchema = z.object({
  title: z
    .string()
    .min(1, "Album title cannot be blank")
    .max(255, "Album title cannot exceed 255 characters")
    .trim()
    .optional(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  albumType: albumTypeEnumSchema.optional(),
  coverImageUrl: z.string().min(1).optional(),
  description: z.string().max(4000, "Description cannot exceed 4000 characters").nullable().optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Release date must be in YYYY-MM-DD format")
    .optional(),
});

export const createSongSchema = z.object({
  title: z
    .string()
    .min(1, "Song title cannot be blank")
    .max(255, "Song title cannot exceed 255 characters")
    .trim(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  albumId: z.string().uuid("Invalid album ID").nullable().optional(),
  genre: z.string().max(60).optional(),
  durationSeconds: z.coerce.number().int().nonnegative().default(0),
  trackNumber: z.coerce.number().int().positive().optional(),
  discNumber: z.coerce.number().int().positive().default(1),
  isExplicit: z.boolean().default(false),
  rawAudioKey: z.string().optional(),
  audioUrl: z.string().min(1).nullable().optional(),
  coverImageUrl: z.string().min(1).nullable().optional(),
  credits: z.array(songCreditInputSchema).optional(),
});

export const updateSongSchema = z.object({
  title: z
    .string()
    .min(1, "Song title cannot be blank")
    .max(255, "Song title cannot exceed 255 characters")
    .trim()
    .optional(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(160, "Slug cannot exceed 160 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  albumId: z.string().uuid("Invalid album ID").nullable().optional(),
  genre: z.string().max(60).nullable().optional(),
  durationSeconds: z.coerce.number().int().nonnegative().optional(),
  trackNumber: z.coerce.number().int().positive().nullable().optional(),
  discNumber: z.coerce.number().int().positive().optional(),
  isExplicit: z.boolean().optional(),
  rawAudioKey: z.string().nullable().optional(),
  audioUrl: z.string().min(1).nullable().optional(),
  coverImageUrl: z.string().min(1).nullable().optional(),
  credits: z.array(songCreditInputSchema).optional(),
});

export const searchAlbumsQuerySchema = z.object({
  search: z.string().optional(),
  albumType: albumTypeEnumSchema.optional(),
  artistId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const searchSongsQuerySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  artistId: z.string().uuid().optional(),
  albumId: z.string().uuid().optional(),
  orderBy: z.enum(["plays", "recent", "likes"]).default("plays"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreditRole = z.infer<typeof creditRoleEnumSchema>;
export type SongCreditInput = z.infer<typeof songCreditInputSchema>;
export type InitialTrackInput = z.infer<typeof initialTrackInputSchema>;
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
export type CreateSongInput = z.infer<typeof createSongSchema>;
export type UpdateSongInput = z.infer<typeof updateSongSchema>;
export type SearchAlbumsQuery = z.infer<typeof searchAlbumsQuerySchema>;
export type SearchSongsQuery = z.infer<typeof searchSongsQuerySchema>;
