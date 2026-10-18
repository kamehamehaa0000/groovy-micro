import { create } from "zustand";
import { playerApi } from "../lib/player.api";
import type {
  ConnectEventPayload,
  IncomingTransfer,
  PlayerDeviceView,
  PlayerSession,
  PlayerSessionView,
  PlayerTransferFailure,
} from "../lib/player.api";
import { setConnectBridge } from "../lib/connect-bridge";
import type {
  RemoteCommandPayload,
  RemoteCommandType,
} from "../lib/connect-bridge";
import { useAuthStore } from "./auth.store";
import { usePlayerStore } from "./player.store";
import type { PlayerTrack } from "../types/player";

/** Pulling playback onto this device, optionally with a specific song. */
export interface PlayHereOptions {
  track?: PlayerTrack;
  contextQueue?: PlayerTrack[];
  contextIndex?: number;
  contextUri?: string;
  contextTitle?: string;
}

/**
 * Groovy Connect — the signed-in account's cross-device state.
 *
 * One account is one Listen Session with one Speaker (the device making sound)
 * and any number of Remotes (devices that can steer it). This store is the only
 * owner of device/session state; `player.store` owns what is actually playing on
 * *this* device. See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md.
 */
interface ConnectState {
  /** Every device registered to the account, with online + Speaker state. */
  devices: PlayerDeviceView[];
  /** The last known Listen Session and its server-stamped live needle. */
  sessionView: PlayerSessionView | null;
  /** True when *this tab* is the Speaker of the session. */
  youAreSpeaker: boolean;
  /**
   * The session's needle right now, interpolated locally between the sparse
   * POSITION events so a Remote's progress bar glides instead of jumping every
   * ten seconds (rule B2).
   */
  livePositionMs: number;
  /** Set when a command failed in a way the user should know about (rule B3). */
  commandError: string | null;
  /**
   * A push transfer ("Play on {device}") waiting on this tab's answer. It either
   * starts straight away or shows "Tap to play here" (rule A9/A10).
   */
  incomingTransfer: IncomingTransfer | null;
  /** The device a push this tab asked for is heading to, while it is in flight. */
  transferPending: { deviceId: string; deviceName: string } | null;
  /** Quiet copy for a transfer that was refused or never landed (rule A6). */
  transferError: string | null;

  /** This browser's durable identity (one row per browser — rule R10). */
  myDeviceId: string | null;
  myDeviceName: string | null;
  /** This tab's identity (the Speaker role is per-tab). */
  myInstanceId: string | null;

  isRefreshing: boolean;
  isPlayHerePending: boolean;
  error: string | null;
  /** True while the realtime stream is up; the UI falls back to polling when not. */
  sseConnected: boolean;

  setDevices: (devices: PlayerDeviceView[]) => void;
  applySessionView: (
    view: PlayerSessionView | null,
    devices?: PlayerDeviceView[]
  ) => void;
  setYouAreSpeaker: (isSpeaker: boolean) => void;
  setLivePositionMs: (ms: number) => void;
  register: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Pull the account's playback onto this device at the live position. Pass a
   * track to start something specific instead — tapping a song on a Remote is
   * the same transfer plus a song (rule B7).
   */
  playHere: (options?: PlayHereOptions) => Promise<void>;
  /**
   * Pushes the account's playback onto another device — "Play on {device}".
   *
   * The push is a handshake: the server mutes this device (if it was the
   * Speaker) and the target confirms before the role really moves (rule A9).
   */
  transferTo: (device: PlayerDeviceView) => Promise<void>;
  /** The target saying yes: start playing here and confirm it. */
  acceptTransfer: () => Promise<void>;
  /** The target saying not now: hand the needle straight back (rule A9). */
  declineTransfer: () => void;
  clearTransferError: () => void;
  /**
   * Sends a transport command to the session's Speaker (rule B1). Never throws:
   * a refused command becomes `commandError`, which the UI renders as copy.
   * `onUnreachable` runs when the Speaker can't be reached at all, so a caller
   * with a local fallback can still do something useful.
   */
  sendCommand: (
    type: RemoteCommandType,
    payload?: RemoteCommandPayload,
    onUnreachable?: () => void
  ) => Promise<void>;
  forgetDevice: (deviceId: string) => Promise<void>;
  clearError: () => void;
  clearCommandError: () => void;
  /**
   * Opens the Groovy Connect realtime stream (SSE) and returns a disposer.
   * This is what removes the polling delay: another device's transfer, a
   * play/pause, or a device joining shows up in about a second instead of up
   * to ten. See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.
   */
  connectEvents: () => () => void;
  /** Applies one decoded stream event. Exposed for the tests to drive. */
  handleEvent: (payload: ConnectEventPayload) => void;
}

/**
 * True when another device owns the session, so this tab must not produce
 * audio (rule B2). Expressed as a plain selector so components can subscribe to
 * the flip and re-run their effects.
 */
export function selectIsRemote(state: {
  youAreSpeaker: boolean;
  sessionView: PlayerSessionView | null;
}): boolean {
  return !state.youAreSpeaker && !!state.sessionView?.session.speaker;
}

/** Reads the per-tab / per-browser identity off the client. */
async function readIdentity() {
  const { getDeviceInfo, getInstanceId } = await import("../lib/device");
  const { deviceId, deviceName } = getDeviceInfo();
  return { deviceId, deviceName, instanceId: getInstanceId() };
}

/** A command id that stays unique across tabs, with a fallback for old browsers. */
function newCommandId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Is this tab inside a Live Jam?
 *
 * A jam is deliberately a *separate* feature from Connect: it has its own
 * service, its own channel and its own host (rule B9). The jam's state lives in
 * the client, so this is the one place Connect asks about it — and every path
 * that would move playback or take the Speaker role asks here first, rather
 * than trusting a server-side flag that can never see a jam.
 */
async function isInJam(): Promise<boolean> {
  const { useJamStore } = await import("./jam.store");
  return !!useJamStore.getState().activeRoom;
}

/* ── The Remote's local needle and mirrored view ─────────────────────────────
 * A Remote plays no audio, so it has no audio element to ask for the time. It
 * interpolates the session's needle from the server-stamped anchor instead, and
 * mirrors the session's track into `player.store` so the existing player UI
 * works unchanged on a device that has never played anything (rules B2 / R6).
 * ─────────────────────────────────────────────────────────────────────────── */

let remoteTicker: ReturnType<typeof setInterval> | null = null;
/** Server clock minus this browser's clock, from the last server-stamped frame. */
let serverClockOffsetMs = 0;

/**
 * Learns the difference between the server's clock and this browser's from a
 * stamped frame, so a Remote's interpolated needle isn't shifted by a wrong
 * local clock. Only the *offset* is stored; the anchor always stays the
 * server's (design doc principle 1).
 */
function noteServerTime(serverTime: number | undefined): void {
  if (typeof serverTime !== "number" || !Number.isFinite(serverTime)) return;
  serverClockOffsetMs = serverTime - Date.now();
}

/** The session's needle right now, from the server anchor plus local elapsed time. */
function sessionLivePositionMs(now: number): number {
  const view = useConnectStore.getState().sessionView;
  if (!view) return 0;
  const playback = view.session.playback;
  if (!playback.isPlaying) return playback.positionMs;

  // Only *elapsed* time comes from this browser, and it is corrected by the
  // offset learned from a stamped frame — the anchor itself is the server's
  // (design doc principle 1).
  const elapsed = now + serverClockOffsetMs - playback.positionUpdatedAt;
  const live = playback.positionMs + Math.max(0, elapsed);
  return playback.durationMs > 0 ? Math.min(live, playback.durationMs) : live;
}

function tickRemoteClock(): void {
  const state = useConnectStore.getState();
  if (!selectIsRemote(state)) return;

  const ms = sessionLivePositionMs(Date.now());
  state.setLivePositionMs(ms);
  // The Remote's clock is a local interpolation and is deliberately never
  // saved back, so a Remote can't push a stale needle into the session (B8).
  usePlayerStore.setState({ currentTime: ms / 1000 });
}

/** Runs the 1s needle ticker only while this tab is a Remote. */
function syncRemoteClock(): void {
  const state = useConnectStore.getState();
  const shouldTick =
    selectIsRemote(state) && !!state.sessionView?.session.playback.isPlaying;

  if (shouldTick) {
    if (!remoteTicker) remoteTicker = setInterval(tickRemoteClock, 1000);
    tickRemoteClock();
    return;
  }

  if (remoteTicker) {
    clearInterval(remoteTicker);
    remoteTicker = null;
  }
}

function mirrorSessionForRemote(): void {
  const state = useConnectStore.getState();
  const view = state.sessionView;
  if (!view || !selectIsRemote(state)) return;

  const { playback, context } = view.session;
  const track = playback.track ?? null;

  usePlayerStore.setState((prev) => ({
    currentTrack: track ?? prev.currentTrack,
    duration:
      playback.durationMs > 0
        ? playback.durationMs / 1000
        : track?.durationSeconds ?? prev.duration,
    playbackStatus: playback.isPlaying ? "playing" : "paused",
    isShuffle: context.shuffle,
    repeatMode: context.repeat,
    speakerYieldedBy: null,
  }));
}

/** Every path that learns new session state goes through here. */
function afterSessionChange(): void {
  mirrorSessionForRemote();
  syncRemoteClock();
}

/**
 * Re-anchors the needle locally the instant a SEEK is accepted, so the scrubber
 * doesn't snap back to the old position while the round trip and the broadcast
 * land. The server's `SESSION_STATE` is authoritative and replaces it within a
 * second; this only removes the visible rubber-band.
 */
function previewSeek(positionMs: number): void {
  const view = useConnectStore.getState().sessionView;
  if (!view) return;
  const anchoredAt = Date.now() + serverClockOffsetMs;
  useConnectStore.setState({
    livePositionMs: positionMs,
    sessionView: {
      ...view,
      livePositionMs: positionMs,
      session: {
        ...view.session,
        playback: {
          ...view.session.playback,
          positionMs,
          positionUpdatedAt: anchoredAt,
        },
      },
    },
  });
}

/* ── The push-transfer handshake (design doc §6.5) ───────────────────────────
 * "Play on {device}" needs a handshake because the target has to consent before
 * it starts making sound. These three helpers keep that handshake on one path:
 * the offer, the local claim that the audio engine needs in order to load, and
 * the deadline that stops a prompt (or a spinner) from waiting forever.
 * ─────────────────────────────────────────────────────────────────────────── */

/** The ticket's own lifetime; after this the server has reverted the move. */
const TRANSFER_PENDING_TIMEOUT_MS = 32_000;

let incomingTransferTimer: ReturnType<typeof setTimeout> | null = null;
let transferPendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearIncomingTransferTimer(): void {
  if (incomingTransferTimer) {
    clearTimeout(incomingTransferTimer);
    incomingTransferTimer = null;
  }
}

function clearTransferPendingTimer(): void {
  if (transferPendingTimer) {
    clearTimeout(transferPendingTimer);
    transferPendingTimer = null;
  }
}

/**
 * Whether the browser will let this document start audio without a tap.
 *
 * The server's `unlocked` flag *predicts* that, but the browser is the
 * authority: user activation is per **document**, so a tab that has played
 * before still needs a tap after a reload, even though `unlocked` survived in
 * `sessionStorage`. Asking the browser directly is what makes rule A10's
 * promise ("an unlocked target plays immediately") literally true. Where the
 * browser cannot say, the server's flag is the best available answer.
 */
function userActivationAllowsPlay(): boolean {
  const activation = (
    navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }
  ).userActivation;
  if (!activation || typeof activation.hasBeenActive !== "boolean") return true;
  return activation.hasBeenActive;
}

/** Turns a refusal into something the user can act on (rule A6). */
function transferFailureCopy(
  reason: PlayerTransferFailure | undefined,
  deviceName: string
): string {
  switch (reason) {
    case "TARGET_OFFLINE":
    case "NO_DEVICE":
      return `${deviceName} isn't available right now.`;
    case "NO_SESSION":
    case "NO_TRACK":
      return "There's nothing playing on this account yet.";
    case "STALE_STATE":
      return `${deviceName} changed while you were tapping. Try again.`;
    default:
      return `Couldn't move playback to ${deviceName}.`;
  }
}

/**
 * Makes this tab the Speaker *locally*, before the server's broadcast lands.
 *
 * The audio engine asks "am I a Remote?" synchronously, and a Remote is never
 * allowed to resolve a stream (rule B2) — so the claim has to happen here or the
 * target would adopt the track and simply stay silent.
 */
function claimSpeakerLocally(
  speaker: {
    deviceId: string;
    instanceId: string;
    deviceName: string;
    confirmed: boolean;
    lastSeenAt: number;
  },
  positionMs: number,
  isPlaying: boolean
): void {
  const view = useConnectStore.getState().sessionView;
  const anchoredAt = Date.now() + serverClockOffsetMs;

  useConnectStore.setState({
    youAreSpeaker: speaker.confirmed,
    livePositionMs: positionMs,
    sessionView: view
      ? {
          ...view,
          youAreSpeaker: speaker.confirmed,
          livePositionMs: positionMs,
          serverTime: anchoredAt,
          session: {
            ...view.session,
            speaker,
            playback: {
              ...view.session.playback,
              positionMs,
              positionUpdatedAt: anchoredAt,
              isPlaying,
            },
          },
        }
      : view,
  });
}

export const useConnectStore = create<ConnectState>((set, get) => ({
  devices: [],
  sessionView: null,
  youAreSpeaker: false,
  livePositionMs: 0,
  commandError: null,
  incomingTransfer: null,
  transferPending: null,
  transferError: null,
  myDeviceId: null,
  myDeviceName: null,
  myInstanceId: null,
  isRefreshing: false,
  isPlayHerePending: false,
  error: null,
  sseConnected: false,

  setDevices: (devices) => set({ devices }),

  setYouAreSpeaker: (isSpeaker) => {
    set({ youAreSpeaker: isSpeaker });
    afterSessionChange();
  },

  setLivePositionMs: (ms) => set({ livePositionMs: ms }),

  applySessionView: (view, devices) => {
    set({
      sessionView: view,
      devices: devices ?? view?.devices ?? get().devices,
      youAreSpeaker: view?.youAreSpeaker ?? false,
      livePositionMs: view?.livePositionMs ?? 0,
    });
    afterSessionChange();
  },

  register: async () => {
    const { getDeviceInfo, getInstanceId, isAudioUnlocked } = await import(
      "../lib/device"
    );
    const { deviceId, deviceName } = getDeviceInfo();
    const instanceId = getInstanceId();

    set({ myDeviceId: deviceId, myDeviceName: deviceName, myInstanceId: instanceId });

    const res = await playerApi.registerDevice({
      deviceId,
      deviceName,
      instanceId,
      unlocked: isAudioUnlocked(),
    });
    if (res) get().applySessionView(res.session ?? null, res.devices);
  },

  refresh: async () => {
    const { deviceId, deviceName, instanceId } = await readIdentity();
    set({
      isRefreshing: true,
      myDeviceId: deviceId,
      myDeviceName: deviceName,
      myInstanceId: instanceId,
    });
    try {
      const res = await playerApi.getSession({ deviceId, instanceId });
      get().applySessionView(res?.session ?? null, res?.devices);
    } catch {
      set({ error: "Couldn't load your devices. Check your connection." });
    } finally {
      set({ isRefreshing: false });
    }
  },

  playHere: async (options) => {
    const { getDeviceInfo, getInstanceId, isAudioUnlocked, markAudioUnlocked } =
      await import("../lib/device");
    const { deviceId, deviceName } = getDeviceInfo();
    const instanceId = getInstanceId();

    set({ isPlayHerePending: true, error: null });
    try {
      // Connect is suspended inside a Live Jam: the jam host is the Speaker
      // there (rule B9), and a transfer would fight the jam sync.
      if (await isInJam()) {
        set({ error: "You're in a Live Jam. Leave it to play on this device." });
        return;
      }

      // 1. Freshest picture of the session (Speaker + live needle) and the queue.
      const [sessionRes, stateRes] = await Promise.all([
        playerApi.getSession({ deviceId, instanceId }).catch(() => null),
        playerApi.getPlayerState().catch(() => null),
      ]);
      const view = sessionRes?.session ?? get().sessionView;
      const snapshot = stateRes?.state ?? null;

      // A tapped song wins over whatever the session was playing — that is what
      // makes "tap a song on a Remote" mean "play that song here" (rule B7).
      const track = (options?.track ??
        view?.session.playback.track ??
        snapshot?.currentTrack ??
        null) as PlayerTrack | null;

      if (!track) {
        set({ error: "There's nothing playing on this account yet." });
        return;
      }

      // 2. Resume at the *live* position, never a stale snapshot (rule A3) —
      //    but a freshly tapped song starts from the top.
      const liveMs = view?.livePositionMs ?? 0;
      const startSeconds = options?.track
        ? 0
        : liveMs > 0
        ? liveMs / 1000
        : snapshot?.playbackPosition ?? 0;

      // 3. Adopt the account's queue and context so NEXT / PREVIOUS make sense.
      const queue = options?.contextQueue ?? snapshot?.contextQueue ?? [];
      usePlayerStore.setState({
        currentTrack: track,
        currentTime: startSeconds,
        duration: track.durationSeconds || 0,
        userQueue: snapshot?.userQueue ?? [],
        contextQueue: queue,
        originalContextQueue: queue,
        contextIndex: options?.contextIndex ?? snapshot?.contextIndex ?? 0,
        contextUri: options?.contextUri ?? snapshot?.contextUri ?? null,
        contextTitle: options?.contextTitle ?? snapshot?.contextTitle ?? null,
        playbackStatus: "playing",
        supersededByDevice: null,
        speakerYieldedBy: null,
      });

      // 4. Claim the Speaker role. Tapping "Play here" *is* the explicit user
      //    action A2 requires, so this is an authorised takeover.
      try {
        await playerApi.sendHeartbeat({
          deviceId,
          deviceName,
          instanceId,
          unlocked: isAudioUnlocked(),
          songId: track.id,
          trackTitle: track.title,
          artistName: track.artistName,
          coverImageUrl: track.coverImageUrl ?? null,
          progressMs: Math.floor(startSeconds * 1000),
          durationMs: (track.durationSeconds || 0) * 1000,
          isPaused: false,
          takeover: true,
        });
        markAudioUnlocked();
      } catch {
        // The local device still plays even if the claim call failed.
      }

      set({
        youAreSpeaker: true,
        myDeviceId: deviceId,
        myDeviceName: deviceName,
        myInstanceId: instanceId,
      });
      usePlayerStore.getState().saveSnapshot();

      // This tab is the Speaker now, so the Remote clock and mirrored view must
      // stop before they fight the real audio element.
      afterSessionChange();

      // 5. Land the user on the player, not in the panel.
      usePlayerStore.getState().setDevicesOpen(false);
      usePlayerStore.getState().setDesktopRightSidebarView("none");

      void get().refresh();
    } catch {
      set({ error: "Couldn't move playback to this device." });
    } finally {
      set({ isPlayHerePending: false });
    }
  },

  transferTo: async (device) => {
    const { deviceId, instanceId } = await readIdentity();

    // Pushing into a jam, or pulling a jam's audio away, would fight the jam's
    // own sync — the same reason "Play here" is refused (rule B9).
    if (await isInJam()) {
      set({ transferError: "You're in a Live Jam. Leave it to move playback." });
      return;
    }

    // Rule A6: an offline target is refused with copy, never queued silently.
    if (!device.online) {
      set({ transferError: `${device.deviceName} isn't available right now.` });
      return;
    }
    // Pushing onto the room that already owns playback changes nothing.
    if (device.isSpeaker) return;

    clearTransferPendingTimer();
    set({
      transferPending: { deviceId: device.deviceId, deviceName: device.deviceName },
      transferError: null,
    });

    // The button must not spin forever: the ticket's own lifetime is the
    // deadline, and past it the server has already handed playback back.
    transferPendingTimer = setTimeout(() => {
      transferPendingTimer = null;
      if (useConnectStore.getState().transferPending) {
        set({
          transferPending: null,
          transferError: `${device.deviceName} didn't answer.`,
        });
      }
    }, TRANSFER_PENDING_TIMEOUT_MS);

    try {
      const res = await playerApi.requestSessionTransfer({
        deviceId,
        instanceId,
        transferId: newCommandId(),
        targetDeviceId: device.deviceId,
        // Rule A8 + A2: only move what the user was actually looking at.
        expectedRevision: get().sessionView?.session.revision,
      });

      set({
        myDeviceId: deviceId,
        myInstanceId: instanceId,
      });

      if (!res?.ok) {
        clearTransferPendingTimer();
        set({
          transferPending: null,
          transferError: transferFailureCopy(res?.reason, device.deviceName),
        });
        void get().refresh();
        return;
      }

      if (res.duplicate) {
        // Nothing to wait for: either a double tap or the device already owns it.
        clearTransferPendingTimer();
        set({ transferPending: null });
      }
      // Otherwise we wait for TRANSFER_RESULT (or the timeout above).
    } catch {
      clearTransferPendingTimer();
      set({
        transferPending: null,
        transferError: `Couldn't move playback to ${device.deviceName}.`,
      });
    }
  },

  acceptTransfer: async () => {
    const offer = get().incomingTransfer;
    if (!offer) return;

    // A jam owns this device's audio, so it cannot take the Speaker role
    // (rule B9). Answering "not now" hands the needle straight back to the
    // previous Speaker instead of making it wait out the ticket.
    if (await isInJam()) {
      set({ transferError: "You're in a Live Jam. Leave it to play here." });
      get().declineTransfer();
      return;
    }

    clearIncomingTransferTimer();
    set({ incomingTransfer: null });

    const { deviceId, deviceName, instanceId } = await readIdentity();

    // Take the role locally first, or the engine will refuse to load a stream
    // (a Remote plays no audio — rule B2). The server's broadcast follows.
    claimSpeakerLocally(
      { deviceId, instanceId, deviceName, confirmed: true, lastSeenAt: Date.now() },
      offer.positionMs,
      offer.isPlaying
    );
    set({
      youAreSpeaker: true,
      myDeviceId: deviceId,
      myDeviceName: deviceName,
      myInstanceId: instanceId,
    });

    // Adopt the account's queue as well, so NEXT / PREVIOUS stay meaningful.
    const snapshotRes = await playerApi.getPlayerState().catch(() => null);
    const snapshot = snapshotRes?.state ?? null;
    const track = offer.track ?? null;
    if (track) {
      const queue = snapshot?.contextQueue ?? [];
      usePlayerStore.setState({
        currentTrack: track,
        currentTime: offer.positionMs / 1000,
        duration: track.durationSeconds || 0,
        userQueue: snapshot?.userQueue ?? [],
        contextQueue: queue,
        originalContextQueue: queue,
        contextIndex: snapshot?.contextIndex ?? 0,
        contextUri: snapshot?.contextUri ?? null,
        contextTitle: snapshot?.contextTitle ?? null,
        playbackStatus: offer.isPlaying ? "playing" : "paused",
        speakerYieldedBy: null,
        supersededByDevice: null,
      });
    }

    try {
      const res = await playerApi.confirmSessionTransfer({
        deviceId,
        instanceId,
        transferId: offer.transferId,
        ok: true,
        // Where this device *actually* started anchors the shared needle.
        positionMs: Math.round(offer.positionMs),
        isPlaying: offer.isPlaying,
      });

      if (!res?.ok) {
        // The handshake had already expired or been superseded. Stand down
        // rather than playing onto a session that now belongs to someone else.
        set({
          youAreSpeaker: false,
          transferError: "That transfer expired. Try again.",
        });
        usePlayerStore.getState().yieldSpeakerTo(res?.speaker ?? null);
      }

      void get().refresh();
    } catch {
      // The start already happened and the ticket's timeout will settle the
      // session either way, so a network blip is not worth silencing the user.
      set({ transferError: "Couldn't confirm the move with the other device." });
      void get().refresh();
    }
  },

  declineTransfer: () => {
    const offer = get().incomingTransfer;
    if (!offer) return;

    clearIncomingTransferTimer();
    set({ incomingTransfer: null });

    const { myDeviceId, myInstanceId } = get();
    if (!myDeviceId || !myInstanceId) return;

    // Saying "not now" is worth a round trip: it hands the needle back in
    // milliseconds instead of leaving the user waiting out the 30s ticket.
    void playerApi
      .confirmSessionTransfer({
        deviceId: myDeviceId,
        instanceId: myInstanceId,
        transferId: offer.transferId,
        ok: false,
      })
      .catch(() => {});
  },

  clearTransferError: () => set({ transferError: null }),

  sendCommand: async (type, payload, onUnreachable) => {
    const { myDeviceId, myInstanceId, sessionView } = get();
    if (!myDeviceId || !myInstanceId) return;

    try {
      const res = await playerApi.sendSessionCommand({
        deviceId: myDeviceId,
        instanceId: myInstanceId,
        commandId: newCommandId(),
        type,
        payload,
      });

      if (res?.ok) {
        set({ commandError: null });
        // A seek is the one hop the user can see, so re-anchor it right away.
        if (type === "SEEK" && typeof payload?.positionMs === "number") {
          previewSeek(payload.positionMs);
        }
        return;
      }

      // Rule B3: fail fast and say something the user can act on, rather than
      // letting the button look broken.
      const speakerName =
        res?.speaker?.deviceName ??
        sessionView?.session.speaker?.deviceName ??
        "that device";

      if (res?.reason === "SPEAKER_OFFLINE" || res?.reason === "NO_SPEAKER") {
        // Nothing can reach the Speaker, so a caller with a local fallback (a
        // song tap) takes over rather than leaving a dead tap behind.
        if (onUnreachable) {
          onUnreachable();
          return;
        }
        set({ commandError: `Can't reach ${speakerName}.` });
        // The session the server still believes in is stale; refresh so the
        // panel can offer "Play here instead" (rule B6).
        void get().refresh();
      }
    } catch {
      set({ commandError: "That didn't reach the other device." });
    }
  },

  forgetDevice: async (deviceId) => {
    try {
      await playerApi.forgetDevice(deviceId);
      await get().refresh();
    } catch {
      set({ error: "Couldn't forget that device." });
    }
  },

  clearError: () => set({ error: null }),

  clearCommandError: () => set({ commandError: null }),

  handleEvent: (payload) => {
    switch (payload.type) {
      case "hello": {
        // A full resync. This is why a reconnect needs no gap tracking — the
        // server simply restates everything it knows.
        noteServerTime(payload.serverTime);
        get().applySessionView(payload.session ?? null, payload.devices);
        return;
      }

      case "SESSION_STATE": {
        const { myDeviceId, myInstanceId, devices } = get();
        const session: PlayerSession = payload.session;
        const speaker = session?.speaker ?? null;
        // An *unconfirmed* Speaker is still just a handshake promise: only a
        // confirmed one actually owns the room (rule A9).
        const youAreSpeaker =
          !!speaker &&
          speaker.confirmed &&
          speaker.deviceId === myDeviceId &&
          speaker.instanceId === myInstanceId;

        // If the handshake moved on without this tab — superseded, reverted, or
        // answered elsewhere — the offer on screen is no longer answerable.
        const offer = get().incomingTransfer;
        if (offer) {
          const stillAwaitingAnswer =
            !!speaker &&
            !speaker.confirmed &&
            speaker.deviceId === myDeviceId &&
            speaker.instanceId === myInstanceId;
          if (!stillAwaitingAnswer) {
            clearIncomingTransferTimer();
            set({ incomingTransfer: null });
          }
        }

        noteServerTime(payload.serverTime);

        // This event only asserts the *Speaker's* liveness; every other row
        // keeps whatever we were last told rather than being guessed at.
        const nextDevices = devices.map((d) =>
          speaker && d.deviceId === speaker.deviceId
            ? { ...d, isSpeaker: true, online: payload.speakerOnline }
            : { ...d, isSpeaker: false }
        );

        set({
          youAreSpeaker,
          devices: nextDevices,
          livePositionMs: payload.livePositionMs,
          sessionView: {
            session,
            livePositionMs: payload.livePositionMs,
            speakerOnline: payload.speakerOnline,
            devices: nextDevices,
            yourInstanceId: myInstanceId,
            youAreSpeaker,
            serverTime: payload.serverTime,
          },
        });

        afterSessionChange();

        // A session can land before we have ever listed devices (fresh tab).
        if (devices.length === 0) {
          playerApi
            .listDevices()
            .then((res) => {
              if (res?.devices?.length) get().setDevices(res.devices);
            })
            .catch(() => {});
        }
        return;
      }

      case "POSITION": {
        const current = get().sessionView;
        if (!current) return;
        set({
          livePositionMs: payload.positionMs,
          sessionView: {
            ...current,
            livePositionMs: payload.positionMs,
            session: {
              ...current.session,
              revision: payload.revision,
              playback: {
                ...current.session.playback,
                positionMs: payload.positionMs,
                positionUpdatedAt: payload.positionUpdatedAt,
                isPlaying: payload.isPlaying,
              },
            },
          },
        });
        afterSessionChange();
        return;
      }

      case "COMMAND": {
        const { myDeviceId, myInstanceId } = get();
        // One channel serves the whole account, so the event names the single
        // device that must act. Only the Speaker runs the command (doc §6.4).
        if (
          payload.deviceId !== myDeviceId ||
          payload.instanceId !== myInstanceId
        ) {
          return;
        }
        usePlayerStore
          .getState()
          .applySessionCommand(payload.command, payload.payload);
        return;
      }

      case "SPEAKER_LOST": {
        const { myDeviceId, myInstanceId } = get();
        // One channel serves the whole account, so the event names the device
        // it concerns. Only that device stands down — the others already heard
        // the accompanying SESSION_STATE.
        if (
          payload.deviceId !== myDeviceId ||
          payload.instanceId !== myInstanceId
        ) {
          return;
        }
        set({ youAreSpeaker: false });
        usePlayerStore.getState().yieldSpeakerTo(payload.newSpeaker ?? null);
        // Now a Remote: adopt the new Speaker's view so this tab isn't silent
        // *and* blank. The local audio is faded out by the engine's own path.
        afterSessionChange();
        return;
      }

      case "DEVICES_CHANGED": {
        get().setDevices(payload.devices ?? []);
        return;
      }

      case "TRANSFER_OFFER": {
        const { myDeviceId, myInstanceId } = get();
        // One channel serves the whole account, so the frame names the single
        // tab that has to answer. Everyone else ignores it.
        if (
          payload.deviceId !== myDeviceId ||
          payload.instanceId !== myInstanceId
        ) {
          return;
        }

        const offer: IncomingTransfer = {
          transferId: payload.transferId,
          track: payload.track ?? null,
          positionMs: payload.positionMs,
          positionUpdatedAt: payload.positionUpdatedAt,
          isPlaying: payload.isPlaying,
          expiresAt: payload.expiresAt,
          needsGesture: payload.needsGesture,
          fromDeviceName: payload.fromDeviceName,
        };
        set({ incomingTransfer: offer, transferPending: null });

        // Rule A10: a tab that has produced audio before may start straight
        // away. A tab that has never been unlocked must ask for the tap that
        // browsers require before any sound may play. The browser gets the last
        // word on the first case, because user activation is per document.
        if (!offer.needsGesture && userActivationAllowsPlay()) {
          void get().acceptTransfer();
          return;
        }

        clearIncomingTransferTimer();
        incomingTransferTimer = setTimeout(() => {
          incomingTransferTimer = null;
          if (useConnectStore.getState().incomingTransfer?.transferId === offer.transferId) {
            get().declineTransfer();
          }
        }, Math.max(0, offer.expiresAt - Date.now()));
        return;
      }

      case "SPEAKER_GRANTED": {
        const { myDeviceId, myInstanceId, myDeviceName } = get();
        if (
          payload.deviceId !== myDeviceId ||
          payload.instanceId !== myInstanceId
        ) {
          return;
        }

        // The push failed and the needle came back to this tab: resume where it
        // was frozen. This is an explicit instruction, not a state to reconcile,
        // because the device was faded out and its stream released a moment ago.
        clearIncomingTransferTimer();
        claimSpeakerLocally(
          {
            deviceId: payload.deviceId,
            instanceId: payload.instanceId,
            deviceName: myDeviceName ?? "",
            confirmed: true,
            lastSeenAt: Date.now(),
          },
          payload.positionMs,
          payload.isPlaying
        );

        const local = usePlayerStore.getState();
        usePlayerStore.setState({
          currentTrack: payload.track ?? local.currentTrack,
          currentTime: payload.positionMs / 1000,
          duration: payload.track?.durationSeconds || local.duration,
          playbackStatus: payload.isPlaying ? "playing" : "paused",
          speakerYieldedBy: null,
          supersededByDevice: null,
        });
        afterSessionChange();
        return;
      }

      case "TRANSFER_RESULT": {
        const { myDeviceId, myInstanceId } = get();
        if (
          payload.deviceId !== myDeviceId ||
          payload.instanceId !== myInstanceId
        ) {
          return;
        }

        clearTransferPendingTimer();
        if (payload.ok) {
          set({ transferPending: null });
          return;
        }

        const targetName = payload.target?.deviceName ?? "That device";
        set({
          transferPending: null,
          transferError:
            payload.reason === "DECLINED"
              ? `${targetName} didn't take the playback.`
              : payload.reason === "OFFLINE"
                ? `${targetName} went offline.`
                : `Couldn't move playback to ${targetName}.`,
        });
        return;
      }
    }
  },

  connectEvents: () => {
    if (!useAuthStore.getState().isAuthenticated) return () => {};

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const open = async () => {
      if (disposed) return;

      const { getDeviceInfo, getInstanceId } = await import("../lib/device");
      const { deviceId } = getDeviceInfo();
      const instanceId = getInstanceId();
      if (disposed) return;

      const url = playerApi.sessionEventsUrl(
        deviceId,
        instanceId,
        useAuthStore.getState().accessToken
      );

      try {
        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onopen = () => set({ sseConnected: true });

        eventSource.onmessage = (event) => {
          try {
            get().handleEvent(JSON.parse(event.data) as ConnectEventPayload);
          } catch {
            // A malformed frame is not worth tearing the stream down for.
          }
        };

        eventSource.onerror = () => {
          set({ sseConnected: false });
          eventSource?.close();
          eventSource = null;
          // A flat 5s backoff, matching the notifications stream. It also sits
          // comfortably inside the server's 10s stand-down grace, so a blip
          // never costs this device the Speaker role.
          if (!disposed) reconnectTimeout = setTimeout(() => void open(), 5000);
        };
      } catch (err) {
        console.warn("[Connect SSE] Connection init error:", err);
        if (!disposed) reconnectTimeout = setTimeout(() => void open(), 5000);
      }
    };

    void open();

    return () => {
      disposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      eventSource?.close();
      eventSource = null;
      set({ sseConnected: false });
    };
  },
}));

/**
 * Hand `player.store` the two questions it cannot answer on its own. This is
 * the only coupling between the two stores, and it points one way on purpose:
 * `player.store` never imports `connect.store`.
 */
setConnectBridge({
  isRemote: () => selectIsRemote(useConnectStore.getState()),
  send: (type, payload, onUnreachable) => {
    void useConnectStore.getState().sendCommand(type, payload, onUnreachable);
  },
});
