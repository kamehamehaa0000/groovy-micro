import { z } from "zod";

export const createPlaylistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title must be at least 1 character")
    .max(150, "Title cannot exceed 150 characters"),
  description: z.string().trim().max(1000).optional(),
  coverImageUrl: z.string().url("Must be a valid URL").optional(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).default("PUBLIC"),
  allowDuplicates: z.boolean().default(false),
  allowComments: z.boolean().default(true),
  initialSongIds: z.array(z.string().uuid("Invalid song UUID")).max(100).optional(),
});

export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;

export const updatePlaylistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title must be at least 1 character")
    .max(150, "Title cannot exceed 150 characters")
    .optional(),
  description: z.string().trim().max(1000).nullish(),
  coverImageUrl: z.string().url("Must be a valid URL").nullish(),
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).optional(),
  allowDuplicates: z.boolean().optional(),
  allowComments: z.boolean().optional(),
});

export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;

export const addTracksSchema = z.object({
  songIds: z
    .array(z.string().uuid("Invalid song UUID"))
    .min(1, "At least one song ID must be provided")
    .max(100, "Cannot add more than 100 songs in a single request"),
});

export type AddTracksInput = z.infer<typeof addTracksSchema>;

export const reorderTracksSchema = z.object({
  orderedEntryIds: z
    .array(z.string().uuid("Invalid playlist entry UUID"))
    .min(1, "At least one entry ID is required to reorder"),
});

export type ReorderTracksInput = z.infer<typeof reorderTracksSchema>;

export const searchPlaylistsQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchPlaylistsQuery = z.infer<typeof searchPlaylistsQuerySchema>;

export const joinCollaborationSchema = z.object({
  token: z.string().min(1, "Collaboration token is required"),
});

export type JoinCollaborationInput = z.infer<typeof joinCollaborationSchema>;
