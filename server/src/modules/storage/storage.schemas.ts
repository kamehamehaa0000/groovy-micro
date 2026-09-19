import { z } from "zod";

export const presignedUrlSchema = z.object({
  category: z.enum([
    "USER_AVATAR",
    "ARTIST_BANNER",
    "ALBUM_COVER",
    "PLAYLIST_COVER",
    "SONG_AUDIO_RAW",
    "SONG_LYRICS",
    "ARTIST_VERIFICATION_DOC",
  ]),
  resourceId: z.string().min(1, "resourceId is required"),
  mimeType: z.string().min(1, "mimeType is required"),
  fileExtension: z.string().min(1, "fileExtension is required"),
  fileSizeBytes: z.number().int().positive("fileSizeBytes must be positive"),
});

export const batchPresignedUrlsSchema = z.object({
  files: z
    .array(
      z.object({
        clientFileId: z.string().min(1, "clientFileId is required"),
        category: z.enum(["SONG_AUDIO_RAW", "ALBUM_COVER"]),
        resourceId: z.string().min(1, "resourceId is required"),
        mimeType: z.string().min(1, "mimeType is required"),
        fileExtension: z.string().min(1, "fileExtension is required"),
        fileSizeBytes: z.number().int().positive("fileSizeBytes must be positive"),
      })
    )
    .min(1, "At least one file is required")
    .max(2000, "Maximum 2000 files per batch request"),
});

export const bulkImportTrackSchema = z.object({
  title: z.string().min(1, "Track title is required").max(255),
  trackNumber: z.number().int().min(1).default(1),
  discNumber: z.number().int().min(1).default(1),
  durationSeconds: z.number().int().min(0).default(0),
  genre: z.string().max(60).nullish(),
  isExplicit: z.boolean().default(false),
  rawAudioKey: z.string().min(1, "rawAudioKey is required"),
  artistName: z.string().max(150).nullish(),
});

export const bulkImportReleaseSchema = z.object({
  artistName: z.string().min(1, "Artist name is required").max(150),
  albumTitle: z.string().min(1, "Album/Release title is required").max(255),
  albumType: z.enum(["ALBUM", "EP", "SINGLE", "MIXTAPE", "LP"]).optional(),
  genre: z.string().max(60).nullish(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD").nullish(),
  coverImageUrl: z.string().nullish(),
  existingAlbumId: z.string().uuid().nullish(),
  tracks: z.array(bulkImportTrackSchema).min(1, "At least one track is required").max(1000),
});

export const createPersonalArtistSchema = z.object({
  stageName: z.string().min(1, "Artist name is required").max(150),
  bio: z.string().max(1000).nullish(),
});

export type PresignedUrlInput = z.infer<typeof presignedUrlSchema>;
export type BatchPresignedUrlsInput = z.infer<typeof batchPresignedUrlsSchema>;
export type BulkImportReleaseInput = z.infer<typeof bulkImportReleaseSchema>;
export type BulkImportTrackInput = z.infer<typeof bulkImportTrackSchema>;
export type CreatePersonalArtistInput = z.infer<typeof createPersonalArtistSchema>;
