import type { ReleaseVisibility, EnrichedSong } from "./catalog";

export interface PlaylistCollaborator {
  playlistId: string;
  userId: string;
  joinedAt: string;
  user?: {
    id: string;
    displayName: string;
    role: string;
    avatarUrl?: string | null;
  };
}

export interface PlaylistTrack {
  id: string;
  entryId?: string;
  playlistId: string;
  songId: string;
  position: number;
  addedAt: string;
  addedByUserId: string;
  addedByDisplayName?: string;
  addedByAvatarUrl?: string | null;
  // Flat properties for resilience
  title?: string;
  slug?: string;
  durationSeconds?: number;
  audioUrl?: string | null;
  hlsManifestUrl?: string | null;
  isExplicit?: boolean;
  coverImageUrl?: string | null;
  albumId?: string | null;
  albumTitle?: string | null;
  albumSlug?: string | null;
  albumCoverUrl?: string | null;
  artistId?: string;
  artistStageName?: string;
  artistSlug?: string;
  artistVerified?: boolean;
  scope?: "GLOBAL" | "PERSONAL";
  uploaderUserId?: string | null;
  isStreamable?: boolean;
  scheduledReleaseAt?: string | Date | null;
  isLiked?: boolean;
  // Nested song object
  song?: EnrichedSong;
}

export interface Playlist {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  isCollaborative: boolean;
  visibility: ReleaseVisibility;
  shareToken: string | null;
  collaborationToken: string | null;
  allowDuplicates: boolean;
  allowComments?: boolean;
  savesCount: number;
  createdAt: string;
  updatedAt: string;

  // Enriched metadata
  ownerDisplayName?: string;
  ownerRole?: string;
  isSaved?: boolean;
  isOwner?: boolean;
  isCollaborator?: boolean;
  canEdit?: boolean;
  tracksCount?: number;
  totalDurationSeconds?: number;
  mosaicCovers?: string[];
}

export interface PlaylistDetail extends Playlist {
  tracks: PlaylistTrack[];
  collaborators: PlaylistCollaborator[];
}

export interface CreatePlaylistInput {
  title: string;
  description?: string;
  coverImageUrl?: string;
  visibility?: ReleaseVisibility;
  allowDuplicates?: boolean;
  allowComments?: boolean;
  initialSongIds?: string[];
}

export interface UpdatePlaylistInput {
  title?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  visibility?: ReleaseVisibility;
  allowDuplicates?: boolean;
  allowComments?: boolean;
}

export interface AddTracksInput {
  songIds: string[];
}

export interface ReorderTracksInput {
  orderedEntryIds: string[];
}

export interface SearchPlaylistsQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export interface SearchPlaylistsResponse {
  data: Playlist[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CollaborationTokenResponse {
  isCollaborative: boolean;
  collaborationToken: string;
  joinUrl: string;
}

export interface RegenerateCollaborationTokenResponse {
  collaborationToken: string;
  joinUrl: string;
}
