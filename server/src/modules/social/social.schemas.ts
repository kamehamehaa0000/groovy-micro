import { z } from "zod";

export const userFollowParamSchema = z.object({
  targetUserId: z.string().uuid("Invalid target user ID"),
});

export const respondFollowRequestSchema = z.object({
  requesterId: z.string().uuid("Invalid requester user ID"),
});

export const searchUsersQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type UserFollowParam = z.infer<typeof userFollowParamSchema>;
export type RespondFollowRequest = z.infer<typeof respondFollowRequestSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;

export type RelationshipStatus =
  | "SELF"
  | "NONE"
  | "PENDING_SENT"
  | "PENDING_RECEIVED"
  | "FOLLOWING"
  | "FRIENDS";
