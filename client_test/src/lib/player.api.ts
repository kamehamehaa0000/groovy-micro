import { apiFetch } from "./api";
import type { PlayerStateSnapshot, StreamResolution } from "../types/player";

export interface HeartbeatPayload {
  deviceId: string;
  deviceName: string;
  songId?: string | null;
  trackTitle?: string | null;
  artistName?: string | null;
  coverImageUrl?: string | null;
  progressMs: number;
  durationMs?: number;
  isPaused: boolean;
  takeover?: boolean;
}

export interface HeartbeatResponse {
  status: "active" | "superseded";
  activeDevice?: {
    deviceId: string;
    deviceName: string;
  };
}

export interface TelemetryPayload {
  songId: string;
  durationListenedSeconds: number;
  completed?: boolean;
  countPlay?: boolean;
  skipped?: boolean;
  skipDurationSeconds?: number | null;
}

export interface HistorySong {
  id: string;
  title: string;
  slug: string;
  genre: string | null;
  primaryGenre?: string | null;
  subGenre?: string | null;
  durationSeconds: number;
  isExplicit: boolean;
  coverImageUrl: string | null;
  audioUrl: string | null;
  hlsManifestUrl: string | null;
  rawAudioKey: string | null;
  scope: string;
  artistId: string;
  artistName: string;
  artistSlug: string;
  albumId: string | null;
  albumTitle: string | null;
  albumSlug?: string | null;
  albumType?: 'ALBUM' | 'SINGLE' | 'EP' | 'MIXTAPE' | 'LP' | null;
  albumCoverImageUrl?: string | null;
  albumReleaseDate?: string | null;
}

export interface HistoryItem {
  historyId: string;
  playedAt: string;
  durationListenedSeconds: number;
  completed: boolean;
  song: HistorySong;
}

export interface GetHistoryResponse {
  items: HistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface RecentHistoryItem {
  historyId: string;
  playedAt: string;
  durationListenedSeconds: number;
  completed: boolean;
  song: {
    id: string;
    title: string;
    slug: string;
    genre: string | null;
    primaryGenre?: string | null;
    subGenre?: string | null;
    moods?: string[];
    tags?: string[];
    bpm?: number | null;
    musicalKey?: string | null;
    energy?: number | null;
    durationSeconds: number;
    isExplicit: boolean;
    coverImageUrl: string | null;
    audioUrl: string | null;
    hlsManifestUrl: string | null;
    rawAudioKey: string | null;
    artistId: string;
    artistName: string;
    artistSlug: string;
    albumId: string | null;
    albumTitle: string | null;
  };
}

export const playerApi = {
  /**
   * Retrieves user's cross-device playback state snapshot from Redis (<1ms).
   */
  async getPlayerState(): Promise<{ state: PlayerStateSnapshot | null }> {
    return apiFetch<{ state: PlayerStateSnapshot | null }>("/api/v1/player/state");
  },

  /**
   * Saves debounced player state snapshot to Redis for cross-device resumption.
   */
  async savePlayerState(
    state: Omit<PlayerStateSnapshot, "userId" | "updatedAt">
  ): Promise<{ success: boolean; state: PlayerStateSnapshot }> {
    return apiFetch<{ success: boolean; state: PlayerStateSnapshot }>(
      "/api/v1/player/state",
      {
        method: "PUT",
        body: JSON.stringify(state),
      }
    );
  },

  /**
   * Sends active playback heartbeat to coordinate multi-device takeover & live presence.
   */
  async sendHeartbeat(payload: HeartbeatPayload): Promise<HeartbeatResponse> {
    return apiFetch<HeartbeatResponse>("/api/v1/player/heartbeat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Retrieves current active device lease.
   */
  async getActiveDevice(): Promise<{
    activeDevice: { deviceId: string; deviceName: string } | null;
  }> {
    return apiFetch<{
      activeDevice: { deviceId: string; deviceName: string } | null;
    }>("/api/v1/player/active-device");
  },

  /**
   * Reports qualified play count (30s milestone) to Redis buffer and user history.
   */
  async sendTelemetry(payload: TelemetryPayload): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>("/api/v1/player/telemetry/play", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Retrieves the user's recent listening history for profile / home shelves.
   */
  async getRecentHistory(): Promise<{ history: RecentHistoryItem[] }> {
    return apiFetch<{ history: RecentHistoryItem[] }>("/api/v1/player/history/recent");
  },

  /**
   * Retrieves paginated chronological listening history.
   */
  async getHistory(params: {
    cursor?: string;
    limit?: number;
    filter?: 'all' | 'completed' | 'personal';
  } = {}): Promise<GetHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.filter && params.filter !== 'all') searchParams.set('filter', params.filter);
    const qs = searchParams.toString();
    return apiFetch<GetHistoryResponse>(`/api/v1/player/history${qs ? `?${qs}` : ''}`);
  },

  /**
   * Retrieves active playback presence for mutual friends and followed listeners.
   */
  async getFriendsActivity(): Promise<{ activities: FriendActivityItem[] }> {
    return apiFetch<{ activities: FriendActivityItem[] }>("/api/v1/player/friends-activity");
  },

  /**
   * Resolves audio stream URL with dynamic entitlement check (FLAC / Hi-Fi vs. standard).
   */
  async getStreamUrl(
    songId: string,
    wantsLossless: boolean = false
  ): Promise<StreamResolution> {
    const query = wantsLossless ? "?quality=lossless" : "";
    return apiFetch<StreamResolution>(`/api/v1/songs/${songId}/stream${query}`);
  },
};

export interface FriendActivityItem {
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isMutualFriend: boolean;
  };
  activity: {
    songId: string;
    trackTitle: string;
    artistName: string;
    coverImageUrl: string | null;
    progressMs: number;
    durationMs?: number;
    deviceName?: string;
    updatedAt: number;
  };
}
