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

export const updatePrivacySettingsSchema = z.object({
  isPrivateAccount: z.boolean().optional(),
  listeningActivityPrivacy: z
    .enum(["FRIENDS_ONLY", "FOLLOWERS", "OFF"])
    .optional(),
  libraryPrivacy: z.enum(["PUBLIC", "FOLLOWERS_ONLY", "PRIVATE"]).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type UpdatePrivacySettingsInput = z.infer<
  typeof updatePrivacySettingsSchema
>;

export const userParamSchema = z.object({
  id: z.string().uuid("Invalid user ID"),
});

export type UserParam = z.infer<typeof userParamSchema>;

export interface PublicUserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  isPrivateAccount: boolean;
  libraryPrivacy: "PUBLIC" | "FOLLOWERS_ONLY" | "PRIVATE";
  followersCount: number;
  followingCount: number;
  publicPlaylistsCount: number;
  createdAt: Date | string;
}

export interface UserProfileResponse {
  user: PublicUserProfile;
  relationship:
    | "SELF"
    | "NONE"
    | "PENDING_SENT"
    | "PENDING_RECEIVED"
    | "FOLLOWING"
    | "FRIENDS";
}

export interface SharedPlaylistItem {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: string;
  isCollaborative: boolean;
  savesCount: number;
  tracksCount: number;
  ownerId?: string;
  ownerName?: string;
  ownerAvatarUrl?: string | null;
  savedAt?: Date | string;
  createdAt?: Date | string;
}

export interface SharedAlbumItem {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  type: string;
  releaseDate: string | Date;
  isReleased: boolean;
  artistId: string;
  artistName: string;
  artistSlug: string;
  savedAt?: Date | string;
}

export interface SharedLikedSongItem {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  durationSeconds: number;
  audioUrl: string | null;
  isExplicit: boolean;
  artistId: string;
  artistName: string;
  artistSlug: string;
  likedAt: Date | string;
}

export interface UserLibraryResponse {
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    libraryPrivacy: "PUBLIC" | "FOLLOWERS_ONLY" | "PRIVATE";
  };
  createdPlaylists: SharedPlaylistItem[];
  savedPlaylists: SharedPlaylistItem[];
  savedAlbums: SharedAlbumItem[];
  presavedReleases: SharedAlbumItem[];
  likedSongs: {
    totalCount: number;
    items: SharedLikedSongItem[];
  };
}

