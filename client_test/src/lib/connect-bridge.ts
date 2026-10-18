/**
 * Groovy Connect bridge.
 *
 * `player.store` needs to answer two questions before it acts on a transport
 * action — "am I the Speaker?" and "please send this to the Speaker" — but it
 * cannot import `connect.store`, which imports it. This module is that seam:
 * `connect.store` installs the implementation once at startup, and
 * `player.store` calls it.
 *
 * Until it is installed, every action behaves exactly as it did before Groovy
 * Connect existed. That is what keeps playback working when the user is signed
 * out or offline — the seam fails *open*, never shut.
 */

import type {
  RemoteCommandPayload,
  RemoteCommandType,
} from "./player.api";

/** What a Remote can ask the session's Speaker to do (design doc §6.4). */
export type { RemoteCommandPayload, RemoteCommandType };

interface ConnectBridge {
  /** True when another device owns the session, so this tab must not play audio. */
  isRemote: () => boolean;
  /**
   * Sends a command to the session's Speaker, best-effort. `onUnreachable` runs
   * when the Speaker cannot be reached at all, so a caller that has a sensible
   * local fallback (a song tap) can use it instead of leaving a dead tap.
   */
  send: (
    type: RemoteCommandType,
    payload?: RemoteCommandPayload,
    onUnreachable?: () => void
  ) => void;
}

let bridge: ConnectBridge | null = null;

/** Installed once by `connect.store`. Pass null to detach (used by tests). */
export function setConnectBridge(next: ConnectBridge | null): void {
  bridge = next;
}

/**
 * Rule B1: while this device is not the Speaker, a transport action is a
 * command to the session rather than something to do locally.
 *
 * Returns true when the caller must stop and do nothing else. `onUnreachable`,
 * when given, runs if the Speaker turns out to be unreachable — the caller can
 * then fall back to doing the thing locally (a song tap plays here instead).
 */
export function routeToSpeaker(
  type: RemoteCommandType,
  payload?: RemoteCommandPayload,
  onUnreachable?: () => void
): boolean {
  if (!bridge || !bridge.isRemote()) return false;
  bridge.send(type, payload, onUnreachable);
  return true;
}
