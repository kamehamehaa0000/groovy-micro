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

export const socialFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  filter: z.enum(["all", "releases", "playlists", "friends"]).default("all"),
});

export type SocialFeedQuery = z.infer<typeof socialFeedQuerySchema>;

export type FeedItemType =
  | "NEW_RELEASE"
  | "PLAYLIST_CREATED"
  | "PLAYLIST_SAVED"
  | "SONG_LIKED";

export interface FeedActor {
  id: string;
  name: string;
  avatarUrl?: string | null;
  slug?: string | null;
  isArtist: boolean;
}

export interface FeedTarget {
  id: string;
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  slug?: string | null;
  type: "album" | "playlist" | "song";
  durationSeconds?: number;
  tracksCount?: number;
  audioUrl?: string | null;
  isExplicit?: boolean;
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: string;
  actor: FeedActor;
  target: FeedTarget;
}

export interface SocialFeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}
