import { apiFetch } from "./api";

export interface LockerQuota {
  planId: string;
  maxSongs: number;
  usedSongs: number;
  remainingSongs: number;
}

export interface PresignedBatchItem {
  clientFileId: string;
  category: "SONG_AUDIO_RAW" | "ALBUM_COVER";
  resourceId: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
}

export interface PresignedBatchResponseItem {
  clientFileId: string;
  category: string;
  uploadUrl: string;
  storageKey: string;
  publicUrl: string | null;
  expiresInSeconds: number;
}

export interface BulkImportTrackPayload {
  title: string;
  trackNumber: number;
  discNumber: number;
  durationSeconds: number;
  genre?: string | null;
  isExplicit?: boolean;
  rawAudioKey: string;
  artistName?: string | null;
}

export interface BulkImportReleasePayload {
  artistName: string;
  albumTitle: string;
  albumType?: "ALBUM" | "EP" | "SINGLE" | "MIXTAPE" | "LP";
  genre?: string | null;
  releaseDate?: string | null;
  coverImageUrl?: string | null;
  existingAlbumId?: string | null;
  tracks: BulkImportTrackPayload[];
}

export interface TrackCredit {
  songId?: string;
  artistId: string;
  stageName: string;
  slug: string;
  role: "PRIMARY" | "FEATURED" | string;
}

export interface PersonalTrack {
  id: string;
  albumId: string;
  title: string;
  slug: string;
  durationSeconds: number;
  trackNumber: number;
  discNumber: number;
  genre: string | null;
  isExplicit: boolean;
  rawAudioKey: string;
  audioUrl: string | null;
  hlsManifestUrl: string | null;
  processingStatus: string;
  coverImageUrl: string | null;
  createdAt: string;
  artistId: string;
  artistName: string;
  credits?: TrackCredit[];
}

export interface PersonalRelease {
  id: string;
  title: string;
  slug: string;
  albumType: "ALBUM" | "EP" | "SINGLE" | "MIXTAPE" | "LP";
  coverImageUrl: string | null;
  genre: string | null;
  releaseDate: string | null;
  totalTracks: number;
  totalDurationSeconds: number;
  createdAt: string;
  artistId: string;
  artistName: string;
  artistSlug: string;
  tracks: PersonalTrack[];
}

export interface PersonalArtist {
  id: string;
  stageName: string;
  slug: string;
  bio: string | null;
  bannerUrl: string | null;
  createdAt: string;
  releaseCount: number;
  trackCount: number;
}

export interface TrashedSong {
  id: string;
  title: string;
  durationSeconds: number;
  albumId: string | null;
  albumTitle: string | null;
  artistName: string;
  deletedAt: string;
  rawAudioKey: string | null;
}

export interface TrashedRelease {
  id: string;
  title: string;
  albumType: "ALBUM" | "EP" | "SINGLE" | "MIXTAPE" | "LP" | string;
  coverImageUrl: string | null;
  deletedAt: string;
  totalTracks: number;
  artistName: string;
}

export interface TrashResponse {
  songs: TrashedSong[];
  releases: TrashedRelease[];
}

export const storageApi = {
  /**
   * Retrieves current user's personal collection quota.
   */
  async getQuota(): Promise<{ quota: LockerQuota }> {
    return apiFetch<{ quota: LockerQuota }>("/api/v1/storage/personal-collection/quota");
  },

  /**
   * Retrieves personal releases stored in user's personal collection.
   */
  async getPersonalReleases(): Promise<{ releases: PersonalRelease[] }> {
    return apiFetch<{ releases: PersonalRelease[] }>("/api/v1/storage/personal-collection/releases");
  },

  /**
   * Alias for backward compatibility.
   */
  async getLockerReleases(): Promise<{ releases: PersonalRelease[] }> {
    return this.getPersonalReleases();
  },

  /**
   * Retrieves personal sandboxed artists created by user.
   */
  async getPersonalArtists(): Promise<{ artists: PersonalArtist[] }> {
    return apiFetch<{ artists: PersonalArtist[] }>("/api/v1/storage/personal-collection/artists");
  },

  /**
   * Creates a new personal sandboxed artist for user.
   */
  async createPersonalArtist(data: {
    stageName: string;
    bio?: string | null;
  }): Promise<{ artist: PersonalArtist; isExisting: boolean }> {
    return apiFetch<{ artist: PersonalArtist; isExisting: boolean }>(
      "/api/v1/storage/personal-collection/artists",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  /**
   * Deletes a single personal song from user's personal collection.
   */
  async deletePersonalSong(songId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/storage/personal-collection/songs/${songId}`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Deletes an entire personal release and all its tracks from user's personal collection.
   */
  async deletePersonalRelease(
    albumId: string
  ): Promise<{ success: boolean; message: string; deletedTracks: number }> {
    return apiFetch<{ success: boolean; message: string; deletedTracks: number }>(
      `/api/v1/storage/personal-collection/releases/${albumId}`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Retrieves all items in the user's personal recycle bin / trash.
   */
  async getTrash(): Promise<TrashResponse> {
    return apiFetch<TrashResponse>("/api/v1/storage/personal-collection/trash");
  },

  /**
   * Restores a soft-deleted song from the trash back to personal collection.
   */
  async restorePersonalSong(songId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/storage/personal-collection/songs/${songId}/restore`,
      { method: "POST" }
    );
  },

  /**
   * Restores a soft-deleted release and its tracks from the trash.
   */
  async restorePersonalRelease(albumId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/storage/personal-collection/releases/${albumId}/restore`,
      { method: "POST" }
    );
  },

  /**
   * Permanently deletes a single personal song from storage and DB.
   */
  async permanentlyDeletePersonalSong(songId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/storage/personal-collection/songs/${songId}/permanent`,
      { method: "DELETE" }
    );
  },

  /**
   * Permanently deletes an entire personal release from storage and DB.
   */
  async permanentlyDeletePersonalRelease(albumId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/storage/personal-collection/releases/${albumId}/permanent`,
      { method: "DELETE" }
    );
  },

  /**
   * Permanently purges all items in the recycle bin.
   */
  async emptyTrash(): Promise<{
    success: boolean;
    message: string;
    deletedSongsCount: number;
    deletedReleasesCount: number;
  }> {
    return apiFetch<{
      success: boolean;
      message: string;
      deletedSongsCount: number;
      deletedReleasesCount: number;
    }>("/api/v1/storage/personal-collection/trash", {
      method: "DELETE",
    });
  },

  /**
   * Requests batch presigned PUT upload URLs with quota check.
   * Transparently chunks large batches to stay safely within payload and gateway limits.
   */
  async getBatchPresignedUrls(
    files: PresignedBatchItem[]
  ): Promise<{ uploads: PresignedBatchResponseItem[] }> {
    const CHUNK_SIZE = 500;
    if (files.length <= CHUNK_SIZE) {
      return apiFetch<{ uploads: PresignedBatchResponseItem[] }>(
        "/api/v1/storage/batch-presigned-urls",
        {
          method: "POST",
          body: JSON.stringify({ files }),
        }
      );
    }

    const allUploads: PresignedBatchResponseItem[] = [];
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const res = await apiFetch<{ uploads: PresignedBatchResponseItem[] }>(
        "/api/v1/storage/batch-presigned-urls",
        {
          method: "POST",
          body: JSON.stringify({ files: chunk }),
        }
      );
      allUploads.push(...res.uploads);
    }

    return { uploads: allUploads };
  },

  /**
   * Directly uploads a file to Cloudflare R2 via presigned PUT URL.
   */
  async uploadFileToR2(
    uploadUrl: string,
    file: File | Blob,
    mimeType: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", mimeType);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Storage upload failed with HTTP status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during direct storage upload"));
      };

      xhr.send(file);
    });
  },

  /**
   * Submits the release and its tracks to PostgreSQL, creating sandboxed artist and outbox events.
   */
  async bulkImportRelease(payload: BulkImportReleasePayload) {
    return apiFetch("/api/v1/storage/bulk-import-release", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
