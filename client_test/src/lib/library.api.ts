import { apiFetch } from "./api";

export interface LibraryPlaylist {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
  isCollaborative: boolean;
  isOwner: boolean;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  savesCount: number;
  tracksCount: number;
  addedAt: string;
}

export interface LibraryRelease {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  albumType: "ALBUM" | "EP" | "SINGLE" | "MIXTAPE" | "LP";
  releaseDate: string | null;
  artistId: string;
  artistName: string;
  artistSlug: string;
  savedAt: string;
  tracksCount: number;
}

export interface LibraryArtist {
  id: string;
  stageName: string;
  slug: string;
  avatarUrl: string | null;
  verified: boolean;
  followedAt: string;
}

export interface LibraryPin {
  id: string;
  itemType: "LIKED_SONGS" | "PERSONAL_COLLECTION" | "PLAYLIST" | "ALBUM" | "ARTIST";
  itemId: string;
  pinnedAt: string;
}

export interface LibraryPayload {
  likedSongs: {
    totalTracks: number;
    lastAddedAt: string | null;
  };
  personalCollection: {
    totalReleases: number;
    totalTracks: number;
    lastAddedAt: string | null;
  };
  playlists: LibraryPlaylist[];
  releases: LibraryRelease[];
  artists: LibraryArtist[];
  pins: LibraryPin[];
}

export const libraryApi = {
  /**
   * Retrieves the consolidated authenticated user library payload.
   */
  async getLibrary(): Promise<LibraryPayload> {
    return apiFetch<LibraryPayload>("/api/v1/library/me");
  },

  /**
   * Pins an item (Liked Songs, Personal Vault, Playlist, Album, Artist) to top.
   */
  async pinItem(
    itemType: "LIKED_SONGS" | "PERSONAL_COLLECTION" | "PLAYLIST" | "ALBUM" | "ARTIST",
    itemId: string
  ): Promise<{ success: boolean; pin?: LibraryPin }> {
    return apiFetch<{ success: boolean; pin?: LibraryPin }>("/api/v1/library/pins", {
      method: "POST",
      body: JSON.stringify({ itemType, itemId }),
    });
  },

  /**
   * Unpins an item from user library.
   */
  async unpinItem(
    itemType: "LIKED_SONGS" | "PERSONAL_COLLECTION" | "PLAYLIST" | "ALBUM" | "ARTIST",
    itemId: string
  ): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/api/v1/library/pins/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}`,
      {
        method: "DELETE",
      }
    );
  },
};
