import { redis } from "../../db/redis";
import { cacheKeys } from "../../lib/cache/keys";
import type {
  PlayerCommandType,
  PlayerDeviceView,
  PlayerSession,
  SessionCommandInput,
  SessionSpeaker,
} from "./player.schemas";

/**
 * Groovy Connect realtime channel.
 *
 * One Redis Pub/Sub channel per account, fanned out to every device holding a
 * Server-Sent Events connection (the same transport `notifications` uses). The
 * stream is server → client only; every client → server action stays a plain
 * HTTP POST, so a dropped stream degrades to "slower" rather than "broken".
 *
 * See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.
 */

/** A logical session change. Carries no viewer-specific fields. */
export interface SessionStateEvent {
  session: PlayerSession;
  livePositionMs: number;
  speakerOnline: boolean;
  serverTime: number;
}

export type PlayerEvent =
  | ({ type: "SESSION_STATE" } & SessionStateEvent)
  | {
      type: "POSITION";
      positionMs: number;
      positionUpdatedAt: number;
      isPlaying: boolean;
      revision: number;
    }
  | {
      type: "SPEAKER_LOST";
      /** The device that lost the role; only it should stand down. */
      deviceId: string;
      instanceId: string;
      newSpeaker: SessionSpeaker | null;
    }
  | { type: "DEVICES_CHANGED"; devices: PlayerDeviceView[] }
  | {
      /**
       * A Remote's command, targeted at the Speaker. One channel serves the
       * whole account, so the ids name the device that must act — every other
       * client ignores it (design doc §6.4).
       */
      type: "COMMAND";
      deviceId: string;
      instanceId: string;
      commandId: string;
      command: PlayerCommandType;
      payload: SessionCommandInput["payload"] | null;
    }
  | {
      /**
       * A push transfer is waiting on this tab. It decides for itself whether to
       * start straight away or ask for a tap first (rule A10).
       */
      type: "TRANSFER_OFFER";
      deviceId: string;
      instanceId: string;
      transferId: string;
      track: PlayerSession["playback"]["track"];
      positionMs: number;
      positionUpdatedAt: number;
      isPlaying: boolean;
      expiresAt: number;
      needsGesture: boolean;
      /** Who pushed it, for the "from {device}" line. */
      fromDeviceName: string | null;
    }
  | {
      /**
       * The handshake failed or timed out and this tab has the Speaker role
       * back: resume where the needle was frozen (design doc §6.5).
       */
      type: "SPEAKER_GRANTED";
      deviceId: string;
      instanceId: string;
      track: PlayerSession["playback"]["track"];
      positionMs: number;
      positionUpdatedAt: number;
      isPlaying: boolean;
    }
  | {
      /** Tells the device that asked for a transfer how it ended. */
      type: "TRANSFER_RESULT";
      deviceId: string;
      instanceId: string;
      transferId: string;
      ok: boolean;
      reason?: string;
      speaker: SessionSpeaker | null;
      target: { deviceId: string; instanceId: string; deviceName: string } | null;
    };

/** Publishes an event to every device watching this account. */
export async function publishPlayerEvent(
  userId: string,
  event: PlayerEvent
): Promise<void> {
  try {
    await redis.publish(cacheKeys.player.events(userId), JSON.stringify(event));
  } catch (err) {
    // Realtime is an accelerator, never a source of truth: a failed publish
    // only means clients learn on their next poll instead.
    console.warn("[PlayerEvents] publish failed:", err);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Connection registry
 *
 * Two things the Redis TTLs cannot express on their own:
 *
 *  1. **Liveness.** A background tab's `setInterval` is throttled by the
 *     browser, so a Speaker that is playing but hidden would look offline and
 *     be evicted. An open SSE stream is not throttled, so the server refreshes
 *     that device's presence itself while the stream is open.
 *  2. **The detach grace.** A reload also drops the stream, so a Speaker must
 *     not be evicted the instant its socket closes — it gets 10 seconds to come
 *     back (design doc failure table).
 * ────────────────────────────────────────────────────────────────────────── */

/** How long a disconnected device keeps the Speaker role before standing down. */
export const PLAYER_STREAM_GRACE_MS = 10_000;

const streamCounts = new Map<string, number>();
const detachTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function playerStreamKey(
  userId: string,
  deviceId: string,
  instanceId: string
): string {
  return `${userId}|${deviceId}|${instanceId}`;
}

/**
 * Marks a stream as open. A (re)connect also cancels any pending stand-down,
 * which is precisely what makes a page reload seamless.
 */
export function openPlayerStream(key: string): void {
  streamCounts.set(key, (streamCounts.get(key) ?? 0) + 1);

  const pending = detachTimers.get(key);
  if (pending) {
    clearTimeout(pending);
    detachTimers.delete(key);
  }
}

/**
 * Marks a stream as closed. Only when the *last* stream for that tab goes away
 * does the grace timer start; returning within the grace cancels it.
 *
 * `graceMs` is injectable so tests can exercise the grace without waiting out
 * the real window.
 */
export function closePlayerStream(
  key: string,
  onGraceExpired: () => void,
  graceMs: number = PLAYER_STREAM_GRACE_MS
): void {
  const remaining = Math.max(0, (streamCounts.get(key) ?? 1) - 1);
  if (remaining === 0) streamCounts.delete(key);
  else streamCounts.set(key, remaining);

  // Another stream for the same tab is still open: nothing to do.
  if (remaining > 0) return;

  const existing = detachTimers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    detachTimers.delete(key);
    if (streamCounts.has(key)) return; // it came back
    onGraceExpired();
  }, graceMs);

  // Never hold the process open for a pending stand-down.
  (timer as { unref?: () => void }).unref?.();
  detachTimers.set(key, timer);
}

/** Test/introspection helper: is a stream currently open for this tab? */
export function hasPlayerStream(key: string): boolean {
  return streamCounts.has(key);
}

/** Test helper: drops all in-flight registry state. */
export function resetPlayerStreamRegistry(): void {
  for (const timer of detachTimers.values()) clearTimeout(timer);
  detachTimers.clear();
  streamCounts.clear();
}
