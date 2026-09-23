import { z } from "zod";

export const playerTrackSchema = z.object({
  id: z.string().uuid("Invalid song UUID"),
  title: z.string().min(1, "Track title cannot be blank"),
  artistId: z.string().min(1, "Artist ID required"),
  artistName: z.string().min(1, "Artist name required"),
  artistSlug: z.string().optional(),
  albumId: z.string().uuid().nullish(),
  albumTitle: z.string().nullish(),
  coverImageUrl: z.string().nullish(),
  durationSeconds: z.coerce.number().int().nonnegative().default(0),
  audioUrl: z.string().nullish(),
  hlsManifestUrl: z.string().nullish(),
  rawAudioKey: z.string().nullish(),
  isExplicit: z.boolean().default(false),
  isLiked: z.boolean().optional(),
  primaryGenre: z.string().nullish(),
  subGenre: z.string().nullish(),
  moods: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  bpm: z.number().nullish(),
  musicalKey: z.string().nullish(),
  energy: z.number().nullish(),
});

export type PlayerTrack = z.infer<typeof playerTrackSchema>;

export const savePlayerStateSchema = z.object({
  currentTrack: playerTrackSchema.nullish(),
  playbackPosition: z.coerce.number().nonnegative().default(0),
  volume: z.coerce.number().min(0).max(1).default(0.8),
  isMuted: z.boolean().default(false),
  isShuffle: z.boolean().default(false),
  repeatMode: z.enum(["off", "all", "one"]).default("off"),
  userQueue: z.array(playerTrackSchema).max(200).default([]),
  contextQueue: z.array(playerTrackSchema).max(500).default([]),
  contextIndex: z.coerce.number().int().nonnegative().default(0),
  contextUri: z.string().nullish(),
  contextTitle: z.string().nullish(),
});

export type SavePlayerStateInput = z.infer<typeof savePlayerStateSchema>;

export interface PlayerStateSnapshot extends SavePlayerStateInput {
  userId: string;
  updatedAt: string;
}

export const playerHeartbeatSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  deviceName: z.string().min(1, "Device Name is required"),
  songId: z.string().uuid().nullish(),
  trackTitle: z.string().nullish(),
  artistName: z.string().nullish(),
  coverImageUrl: z.string().nullish(),
  progressMs: z.coerce.number().nonnegative().default(0),
  durationMs: z.coerce.number().nonnegative().optional(),
  isPaused: z.boolean().default(false),
  takeover: z.boolean().default(false),
});

export type PlayerHeartbeatInput = z.infer<typeof playerHeartbeatSchema>;

export interface ActiveDeviceSession {
  deviceId: string;
  deviceName: string;
  songId?: string | null;
  trackTitle?: string | null;
  artistName?: string | null;
  coverImageUrl?: string | null;
  progressMs: number;
  durationMs?: number;
  isPaused: boolean;
  updatedAt: number;
}

export interface PlayerHeartbeatResponse {
  status: "active" | "superseded";
  activeDevice?: {
    deviceId: string;
    deviceName: string;
  };
}

export const telemetryPlaySchema = z.object({
  songId: z.string().uuid("Invalid song UUID"),
  durationListenedSeconds: z.coerce.number().int().nonnegative().default(30),
  completed: z.boolean().default(false),
  countPlay: z.boolean().default(true),
  skipped: z.boolean().default(false),
  skipDurationSeconds: z.coerce.number().int().nonnegative().nullish(),
});

export type TelemetryPlayInput = z.infer<typeof telemetryPlaySchema>;
