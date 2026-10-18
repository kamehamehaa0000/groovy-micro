import { apiFetch } from "./api";
import type { PlayerStateSnapshot, PlayerTrack, StreamResolution } from "../types/player";

export interface HeartbeatPayload {
  deviceId: string;
  deviceName: string;
  /** Per-tab identity (Groovy Connect). Falls back to `deviceId` server-side. */
  instanceId?: string;
  /** Has this tab ever started audio? Gates push transfers (rule A10). */
  unlocked?: boolean;
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

/**
 * The server-synced snapshot. Excludes `volume` / `isMuted`, which stay local
 * to each device (design doc rule R2).
 */
export type SavePlayerStatePayload = Omit<
  PlayerStateSnapshot,
  "userId" | "updatedAt" | "volume" | "isMuted"
>;

/* ────────────────────────────────────────────────────────────────────────────
 * Groovy Connect — Listen Session & devices
 * Mirrors server/src/modules/player/player.schemas.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RegisterDevicePayload {
  deviceId: string;
  deviceName: string;
  instanceId: string;
  platform?: string | null;
  unlocked?: boolean;
}

export interface PresencePayload {
  deviceId: string;
  instanceId: string;
  unlocked?: boolean;
}

export interface SessionPositionPayload {
  deviceId: string;
  instanceId: string;
  positionMs: number;
  isPlaying: boolean;
}

export interface SessionSpeaker {
  deviceId: string;
  instanceId: string;
  deviceName: string;
  confirmed: boolean;
  lastSeenAt: number;
}

export interface SessionPlayback {
  track: PlayerStateSnapshot["currentTrack"];
  positionMs: number;
  positionUpdatedAt: number;
  isPlaying: boolean;
  durationMs: number;
}

export interface SessionContext {
  uri: string | null;
  title: string | null;
  index: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}

export interface PlayerSession {
  userId: string;
  revision: number;
  speaker: SessionSpeaker | null;
  playback: SessionPlayback;
  context: SessionContext;
  updatedAt: number;
}

export interface PlayerDeviceView {
  deviceId: string;
  deviceName: string;
  platform: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  online: boolean;
  isSpeaker: boolean;
}

export interface PlayerSessionView {
  session: PlayerSession;
  livePositionMs: number;
  speakerOnline: boolean;
  devices: PlayerDeviceView[];
  yourInstanceId: string | null;
  youAreSpeaker: boolean;
  serverTime: number;
}

/* ── Groovy Connect: realtime stream ──────────────────────────────────────────
 * The SSE payloads published on the account's channel. Mirrors
 * server/src/modules/player/player.events.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Sent once on connect: a full resync, so missed events never matter. */
export interface HelloEventPayload {
  type: "hello";
  session: PlayerSessionView | null;
  devices: PlayerDeviceView[];
  yourInstanceId: string | null;
  serverTime: number;
}

/** A logical session change, broadcast to every device on the account. */
export interface SessionStateEventPayload {
  type: "SESSION_STATE";
  session: PlayerSession;
  livePositionMs: number;
  speakerOnline: boolean;
  serverTime: number;
}

/** The Speaker's needle tick — the high-frequency, tiny payload. */
export interface PositionEventPayload {
  type: "POSITION";
  positionMs: number;
  positionUpdatedAt: number;
  isPlaying: boolean;
  revision: number;
}

/** Tells one specific device it is no longer the Speaker. */
export interface SpeakerLostEventPayload {
  type: "SPEAKER_LOST";
  deviceId: string;
  instanceId: string;
  newSpeaker: SessionSpeaker | null;
}

/** The device list changed (someone joined, left or was forgotten). */
export interface DevicesChangedEventPayload {
  type: "DEVICES_CHANGED";
  devices: PlayerDeviceView[];
}

/** What a Remote may ask the Speaker to do. Mirrors the server's enum. */
export type RemoteCommandType =
  | "PLAY"
  | "PAUSE"
  | "SEEK"
  | "STOP"
  | "NEXT"
  | "PREVIOUS"
  | "SET_VOLUME"
  | "SET_MUTE"
  | "SET_SHUFFLE"
  | "SET_REPEAT"
  | "ADD_TO_QUEUE"
  | "PLAY_NEXT"
  | "PLAY_TRACK"
  | "REMOVE_FROM_QUEUE"
  | "REORDER_QUEUE"
  | "CLEAR_QUEUE";

/**
 * A Remote's command, targeted at the Speaker. The ids name the one device that
 * must act — everyone else on the channel ignores it (design doc §6.4).
 */
export interface CommandEventPayload {
  type: "COMMAND";
  deviceId: string;
  instanceId: string;
  commandId: string;
  command: RemoteCommandType;
  payload: RemoteCommandPayload | null;
}

/** A push transfer waiting on this tab's answer (rule A9/A10). */
export interface TransferOfferEventPayload {
  type: "TRANSFER_OFFER";
  deviceId: string;
  instanceId: string;
  transferId: string;
  track: SessionPlayback["track"];
  positionMs: number;
  positionUpdatedAt: number;
  isPlaying: boolean;
  expiresAt: number;
  needsGesture: boolean;
  fromDeviceName: string | null;
}

/** The handshake failed: this tab has the Speaker role back (design doc §6.5). */
export interface SpeakerGrantedEventPayload {
  type: "SPEAKER_GRANTED";
  deviceId: string;
  instanceId: string;
  track: SessionPlayback["track"];
  positionMs: number;
  positionUpdatedAt: number;
  isPlaying: boolean;
}

/** How the transfer this tab asked for ended. */
export interface TransferResultEventPayload {
  type: "TRANSFER_RESULT";
  deviceId: string;
  instanceId: string;
  transferId: string;
  ok: boolean;
  reason?: string;
  speaker: SessionSpeaker | null;
  target: { deviceId: string; instanceId: string; deviceName: string } | null;
}

export interface RemoteCommandPayload {
  positionMs?: number;
  volume?: number;
  muted?: boolean;
  shuffle?: boolean;
  repeat?: "off" | "all" | "one";
  index?: number;
  toIndex?: number;
  track?: SessionPlayback["track"];
  /** Rule B7: the track list the tapped song came from, so the Speaker can adopt it. */
  contextQueue?: PlayerTrack[];
  contextIndex?: number;
  contextUri?: string | null;
  contextTitle?: string | null;
}

export interface SendCommandPayload {
  deviceId: string;
  instanceId: string;
  /** Idempotency key, so a retry or a double tap applies once. */
  commandId: string;
  type: RemoteCommandType;
  payload?: RemoteCommandPayload;
}

/** Why a command was refused. Every one of these has user-facing copy (rule B3). */
export type PlayerCommandFailure =
  | "NO_SESSION"
  | "NO_SPEAKER"
  | "IS_SPEAKER"
  | "SPEAKER_OFFLINE";

export interface SendCommandResponse {
  ok: boolean;
  duplicate?: boolean;
  reason?: PlayerCommandFailure;
  speaker?: SessionSpeaker | null;
}

/* ── Groovy Connect: push transfer (design doc §6.5, rules A6–A10) ─────────── */

export interface SessionTransferPayload {
  deviceId: string;
  instanceId: string;
  /** Idempotency key, so a double tap moves the Speaker once (rule A8). */
  transferId: string;
  /** The *browser* to push to; the server picks the tab that will play. */
  targetDeviceId: string;
  /** Optional optimistic-concurrency guard against a stale tap. */
  expectedRevision?: number;
}

export interface TransferConfirmPayload {
  deviceId: string;
  instanceId: string;
  transferId: string;
  /** `false` means "not now", which hands the needle straight back (rule A9). */
  ok: boolean;
  positionMs?: number;
  isPlaying?: boolean;
}

/** Why a push transfer was refused. Each one becomes copy (rule A6). */
export type PlayerTransferFailure =
  | "NO_SESSION"
  | "NO_TRACK"
  | "NO_DEVICE"
  | "TARGET_OFFLINE"
  | "TARGET_IS_SPEAKER"
  | "STALE_STATE"
  | "STALE_TRANSFER"
  | "NOT_TARGET";

export interface TransferResultResponse {
  ok: boolean;
  duplicate?: boolean;
  reason?: PlayerTransferFailure;
  transferId?: string;
  expiresAt?: number;
  /** True when the target must show "Tap to play here" first (rule A10). */
  needsGesture?: boolean;
  target?: {
    deviceId: string;
    instanceId: string;
    deviceName: string;
  } | null;
  speaker?: SessionSpeaker | null;
}

/** A push offer this tab has to answer, from a `TRANSFER_OFFER` frame. */
export interface IncomingTransfer {
  transferId: string;
  track: SessionPlayback["track"];
  positionMs: number;
  positionUpdatedAt: number;
  isPlaying: boolean;
  expiresAt: number;
  needsGesture: boolean;
  fromDeviceName: string | null;
}

export type ConnectEventPayload =
  | HelloEventPayload
  | SessionStateEventPayload
  | PositionEventPayload
  | SpeakerLostEventPayload
  | CommandEventPayload
  | TransferOfferEventPayload
  | SpeakerGrantedEventPayload
  | TransferResultEventPayload
  | DevicesChangedEventPayload;

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
    albumSlug?: string | null;
    albumType?: 'ALBUM' | 'SINGLE' | 'EP' | 'MIXTAPE' | 'LP' | null;
    albumCoverImageUrl?: string | null;
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
   * Saves the debounced player snapshot to Redis for cross-device resumption.
   * `volume` / `isMuted` are deliberately excluded: they are device-local and
   * must never travel with the session (rule R2).
   */
  async savePlayerState(
    state: SavePlayerStatePayload
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

  /* ── Groovy Connect: session & devices ─────────────────────────────────── */

  /**
   * The account's Listen Session: Speaker, live needle and the device list.
   * `devices` is returned even when there is no session yet, so the Devices
   * panel works for an account that has never played anything.
   */
  async getSession(viewer?: {
    deviceId?: string;
    instanceId?: string;
  }): Promise<{ session: PlayerSessionView | null; devices: PlayerDeviceView[] }> {
    const params = new URLSearchParams();
    if (viewer?.deviceId) params.set("deviceId", viewer.deviceId);
    if (viewer?.instanceId) params.set("instanceId", viewer.instanceId);
    const qs = params.toString();
    return apiFetch<{
      session: PlayerSessionView | null;
      devices: PlayerDeviceView[];
    }>(`/api/v1/player/session${qs ? `?${qs}` : ""}`);
  },

  /**
   * Registers this tab in the account's device list on app open.
   */
  async registerDevice(
    payload: RegisterDevicePayload
  ): Promise<{ session: PlayerSessionView | null; devices: PlayerDeviceView[] }> {
    return apiFetch<{
      session: PlayerSessionView | null;
      devices: PlayerDeviceView[];
    }>("/api/v1/player/devices/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Lightweight liveness ping (every 30s), so a paused device stays listed.
   */
  async sendPresence(
    payload: PresencePayload
  ): Promise<{ devices: PlayerDeviceView[] }> {
    return apiFetch<{ devices: PlayerDeviceView[] }>("/api/v1/player/presence", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * The Devices panel contents.
   */
  async listDevices(): Promise<{ devices: PlayerDeviceView[] }> {
    return apiFetch<{ devices: PlayerDeviceView[] }>("/api/v1/player/devices");
  },

  /**
   * Forgets a device from the account.
   */
  async forgetDevice(deviceId: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/api/v1/player/devices/${encodeURIComponent(deviceId)}`,
      { method: "DELETE" }
    );
  },

  /**
   * The Speaker's needle tick. Re-stamped on the server clock. When this tab is
   * no longer the Speaker the response says so, and carries the new Speaker so
   * the loser can step down instead of playing on (rules A4 / C1).
   */
  async sendSessionPosition(
    payload: SessionPositionPayload
  ): Promise<{ updated: boolean; speaker: SessionSpeaker | null }> {
    return apiFetch<{ updated: boolean; speaker: SessionSpeaker | null }>(
      "/api/v1/player/session/position",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * Sends a Remote's command to the session's Speaker (rule B1).
   *
   * Deliberately not thrown on refusal: "the Speaker is offline" is an expected
   * answer that the UI turns into copy, not an exception.
   */
  async sendSessionCommand(
    payload: SendCommandPayload
  ): Promise<SendCommandResponse> {
    return apiFetch<SendCommandResponse>("/api/v1/player/session/command", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Asks the session to move onto another device — "Play on {device}".
   *
   * Not thrown on refusal: "that device isn't available right now" is an
   * expected answer the UI turns into copy, not an exception (rule A6).
   */
  async requestSessionTransfer(
    payload: SessionTransferPayload
  ): Promise<TransferResultResponse> {
    return apiFetch<TransferResultResponse>("/api/v1/player/session/transfer", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * The target answering an offer: it started there, or asked for a tap first,
   * or declined (rule A9).
   */
  async confirmSessionTransfer(
    payload: TransferConfirmPayload
  ): Promise<TransferResultResponse> {
    return apiFetch<TransferResultResponse>(
      "/api/v1/player/session/transfer/confirm",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * Releases the Speaker role on tab close. Uses `sendBeacon` because a normal
   * fetch is cancelled when the page unloads; the token travels in the query
   * string because a beacon cannot set headers (rule R7).
   */
  leaveSpeakerBeacon(
    deviceId: string,
    instanceId: string,
    token?: string | null
  ): boolean {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return false;
    const url = `/api/v1/player/session/speaker/leave${
      token ? `?token=${encodeURIComponent(token)}` : ""
    }`;
    const body = JSON.stringify({ deviceId, instanceId });
    return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  },

  /**
   * The URL for the Groovy Connect realtime stream. `EventSource` cannot set an
   * Authorization header, so the token rides in the query string — the same
   * trick `leaveSpeakerBeacon` uses.
   */
  sessionEventsUrl(
    deviceId: string,
    instanceId: string,
    token?: string | null
  ): string {
    const params = new URLSearchParams({ deviceId, instanceId });
    if (token) params.set("token", token);
    return `/api/v1/player/session/events?${params.toString()}`;
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
