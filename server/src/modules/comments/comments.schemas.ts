import { z } from "zod";

export const commentSortEnumSchema = z.enum([
  "top",
  "newest",
  "oldest",
  "disliked",
  "controversial",
]);

export type CommentSort = z.infer<typeof commentSortEnumSchema>;

export const listCommentsQuerySchema = z
  .object({
    songId: z.string().uuid("Invalid song UUID").optional(),
    albumId: z.string().uuid("Invalid album UUID").optional(),
    playlistId: z.string().uuid("Invalid playlist UUID").optional(),
    sort: commentSortEnumSchema.default("top"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine(
    (data) => {
      const targets = [data.songId, data.albumId, data.playlistId].filter(Boolean);
      return targets.length === 1;
    },
    {
      message: "Must specify exactly one target entity (songId, albumId, or playlistId)",
    }
  );

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

export const listRepliesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListRepliesQuery = z.infer<typeof listRepliesQuerySchema>;

export const createCommentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Comment cannot be blank")
      .max(2000, "Comment cannot exceed 2000 characters"),
    songId: z.string().uuid("Invalid song UUID").optional(),
    albumId: z.string().uuid("Invalid album UUID").optional(),
    playlistId: z.string().uuid("Invalid playlist UUID").optional(),
    parentId: z.string().uuid("Invalid parent comment UUID").optional(),
    replyToUserId: z.string().uuid("Invalid reply-to user UUID").optional(),
    timestampSeconds: z.coerce.number().int().nonnegative().optional(),
  })
  .refine(
    (data) => {
      const targets = [data.songId, data.albumId, data.playlistId].filter(Boolean);
      return targets.length === 1;
    },
    {
      message: "Must specify exactly one target entity (songId, albumId, or playlistId)",
    }
  );

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be blank")
    .max(2000, "Comment cannot exceed 2000 characters"),
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const voteCommentSchema = z.object({
  vote: z.coerce.number().pipe(z.union([z.literal(1), z.literal(-1), z.literal(0)])),
});

export type VoteCommentInput = z.infer<typeof voteCommentSchema>;

export interface EnrichedComment {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  songId: string | null;
  albumId: string | null;
  playlistId: string | null;
  parentId: string | null;
  replyToUserId: string | null;
  replyToUserName?: string | null;
  timestampSeconds: number | null;
  content: string;
  likesCount: number;
  dislikesCount: number;
  repliesCount: number;
  isEdited: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  userVote: 1 | -1 | null;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  previewReplies?: EnrichedComment[];
  createdAt: Date | string;
  updatedAt: Date | string | null;
}
