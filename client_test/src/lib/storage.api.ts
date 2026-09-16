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
  albumType?: "ALBUM" | "EP" | "SINGLE";
  genre?: string | null;
  releaseDate?: string | null;
  coverImageUrl?: string | null;
  tracks: BulkImportTrackPayload[];
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
}

export interface PersonalRelease {
  id: string;
  title: string;
  slug: string;
  albumType: "ALBUM" | "EP" | "SINGLE";
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
   * Requests batch presigned PUT upload URLs with quota check.
   */
  async getBatchPresignedUrls(
    files: PresignedBatchItem[]
  ): Promise<{ uploads: PresignedBatchResponseItem[] }> {
    return apiFetch<{ uploads: PresignedBatchResponseItem[] }>(
      "/api/v1/storage/batch-presigned-urls",
      {
        method: "POST",
        body: JSON.stringify({ files }),
      }
    );
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
