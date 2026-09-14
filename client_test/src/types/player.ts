export interface PlayerTrack {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  artistSlug?: string;
  albumId?: string | null;
  albumTitle?: string | null;
  albumSlug?: string | null;
  coverImageUrl?: string | null;
  durationSeconds: number;
  audioUrl?: string | null;
  hlsManifestUrl?: string | null;
  rawAudioKey?: string | null;
  isExplicit?: boolean;
  isLiked?: boolean;
}

export type RepeatMode = "off" | "all" | "one";
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface PlayerStateSnapshot {
  currentTrack: PlayerTrack | null;
  playbackPosition: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  userQueue: PlayerTrack[];
  contextQueue: PlayerTrack[];
  contextIndex: number;
  contextUri?: string | null;
  contextTitle?: string | null;
  updatedAt?: string;
}

export interface StreamResolution {
  streamUrl: string;
  audioUrl?: string | null;
  hlsManifestUrl?: string | null;
  processingStatus?: string | null;
  quality?: "lossless" | "standard";
}
