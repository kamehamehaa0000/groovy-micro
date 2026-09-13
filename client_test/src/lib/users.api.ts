import { apiFetch } from "./api";
import type { RelationshipStatus } from "./social.api";

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
  createdAt: string;
}

export interface UserProfileResponse {
  user: PublicUserProfile;
  relationship: RelationshipStatus;
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
  savedAt?: string;
  createdAt?: string;
}

export interface SharedAlbumItem {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  type: string;
  releaseDate: string;
  isReleased: boolean;
  artistId: string;
  artistName: string;
  artistSlug: string;
  savedAt?: string;
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
  likedAt: string;
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

export const usersApi = {
  async getUserProfile(userId: string): Promise<UserProfileResponse> {
    return apiFetch<UserProfileResponse>(`/api/v1/users/${userId}`);
  },

  async getUserLibrary(userId: string): Promise<UserLibraryResponse> {
    return apiFetch<UserLibraryResponse>(`/api/v1/users/${userId}/library`);
  },
};
