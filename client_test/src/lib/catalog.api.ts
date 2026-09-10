import { api } from "./api";
import type {
  AlbumType,
  AlbumDetail,
  CreateAlbumInput,
  UpdateAlbumInput,
  CreateSongInput,
  UpdateSongInput,
  Song,
  EnrichedSong,
  DiscographyResponse,
  StudioReleasesResponse,
  SearchAlbumsResponse,
  SearchSongsResponse,
  PreSavedRelease,
} from "../types/catalog";

/**
 * Formats duration in seconds into standard mm:ss or hh:mm:ss format.
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${remMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Safely extracts duration in seconds from an audio file using HTML5 Audio element.
 */
export function extractAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
      };

      audio.onloadedmetadata = () => {
        const dur = Math.round(audio.duration || 0);
        cleanup();
        resolve(dur);
      };

      audio.onerror = () => {
        cleanup();
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });
}

export const catalogApi = {
  // =========================================================================
  // ALBUM OPERATIONS
  // =========================================================================

  /**
   * Search and browse albums with filters.
   */
  async searchAlbums(params?: {
    search?: string;
    albumType?: AlbumType;
    artistId?: string;
    page?: number;
    limit?: number;
  }): Promise<SearchAlbumsResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.albumType) query.set("albumType", params.albumType);
    if (params?.artistId) query.set("artistId", params.artistId);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());

    const qs = query.toString();
    return await api.get<SearchAlbumsResponse>(`/api/v1/albums${qs ? `?${qs}` : ""}`);
  },

  /**
   * Retrieve an album by UUID or slug, including enriched tracklist and like status.
   * Supports optional shareToken for unlisted releases.
   */
  async getAlbum(idOrSlug: string, shareToken?: string): Promise<AlbumDetail> {
    const qs = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : "";
    return await api.get<AlbumDetail>(`/api/v1/albums/${encodeURIComponent(idOrSlug)}${qs}`);
  },

  /**
   * Create an album with optional initial tracks and multi-artist credits.
   */
  async createAlbum(input: CreateAlbumInput): Promise<AlbumDetail> {
    return await api.post<AlbumDetail>("/api/v1/albums", input);
  },

  /**
   * Pre-save an upcoming release for the user.
   */
  async preSaveAlbum(id: string): Promise<{ preSaved: boolean; preSavesCount: number }> {
    return await api.post<{ preSaved: boolean; preSavesCount: number }>(`/api/v1/albums/${id}/pre-save`);
  },

  /**
   * Remove pre-save on an upcoming release.
   */
  async removePreSave(id: string): Promise<{ preSaved: boolean; preSavesCount: number }> {
    return await api.delete<{ preSaved: boolean; preSavesCount: number }>(`/api/v1/albums/${id}/pre-save`);
  },

  /**
   * List all upcoming releases pre-saved by the current user.
   */
  async getMyPreSaves(): Promise<{ presaves: PreSavedRelease[] }> {
    return await api.get<{ presaves: PreSavedRelease[] }>("/api/v1/albums/presaves/mine");
  },

  /**
   * Update album metadata.
   */
  async updateAlbum(id: string, input: UpdateAlbumInput): Promise<AlbumDetail> {
    return await api.patch<AlbumDetail>(`/api/v1/albums/${id}`, input);
  },

  /**
   * Soft-delete an album (cascades to songs, eligible for 30-day restore).
   */
  async deleteAlbum(id: string): Promise<{ message: string; deletedAt: string }> {
    return await api.delete<{ message: string; deletedAt: string }>(`/api/v1/albums/${id}`);
  },

  /**
   * Restore a soft-deleted album and its tracks.
   */
  async restoreAlbum(id: string): Promise<{ message: string }> {
    return await api.post<{ message: string }>(`/api/v1/albums/${id}/restore`);
  },

  /**
   * Toggle like on an album.
   */
  async toggleAlbumLike(id: string): Promise<{ liked: boolean; likesCount: number }> {
    return await api.post<{ liked: boolean; likesCount: number }>(`/api/v1/albums/${id}/like`);
  },

  // =========================================================================
  // SONG OPERATIONS
  // =========================================================================

  /**
   * Search songs with filters (genre, artist, order by plays/recent/likes).
   */
  async searchSongs(params?: {
    search?: string;
    genre?: string;
    artistId?: string;
    albumId?: string;
    orderBy?: "plays" | "recent" | "likes";
    page?: number;
    limit?: number;
  }): Promise<SearchSongsResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.genre) query.set("genre", params.genre);
    if (params?.artistId) query.set("artistId", params.artistId);
    if (params?.albumId) query.set("albumId", params.albumId);
    if (params?.orderBy) query.set("orderBy", params.orderBy);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());

    const qs = query.toString();
    return await api.get<SearchSongsResponse>(`/api/v1/songs${qs ? `?${qs}` : ""}`);
  },

  /**
   * Retrieve song details, credits, and audio stream URL.
   */
  async getSong(id: string): Promise<EnrichedSong> {
    return await api.get<EnrichedSong>(`/api/v1/songs/${id}`);
  },

  /**
   * Create a standalone song or append to an existing album.
   */
  async createSong(input: CreateSongInput): Promise<Song> {
    return await api.post<Song>("/api/v1/songs", input);
  },

  /**
   * Update song metadata, detach from album (albumId = null), or edit credits.
   */
  async updateSong(id: string, input: UpdateSongInput): Promise<Song> {
    return await api.patch<Song>(`/api/v1/songs/${id}`, input);
  },

  /**
   * Soft-delete a song (30-day restore window).
   */
  async deleteSong(id: string): Promise<{ message: string; deletedAt: string }> {
    return await api.delete<{ message: string; deletedAt: string }>(`/api/v1/songs/${id}`);
  },

  /**
   * Restore a soft-deleted song.
   */
  async restoreSong(id: string): Promise<{ message: string }> {
    return await api.post<{ message: string }>(`/api/v1/songs/${id}/restore`);
  },

  /**
   * Toggle like on a song.
   */
  async toggleSongLike(id: string): Promise<{ liked: boolean; likesCount: number }> {
    return await api.post<{ liked: boolean; likesCount: number }>(`/api/v1/songs/${id}/like`);
  },

  /**
   * Retrieve authenticated user's Liked Songs library.
   */
  async getLikedSongs(page = 1, limit = 50): Promise<{ data: EnrichedSong[]; pagination: any }> {
    return await api.get(`/api/v1/songs/liked?page=${page}&limit=${limit}`);
  },

  // =========================================================================
  // DISCOGRAPHY & STUDIO OPERATIONS
  // =========================================================================

  /**
   * Retrieve complete artist discography (Albums, EPs, Singles, Top Tracks, Appears On).
   */
  async getArtistDiscography(idOrSlug: string): Promise<DiscographyResponse> {
    return await api.get<DiscographyResponse>(`/api/v1/artists/${encodeURIComponent(idOrSlug)}/discography`);
  },

  /**
   * Retrieve artist studio releases (active or 30-day trash).
   */
  async getStudioReleases(trash = false): Promise<StudioReleasesResponse> {
    return await api.get<StudioReleasesResponse>(`/api/v1/studio/releases${trash ? "?trash=true" : ""}`);
  },

  // =========================================================================
  // CLOUDFLARE R2 ASSET UPLOADS
  // =========================================================================

  /**
   * Upload an album cover art image directly to Cloudflare R2 via presigned PUT.
   */
  async uploadAlbumCover(file: File): Promise<string> {
    const ext = file.name.split(".").pop() || "webp";
    const resourceId = crypto.randomUUID();

    const presigned = await api.post<{
      uploadUrl: string;
      storageKey: string;
      publicUrl: string;
    }>("/api/v1/storage/presigned-url", {
      category: "ALBUM_COVER",
      resourceId,
      mimeType: file.type || "image/jpeg",
      fileExtension: ext,
      fileSizeBytes: file.size,
    });

    const uploadRes = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload cover art to R2 (Status: ${uploadRes.status})`);
    }

    return presigned.publicUrl;
  },

  /**
   * Upload master audio file to Cloudflare R2 via presigned PUT and extract duration.
   */
  async uploadAudioRaw(file: File): Promise<{
    storageKey: string;
    publicUrl: string;
    durationSeconds: number;
  }> {
    const ext = file.name.split(".").pop() || "flac";
    const resourceId = crypto.randomUUID();

    const [presigned, durationSeconds] = await Promise.all([
      api.post<{
        uploadUrl: string;
        storageKey: string;
        publicUrl: string;
      }>("/api/v1/storage/presigned-url", {
        category: "SONG_AUDIO_RAW",
        resourceId,
        mimeType: file.type || "audio/flac",
        fileExtension: ext,
        fileSizeBytes: file.size,
      }),
      extractAudioDuration(file),
    ]);

    const uploadRes = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "audio/flac",
      },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload master audio to R2 (Status: ${uploadRes.status})`);
    }

    return {
      storageKey: presigned.storageKey,
      publicUrl: presigned.publicUrl,
      durationSeconds,
    };
  },
};
