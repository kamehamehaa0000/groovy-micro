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
  isShuffle: z.boolean().default(false),
  repeatMode: z.enum(["off", "all", "one"]).default("off"),
  userQueue: z.array(playerTrackSchema).max(200).default([]),
  contextQueue: z.array(playerTrackSchema).max(500).default([]),
  contextIndex: z.coerce.number().int().nonnegative().default(0),
  contextUri: z.string().nullish(),
  contextTitle: z.string().nullish(),
});

export type SavePlayerStateInput = z.infer<typeof savePlayerStateSchema>;

/**
 * `volume` and `isMuted` are intentionally absent: they are device-local and
 * must never travel with the synced session (design doc rule R2 / A5). Older
 * clients still send them; zod strips unknown keys, so this is backward safe.
 */
export interface PlayerStateSnapshot extends SavePlayerStateInput {
  userId: string;
  updatedAt: string;
}

export const playerHeartbeatSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  deviceName: z.string().min(1, "Device Name is required"),
  /**
   * Per-tab identifier. Optional so pre-Connect clients keep working; it falls
   * back to `deviceId`, which makes those clients behave as one-tab devices.
   */
  instanceId: z.string().min(1).optional(),
  /** Has this tab ever started audio? Gates push transfers (rule A10). */
  unlocked: z.boolean().optional(),
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

/* ────────────────────────────────────────────────────────────────────────────
 * Groovy Connect — Listen Session & device registry
 * See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §4 and §6.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A device counts as reachable if it checked in within this window. */
export const ONLINE_WINDOW_MS = 90_000;
/** Cap on registered devices per account (design doc rule R9). */
export const MAX_DEVICES_PER_ACCOUNT = 10;
/** In-flight transfer tickets expire quickly so a stale offer can never win. */
export const TRANSFER_TTL_SECONDS = 30;

export const registerDeviceSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  deviceName: z.string().min(1, "Device name is required"),
  instanceId: z.string().min(1, "Instance (tab) ID is required"),
  platform: z.string().nullish(),
  /** Has audio ever started in this tab? Gates push transfers (rule A10). */
  unlocked: z.boolean().default(false),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const presenceSchema = z.object({
  deviceId: z.string().min(1),
  instanceId: z.string().min(1),
  unlocked: z.boolean().optional(),
});

export type PresenceInput = z.infer<typeof presenceSchema>;

export const sessionPositionSchema = z.object({
  deviceId: z.string().min(1),
  instanceId: z.string().min(1),
  positionMs: z.coerce.number().nonnegative().default(0),
  isPlaying: z.boolean().default(true),
});

export type SessionPositionInput = z.infer<typeof sessionPositionSchema>;

export const leaveSpeakerSchema = z.object({
  deviceId: z.string().min(1),
  instanceId: z.string().min(1),
});

export type LeaveSpeakerInput = z.infer<typeof leaveSpeakerSchema>;

/* ── Groovy Connect: push transfer (design doc §6.5, rules A6–A10) ─────────── */

export const sessionTransferSchema = z.object({
  /** The device asking for the move (any device on the account, rule A2). */
  deviceId: z.string().min(1, "Device ID is required"),
  instanceId: z.string().min(1, "Instance (tab) ID is required"),
  /** Idempotency key, so a double tap moves the Speaker once (rule A8). */
  transferId: z.string().min(1).max(128),
  /**
   * The **browser** to push to. The Devices panel has one row per browser while
   * the Speaker role is per tab (rule R10), so the server picks the tab that
   * should actually play.
   */
  targetDeviceId: z.string().min(1, "Target device is required"),
  /**
   * The revision the requester was looking at. A mismatch means someone moved
   * the session in the meantime, so the client refetches and retries instead of
   * pushing onto a state the user never saw.
   */
  expectedRevision: z.coerce.number().int().nonnegative().optional(),
});

export type SessionTransferInput = z.infer<typeof sessionTransferSchema>;

export const transferConfirmSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  instanceId: z.string().min(1, "Instance (tab) ID is required"),
  transferId: z.string().min(1).max(128),
  /** `false` means "not now", which hands the needle straight back (rule A9). */
  ok: z.boolean().default(true),
  /** Where the target actually started, so the session anchors on reality. */
  positionMs: z.coerce.number().nonnegative().optional(),
  isPlaying: z.boolean().optional(),
});

export type TransferConfirmInput = z.infer<typeof transferConfirmSchema>;

/**
 * A push-transfer ticket. It only exists while the target has not yet confirmed
 * that it started playing, so it is deliberately short-lived: a stale offer can
 * never win the Speaker role back (rule A9).
 */
export interface PendingTransfer {
  transferId: string;
  /** Who asked, so the result is routed back to that exact tab. */
  requestedBy: { deviceId: string; instanceId: string };
  /** The Speaker that went quiet for the duration of the handshake. */
  from: SessionSpeaker | null;
  /** The tab that should take playback over. */
  to: { deviceId: string; instanceId: string; deviceName: string };
  /** The needle as it was when the old Speaker went quiet, and its run state. */
  frozenPositionMs: number;
  wasPlaying: boolean;
  /** Does the target need a tap before it may start audio? (rule A10) */
  needsGesture: boolean;
  createdAt: number;
  expiresAt: number;
}

/** Why a push transfer was refused. Every one of these becomes copy (rule A6). */
export type PlayerTransferFailure =
  | "NO_SESSION"
  | "NO_TRACK"
  | "NO_DEVICE"
  | "TARGET_OFFLINE"
  | "TARGET_IS_SPEAKER"
  | "STALE_STATE"
  | "STALE_TRANSFER"
  | "NOT_TARGET";

/** Why an in-flight handshake was given back. */
export type TransferRevertReason =
  | "TIMEOUT"
  | "DECLINED"
  | "SUPERSEDED"
  | "OFFLINE";

export interface PlayerTransferResult {
  ok: boolean;
  /** Set when this exact `transferId` had already been seen (rule A8). */
  duplicate?: boolean;
  reason?: PlayerTransferFailure;
  transferId?: string;
  /** When the target must have confirmed by, in ms epoch. */
  expiresAt?: number;
  /** True when the target must show "Tap to play here" first (rule A10). */
  needsGesture?: boolean;
  target?: PendingTransfer["to"] | null;
  speaker?: SessionSpeaker | null;
}

/* ── Groovy Connect: Remote commands (design doc §6.4, rules B1–B5) ────────── */

/**
 * What a Remote may ask the session's Speaker to do.
 *
 * `PLAY_TRACK` is the one command that carries content: tapping a song on a
 * Remote plays it *on the Speaker* — the Spotify behaviour (rule B7) — so the
 * command carries the tapped track and the context it was tapped inside. The
 * queue fields are bounded by the same limits as the synced snapshot.
 */
export const PLAYER_COMMAND_TYPES = [
  "PLAY",
  "PAUSE",
  "SEEK",
  "STOP",
  "NEXT",
  "PREVIOUS",
  "SET_VOLUME",
  "SET_MUTE",
  "SET_SHUFFLE",
  "SET_REPEAT",
  "ADD_TO_QUEUE",
  "PLAY_NEXT",
  "PLAY_TRACK",
  "REMOVE_FROM_QUEUE",
  "REORDER_QUEUE",
  "CLEAR_QUEUE",
] as const;

export type PlayerCommandType = (typeof PLAYER_COMMAND_TYPES)[number];

/**
 * Applied by the server itself so every Remote converges from `SESSION_STATE`
 * without waiting for the Speaker to answer. Everything else is relayed to the
 * Speaker, which owns the queue and reports back through its normal paths.
 *
 * `PLAY_TRACK` is applied here *and* relayed: the server owns "what is playing"
 * (rule B7's tap-a-song), while the Speaker is still the one that swaps its own
 * audio and queue.
 */
export const SERVER_APPLIED_COMMANDS: readonly PlayerCommandType[] = [
  "PLAY",
  "PAUSE",
  "SEEK",
  "STOP",
  "PLAY_TRACK",
];

export function isServerAppliedCommand(
  type: PlayerCommandType
): boolean {
  return SERVER_APPLIED_COMMANDS.includes(type);
}

export const sessionCommandSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  instanceId: z.string().min(1, "Instance (tab) ID is required"),
  /** Idempotency key, so a retry or a double tap applies once (rule A8). */
  commandId: z.string().min(1).max(128),
  type: z.enum(PLAYER_COMMAND_TYPES),
  payload: z
    .object({
      positionMs: z.coerce.number().nonnegative().optional(),
      volume: z.coerce.number().min(0).max(1).optional(),
      muted: z.boolean().optional(),
      shuffle: z.boolean().optional(),
      repeat: z.enum(["off", "all", "one"]).optional(),
      index: z.coerce.number().int().nonnegative().optional(),
      toIndex: z.coerce.number().int().nonnegative().optional(),
      track: playerTrackSchema.nullish(),
      /**
       * Rule B7: the context a Remote tapped a song inside, so the Speaker can
       * adopt it and keep NEXT / PREVIOUS meaningful. Same limits as the
       * synced snapshot (see `savePlayerStateSchema`).
       */
      contextQueue: z.array(playerTrackSchema).max(500).optional(),
      contextIndex: z.coerce.number().int().nonnegative().optional(),
      contextUri: z.string().nullish(),
      contextTitle: z.string().nullish(),
    })
    .optional(),
});

export type SessionCommandInput = z.infer<typeof sessionCommandSchema>;

/** How long a command id is remembered for deduplication. */
export const COMMAND_DEDUPE_TTL_SECONDS = 60;

export type PlayerCommandFailure =
  | "NO_SESSION"
  | "NO_SPEAKER"
  | "IS_SPEAKER"
  | "SPEAKER_OFFLINE";

export interface PlayerCommandResult {
  ok: boolean;
  /** Set when this exact `commandId` had already been applied. */
  duplicate?: boolean;
  reason?: PlayerCommandFailure;
  speaker?: SessionSpeaker | null;
}

/** A durable entry in the account's device registry. */
export interface PlayerDevice {
  deviceId: string;
  deviceName: string;
  platform: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface SessionSpeaker {
  deviceId: string;
  instanceId: string;
  deviceName: string;
  confirmed: boolean;
  lastSeenAt: number;
}

export interface SessionPlayback {
  track: PlayerTrack | null;
  positionMs: number;
  /** ms epoch on the SERVER clock — the anchor Remotes interpolate from. */
  positionUpdatedAt: number;
  isPlaying: boolean;
  durationMs: number;
}

export interface SessionContext {
  uri: string | null;
  title: string | null;
  index: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
}

export interface PlayerSession {
  userId: string;
  revision: number;
  speaker: SessionSpeaker | null;
  playback: SessionPlayback;
  context: SessionContext;
  updatedAt: number;
}

/** A device as the client sees it in the Devices panel. */
export interface PlayerDeviceView extends PlayerDevice {
  online: boolean;
  isSpeaker: boolean;
}

export interface PlayerSessionView {
  session: PlayerSession;
  /** The needle right now, derived from the server-stamped anchor. */
  livePositionMs: number;
  speakerOnline: boolean;
  devices: PlayerDeviceView[];
  yourInstanceId: string | null;
  youAreSpeaker: boolean;
  serverTime: number;
}
