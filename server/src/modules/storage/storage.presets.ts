import { randomUUID } from "crypto";

export type UploadCategory =
  | "USER_AVATAR"
  | "ARTIST_BANNER"
  | "ALBUM_COVER"
  | "PLAYLIST_COVER"
  | "SONG_AUDIO_RAW"
  | "SONG_LYRICS"
  | "ARTIST_VERIFICATION_DOC";

export interface UploadPresetConfig {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  ttlSeconds: number;
  isPublic: boolean;
  generateKey: (ownerId: string, resourceId: string, extension: string) => string;
}

export const UPLOAD_PRESETS: Record<UploadCategory, UploadPresetConfig> = {
  USER_AVATAR: {
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    ttlSeconds: 600, // 10 minutes
    isPublic: true,
    generateKey: (userId, _, ext) =>
      `avatars/${userId}/${randomUUID()}.${ext}`,
  },
  ARTIST_BANNER: {
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    ttlSeconds: 600,
    isPublic: true,
    generateKey: (_, artistId, ext) =>
      `artists/${artistId}/banner/${randomUUID()}.${ext}`,
  },
  ALBUM_COVER: {
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    ttlSeconds: 600,
    isPublic: true,
    generateKey: (_, albumId, ext) =>
      `albums/${albumId}/cover/${randomUUID()}.${ext}`,
  },
  PLAYLIST_COVER: {
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    ttlSeconds: 600,
    isPublic: true,
    generateKey: (_, playlistId, ext) =>
      `playlists/${playlistId}/cover/${randomUUID()}.${ext}`,
  },
  SONG_AUDIO_RAW: {
    maxSizeBytes: 150 * 1024 * 1024, // 150 MB
    allowedMimeTypes: [
      "audio/flac",
      "audio/x-flac",
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
    ],
    ttlSeconds: 1800, // 30 minutes
    isPublic: false, // Strictly private for transcoder worker
    generateKey: (_, songId, ext) =>
      `audio/raw/${songId}/original.${ext}`,
  },
  SONG_LYRICS: {
    maxSizeBytes: 1 * 1024 * 1024, // 1 MB (.lrc, .ttml, .txt)
    allowedMimeTypes: [
      "text/plain",
      "application/octet-stream",
      "application/xml",
      "text/xml",
    ],
    ttlSeconds: 600,
    isPublic: true,
    generateKey: (_, songId, ext) =>
      `audio/lyrics/${songId}/lyrics.${ext}`,
  },
  ARTIST_VERIFICATION_DOC: {
    maxSizeBytes: 15 * 1024 * 1024, // 15 MB
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    ttlSeconds: 900,
    isPublic: false, // Strictly private
    generateKey: (_, artistId, ext) =>
      `artists/${artistId}/verification/${randomUUID()}.${ext}`,
  },
};
