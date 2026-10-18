import { create } from "zustand";
import type {
  PlayerTrack,
  PlaybackStatus,
  RepeatMode,
  PlayerStateSnapshot,
} from "../types/player";
import type { SongCredit } from "../types/catalog";
import { playerApi } from "../lib/player.api";
import { routeToSpeaker } from "../lib/connect-bridge";
import type {
  RemoteCommandPayload,
  RemoteCommandType,
} from "../lib/connect-bridge";
import { useAuthStore } from "./auth.store";

// Helper: Fisher-Yates array shuffle
function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const STORAGE_KEY = "groovy:player:snapshot";
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Guards against a double tap firing two pulls in a row while the first
 * "play here" is still claiming the Speaker role (rules A8 / B7).
 */
let remotePlayInFlight = false;

/**
 * The fallback for a song tap on a Remote when the Speaker cannot be reached at
 * all: claim the Speaker role with the tapped song and let the normal local path
 * take over. This is what every tap did before Groovy Connect.
 */
async function playHereWithTrack(
  track: PlayerTrack,
  contextQueue: PlayerTrack[] | undefined,
  contextIndex: number,
  contextUri: string | undefined,
  contextTitle: string | undefined
): Promise<void> {
  if (remotePlayInFlight) return;
  remotePlayInFlight = true;
  try {
    const { useConnectStore } = await import("./connect.store");
    await useConnectStore.getState().playHere({
      track,
      contextQueue,
      contextIndex,
      contextUri,
      contextTitle,
    });
  } finally {
    remotePlayInFlight = false;
  }
}

/**
 * Rule B7, Spotify semantics: on a Remote, picking a song plays it **on the
 * session's Speaker**, not here. The tap becomes a command carrying the track
 * and the context it came from, so the Speaker adopts both and NEXT / PREVIOUS
 * stay meaningful there.
 *
 * `pullHere` is the fallback for the one case that cannot be a command — a
 * Speaker that cannot be reached — so a tap always ends in sound rather than a
 * dead button. Returns true when the caller must do nothing else locally.
 */
function playSongAsRemote(
  payload: RemoteCommandPayload,
  pullHere: () => void
): boolean {
  return routeToSpeaker("PLAY_TRACK", payload, pullHere);
}

interface PlayerState {
  // Current playback
  currentTrack: PlayerTrack | null;
  playbackStatus: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  streamQuality: "lossless" | "standard";
  streamFormat: "hls" | "progressive";
  errorMessage: string | null;

  // Two-tier Queue
  userQueue: PlayerTrack[]; // Priority: Explicit "Play Next" and "Add to Queue"
  contextQueue: PlayerTrack[]; // Background: Album / Playlist context tracks
  originalContextQueue: PlayerTrack[]; // Retained for un-shuffling
  contextIndex: number; // Pointer in contextQueue
  contextUri: string | null; // e.g. "album:uuid" or "playlist:uuid"
  contextTitle: string | null; // e.g. "Kind of Blue"

  // UI state
  isQueueOpen: boolean;
  /** Mobile Groovy Connect bottom sheet (devices panel). */
  isDevicesOpen: boolean;
  isNowPlayingExpanded: boolean;
  desktopRightSidebarView: "none" | "now-playing" | "queue" | "devices";
  isInitialized: boolean;

  // Multi-Device Takeover (Option A)
  supersededByDevice: { deviceId: string; deviceName: string } | null;
  takeoverPlayback: () => Promise<void>;
  dismissSuperseded: () => void;

  /**
   * Groovy Connect: set the moment another device takes the Speaker role. The
   * audio engine watches this and fades out — one place owns "stand down",
   * whether the news arrived over SSE, a heartbeat or a rejected needle tick
   * (design doc rule C1).
   */
  speakerYieldedBy: {
    deviceId: string;
    deviceName: string;
    at: number;
  } | null;
  yieldSpeakerTo: (device: { deviceId: string; deviceName: string } | null) => void;

  // Actions
  playTrack: (
    track: PlayerTrack,
    contextQueue?: PlayerTrack[],
    contextIndex?: number,
    contextUri?: string,
    contextTitle?: string
  ) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (timeSeconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  /** Idempotent setters, so a relayed command can't flip the wrong way. */
  setShuffle: (value: boolean) => void;
  setRepeat: (mode: RepeatMode) => void;
  next: () => void;
  previous: () => void;

  /**
   * Groovy Connect: runs a command that arrived from a Remote. Only ever called
   * on the Speaker, so it dispatches straight into the local actions below
   * (design doc §6.4).
   */
  applySessionCommand: (
    type: RemoteCommandType,
    payload?: RemoteCommandPayload | null
  ) => void;

  // Queue actions
  playNext: (track: PlayerTrack) => void;
  addToQueue: (track: PlayerTrack) => void;
  playUserQueueTrack: (index: number) => void;
  reorderUserQueue: (fromIndex: number, toIndex: number) => void;
  removeFromUserQueue: (index: number) => void;
  clearUserQueue: () => void;
  jumpToContextTrack: (index: number) => void;
  stopPlayback: () => void;

  // UI actions
  setQueueOpen: (isOpen: boolean) => void;
  toggleQueueDrawer: () => void;
  setDevicesOpen: (isOpen: boolean) => void;
  toggleDevicesDrawer: () => void;
  setNowPlayingExpanded: (isOpen: boolean) => void;
  toggleNowPlayingExpanded: () => void;
  setDesktopRightSidebarView: (
    view: "none" | "now-playing" | "queue" | "devices"
  ) => void;
  toggleDesktopRightSidebar: (view: "now-playing" | "queue" | "devices") => void;
  updateTrackCredits: (songId: string, credits: SongCredit[]) => void;

  // Internal engine setters
  _setStatus: (status: PlaybackStatus) => void;
  _setCurrentTime: (time: number) => void;
  _setDuration: (duration: number) => void;
  _setError: (err: string | null) => void;
  _setStreamQuality: (quality: "lossless" | "standard") => void;
  _setStreamFormat: (format: "hls" | "progressive") => void;
  syncJamPlayback: (track: PlayerTrack, positionSeconds: number, status: PlaybackStatus) => void;

  // Persistence & Sync
  initializeSync: (force?: boolean) => Promise<void>;
  saveSnapshot: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  playbackStatus: "idle",
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  isShuffle: false,
  repeatMode: "off",
  streamQuality: "standard",
  streamFormat: "hls",
  errorMessage: null,

  userQueue: [],
  contextQueue: [],
  originalContextQueue: [],
  contextIndex: 0,
  contextUri: null,
  contextTitle: null,

  isQueueOpen: false,
  isDevicesOpen: false,
  isNowPlayingExpanded: false,
  desktopRightSidebarView: "none",
  isInitialized: false,
  supersededByDevice: null,
  speakerYieldedBy: null,

  /**
   * Resume playback on this device. Delegates to Groovy Connect's `playHere`
   * so there is exactly one transfer path (see stores/connect.store.ts).
   */
  takeoverPlayback: async () => {
    const { useConnectStore } = await import("./connect.store");
    await useConnectStore.getState().playHere();
  },

  dismissSuperseded: () => set({ supersededByDevice: null }),

  yieldSpeakerTo: (device) =>
    set({
      speakerYieldedBy: {
        deviceId: device?.deviceId ?? "",
        deviceName: device?.deviceName ?? "",
        at: Date.now(),
      },
    }),

  playTrack: (track, contextQueue, contextIndex = 0, contextUri, contextTitle) => {
    if (track.isStreamable === false) {
      return;
    }

    // Rule B7 (Spotify semantics): on a Remote, tapping a song plays it on the
    // session's Speaker, with the context it was tapped inside. Only a Speaker
    // that cannot be reached falls back to pulling playback here.
    if (
      playSongAsRemote(
        { track, contextQueue, contextIndex, contextUri, contextTitle },
        () =>
          void playHereWithTrack(
            track,
            contextQueue,
            contextIndex,
            contextUri,
            contextTitle
          )
      )
    ) {
      return;
    }

    const isShuffle = get().isShuffle;

    let nextContext = contextQueue ? [...contextQueue] : get().contextQueue;
    const originalContext = contextQueue ? [...contextQueue] : get().originalContextQueue;
    let nextIndex = contextIndex;

    if (contextQueue && isShuffle) {
      // Shuffle upcoming context, keeping the selected track first
      const otherTracks = contextQueue.filter((t) => t.id !== track.id);
      nextContext = [track, ...shuffleArray(otherTracks)];
      nextIndex = 0;
    }

    set({
      currentTrack: track,
      playbackStatus: "loading",
      currentTime: 0,
      duration: track.durationSeconds || 0,
      contextQueue: nextContext,
      originalContextQueue: originalContext,
      contextIndex: nextIndex,
      contextUri: contextUri ?? get().contextUri,
      contextTitle: contextTitle ?? get().contextTitle,
      errorMessage: null,
      supersededByDevice: null,
      speakerYieldedBy: null,
    });

    get().saveSnapshot();

    // Live Jam: Broadcast track change if active host
    import("./jam.store").then(({ useJamStore }) => {
      const { isHost, activeRoom, broadcastTrackChange } = useJamStore.getState();
      if (isHost && activeRoom) {
        broadcastTrackChange(
          {
            id: track.id,
            title: track.title,
            artistId: track.artistId,
            artistName: track.artistName,
            artistSlug: track.artistSlug,
            albumId: track.albumId,
            albumTitle: track.albumTitle,
            albumSlug: track.albumSlug,
            duration: track.durationSeconds || 0,
            artworkUrl: track.coverImageUrl,
            audioUrl: track.audioUrl,
            hlsManifestUrl: track.hlsManifestUrl,
            rawAudioKey: track.rawAudioKey,
          },
          0
        );
      }
    }).catch(() => {});
  },

  togglePlay: () => {
    const { playbackStatus, currentTrack, currentTime } = get();
    if (!currentTrack) return;

    const nextStatus = playbackStatus === "playing" ? "paused" : "playing";

    // Rule B1: on a Remote the button drives the *session*, not this device.
    if (routeToSpeaker(nextStatus === "paused" ? "PAUSE" : "PLAY")) return;

    if (nextStatus === "paused") {
      set({ playbackStatus: "paused" });
    } else {
      set({ playbackStatus: "playing", supersededByDevice: null, speakerYieldedBy: null });
    }
    get().saveSnapshot();

    // Live Jam: Broadcast play/pause if active host
    import("./jam.store").then(({ useJamStore }) => {
      const { isHost, activeRoom, broadcastPlay, broadcastPause } = useJamStore.getState();
      if (isHost && activeRoom) {
        if (nextStatus === "paused") {
          broadcastPause(Math.floor(currentTime * 1000));
        } else {
          broadcastPlay(Math.floor(currentTime * 1000));
        }
      }
    }).catch(() => {});
  },

  pause: () => {
    if (routeToSpeaker("PAUSE")) return;
    const { currentTime } = get();
    set({ playbackStatus: "paused" });
    get().saveSnapshot();

    // Live Jam: Broadcast pause if active host
    import("./jam.store").then(({ useJamStore }) => {
      const { isHost, activeRoom, broadcastPause } = useJamStore.getState();
      if (isHost && activeRoom) {
        broadcastPause(Math.floor(currentTime * 1000));
      }
    }).catch(() => {});
  },

  resume: () => {
    if (routeToSpeaker("PLAY")) return;
    const { currentTrack, currentTime } = get();
    if (currentTrack) {
      set({ playbackStatus: "playing", supersededByDevice: null, speakerYieldedBy: null });
      get().saveSnapshot();

      // Live Jam: Broadcast play if active host
      import("./jam.store").then(({ useJamStore }) => {
        const { isHost, activeRoom, broadcastPlay } = useJamStore.getState();
        if (isHost && activeRoom) {
          broadcastPlay(Math.floor(currentTime * 1000));
        }
      }).catch(() => {});
    }
  },

  seek: (timeSeconds) => {
    const targetSeconds = Math.max(0, timeSeconds);

    // Rule B1: a Remote steers the Speaker's needle.
    if (routeToSpeaker("SEEK", { positionMs: Math.round(targetSeconds * 1000) })) {
      return;
    }

    set({ currentTime: targetSeconds });
    get().saveSnapshot();

    // Live Jam: Broadcast seek if active host
    import("./jam.store").then(({ useJamStore }) => {
      const { isHost, activeRoom, broadcastSeek } = useJamStore.getState();
      if (isHost && activeRoom) {
        broadcastSeek(Math.floor(targetSeconds * 1000));
      }
    }).catch(() => {});
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    // Rule B5: a Remote may set the Speaker's volume. Volume itself still never
    // travels inside the session — only this one command carries it, and the
    // value shown here stays this device's own.
    if (routeToSpeaker("SET_VOLUME", { volume: clamped })) {
      set({ volume: clamped, isMuted: clamped === 0 });
      return;
    }
    set({ volume: clamped, isMuted: clamped === 0 });
    get().saveSnapshot();
  },

  toggleMute: () => {
    const nextMuted = !get().isMuted;
    if (routeToSpeaker("SET_MUTE", { muted: nextMuted })) {
      set({ isMuted: nextMuted });
      return;
    }
    set({ isMuted: nextMuted });
    get().saveSnapshot();
  },

  toggleShuffle: () => {
    const nextShuffle = !get().isShuffle;
    if (routeToSpeaker("SET_SHUFFLE", { shuffle: nextShuffle })) return;
    get().setShuffle(nextShuffle);
  },

  setShuffle: (value) => {
    const { isShuffle, contextQueue, originalContextQueue, currentTrack } = get();
    if (value === isShuffle) return;

    if (value) {
      // Shuffling: Keep current track first, shuffle the rest
      if (currentTrack && contextQueue.length > 0) {
        const others = contextQueue.filter((t) => t.id !== currentTrack.id);
        const shuffled = [currentTrack, ...shuffleArray(others)];
        set({
          isShuffle: true,
          contextQueue: shuffled,
          contextIndex: 0,
        });
      } else {
        set({ isShuffle: true });
      }
    } else {
      // Un-shuffling: Restore original order, find current track index
      if (currentTrack && originalContextQueue.length > 0) {
        const idx = originalContextQueue.findIndex((t) => t.id === currentTrack.id);
        set({
          isShuffle: false,
          contextQueue: [...originalContextQueue],
          contextIndex: idx >= 0 ? idx : 0,
        });
      } else {
        set({ isShuffle: false });
      }
    }
    get().saveSnapshot();
  },

  toggleRepeat: () => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const current = get().repeatMode;
    const nextIndex = (modes.indexOf(current) + 1) % modes.length;
    const nextMode = modes[nextIndex];
    if (routeToSpeaker("SET_REPEAT", { repeat: nextMode })) return;
    get().setRepeat(nextMode);
  },

  setRepeat: (mode) => {
    if (get().repeatMode === mode) return;
    set({ repeatMode: mode });
    get().saveSnapshot();
  },

  /** Rules B1/§6.4: apply a command that arrived from a Remote. */
  applySessionCommand: (type, payload) => {
    switch (type) {
      case "PLAY":
        get().resume();
        return;
      case "PAUSE":
      case "STOP":
        get().pause();
        return;
      case "SEEK":
        get().seek((payload?.positionMs ?? 0) / 1000);
        return;
      case "NEXT":
        get().next();
        return;
      case "PREVIOUS":
        get().previous();
        return;
      case "SET_VOLUME":
        if (typeof payload?.volume === "number") get().setVolume(payload.volume);
        return;
      case "SET_MUTE": {
        const muted = payload?.muted ?? !get().isMuted;
        set({ isMuted: muted });
        get().saveSnapshot();
        return;
      }
      case "SET_SHUFFLE":
        get().setShuffle(payload?.shuffle ?? false);
        return;
      case "SET_REPEAT":
        if (payload?.repeat) get().setRepeat(payload.repeat);
        return;
      case "PLAY_NEXT":
        if (payload?.track) get().playNext(payload.track);
        return;
      case "PLAY_TRACK": {
        // Rule B7 (Spotify semantics): another device picked this song. Only
        // the Speaker ever runs this — the server has already moved the
        // session's track, and this is what moves the audio and adopts the
        // context the song was tapped inside.
        const track = payload?.track;
        if (!track) return;
        get().playTrack(
          track,
          payload?.contextQueue,
          payload?.contextIndex ?? 0,
          payload?.contextUri ?? undefined,
          payload?.contextTitle ?? undefined
        );
        return;
      }
      case "ADD_TO_QUEUE":
        if (payload?.track) get().addToQueue(payload.track);
        return;
      case "REMOVE_FROM_QUEUE":
        if (typeof payload?.index === "number") get().removeFromUserQueue(payload.index);
        return;
      case "REORDER_QUEUE":
        if (typeof payload?.index === "number" && typeof payload?.toIndex === "number") {
          get().reorderUserQueue(payload.index, payload.toIndex);
        }
        return;
      case "CLEAR_QUEUE":
        get().clearUserQueue();
        return;
    }
  },

  next: () => {
    if (routeToSpeaker("NEXT")) return;
    const { repeatMode, userQueue, contextQueue, contextIndex, currentTrack } = get();

    // 1. Repeat One: replay current track
    if (repeatMode === "one" && currentTrack) {
      set({ currentTime: 0, playbackStatus: "playing" });
      return;
    }

    // 2. User Priority Queue has tracks
    if (userQueue.length > 0) {
      const [nextUserTrack, ...remainingUserQueue] = userQueue;
      set({
        currentTrack: nextUserTrack,
        userQueue: remainingUserQueue,
        currentTime: 0,
        duration: nextUserTrack.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
      return;
    }

    // 3. Fall back to Context Queue
    if (contextIndex + 1 < contextQueue.length) {
      const nextTrack = contextQueue[contextIndex + 1];
      set({
        currentTrack: nextTrack,
        contextIndex: contextIndex + 1,
        currentTime: 0,
        duration: nextTrack.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
      return;
    }

    // 4. End of context reached: Check Repeat All
    if (repeatMode === "all" && contextQueue.length > 0) {
      const firstTrack = contextQueue[0];
      set({
        currentTrack: firstTrack,
        contextIndex: 0,
        currentTime: 0,
        duration: firstTrack.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
      return;
    }

    // 5. Playlist finished
    set({ playbackStatus: "paused", currentTime: 0 });
    get().saveSnapshot();
  },

  previous: () => {
    if (routeToSpeaker("PREVIOUS")) return;
    const { currentTime, contextQueue, contextIndex, repeatMode } = get();

    // If more than 3 seconds in, restart the song
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    // Step back in context queue
    if (contextIndex > 0) {
      const prevTrack = contextQueue[contextIndex - 1];
      set({
        currentTrack: prevTrack,
        contextIndex: contextIndex - 1,
        currentTime: 0,
        duration: prevTrack.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
      return;
    }

    // If at start and Repeat All is on, go to last song
    if (repeatMode === "all" && contextQueue.length > 0) {
      const lastIdx = contextQueue.length - 1;
      const lastTrack = contextQueue[lastIdx];
      set({
        currentTrack: lastTrack,
        contextIndex: lastIdx,
        currentTime: 0,
        duration: lastTrack.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
      return;
    }

    // Otherwise restart first song
    set({ currentTime: 0 });
  },

  playNext: (track) => {
    if (track.isStreamable === false) return;
    if (routeToSpeaker("PLAY_NEXT", { track })) return;
    set((state) => ({
      userQueue: [track, ...state.userQueue],
    }));
    get().saveSnapshot();
  },

  addToQueue: (track) => {
    if (track.isStreamable === false) return;
    if (routeToSpeaker("ADD_TO_QUEUE", { track })) return;
    set((state) => ({
      userQueue: [...state.userQueue, track],
    }));
    get().saveSnapshot();
  },

  reorderUserQueue: (fromIndex, toIndex) => {
    if (routeToSpeaker("REORDER_QUEUE", { index: fromIndex, toIndex })) return;
    set((state) => {
      const updated = [...state.userQueue];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return { userQueue: updated };
    });
    get().saveSnapshot();
  },

  removeFromUserQueue: (index) => {
    if (routeToSpeaker("REMOVE_FROM_QUEUE", { index })) return;
    set((state) => ({
      userQueue: state.userQueue.filter((_, i) => i !== index),
    }));
    get().saveSnapshot();
  },

  clearUserQueue: () => {
    if (routeToSpeaker("CLEAR_QUEUE")) return;
    set({ userQueue: [] });
    get().saveSnapshot();
  },

  playUserQueueTrack: (index: number) => {
    const { userQueue } = get();
    if (index >= 0 && index < userQueue.length) {
      const selectedTrack = userQueue[index];

      // Rule B7 (Spotify semantics): play the tapped queue entry on the
      // Speaker; only an unreachable Speaker pulls playback here.
      if (
        playSongAsRemote({ track: selectedTrack }, () =>
          void playHereWithTrack(selectedTrack, userQueue, index, undefined, undefined)
        )
      ) {
        return;
      }

      const remainingUserQueue = userQueue.filter((_, i) => i !== index);
      set({
        currentTrack: selectedTrack,
        userQueue: remainingUserQueue,
        currentTime: 0,
        duration: selectedTrack.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
    }
  },

  jumpToContextTrack: (index) => {
    const { contextQueue } = get();
    if (index >= 0 && index < contextQueue.length) {
      const track = contextQueue[index];
      const { contextUri, contextTitle } = get();

      // Rule B7 (Spotify semantics): play the tapped context entry on the
      // Speaker; only an unreachable Speaker pulls playback here.
      if (
        playSongAsRemote(
          { track, contextQueue, contextIndex: index, contextUri, contextTitle },
          () =>
            void playHereWithTrack(
              track,
              contextQueue,
              index,
              contextUri ?? undefined,
              contextTitle ?? undefined
            )
        )
      ) {
        return;
      }

      set({
        currentTrack: track,
        contextIndex: index,
        currentTime: 0,
        duration: track.durationSeconds || 0,
        playbackStatus: "loading",
        errorMessage: null,
      });
      get().saveSnapshot();
    }
  },

  stopPlayback: () => {
    // On a Remote this means "stop the session", not "wipe this tab" — the
    // Speaker owns the queue and is the one that should actually pause.
    if (routeToSpeaker("STOP")) return;
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    set({
      currentTrack: null,
      playbackStatus: "idle",
      currentTime: 0,
      duration: 0,
      userQueue: [],
      contextQueue: [],
      originalContextQueue: [],
      contextIndex: 0,
      contextUri: null,
      contextTitle: null,
      errorMessage: null,
      isQueueOpen: false,
      isDevicesOpen: false,
      isInitialized: false,
      supersededByDevice: null,
    });
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  setQueueOpen: (isOpen) =>
    set((s) => ({
      isQueueOpen: isOpen,
      desktopRightSidebarView: isOpen
        ? "queue"
        : s.desktopRightSidebarView === "queue"
        ? "none"
        : s.desktopRightSidebarView,
    })),
  toggleQueueDrawer: () =>
    set((s) => {
      const nextOpen = !s.isQueueOpen;
      return {
        isQueueOpen: nextOpen,
        desktopRightSidebarView: nextOpen
          ? "queue"
          : s.desktopRightSidebarView === "queue"
          ? "none"
          : s.desktopRightSidebarView,
      };
    }),
  setDevicesOpen: (isOpen) =>
    set((s) => ({
      isDevicesOpen: isOpen,
      desktopRightSidebarView: isOpen
        ? "devices"
        : s.desktopRightSidebarView === "devices"
        ? "none"
        : s.desktopRightSidebarView,
    })),
  toggleDevicesDrawer: () =>
    set((s) => {
      const nextOpen = !s.isDevicesOpen;
      return {
        isDevicesOpen: nextOpen,
        desktopRightSidebarView: nextOpen
          ? "devices"
          : s.desktopRightSidebarView === "devices"
          ? "none"
          : s.desktopRightSidebarView,
      };
    }),
  setNowPlayingExpanded: (isOpen) => set({ isNowPlayingExpanded: isOpen }),
  toggleNowPlayingExpanded: () =>
    set((s) => ({ isNowPlayingExpanded: !s.isNowPlayingExpanded })),
  setDesktopRightSidebarView: (view) =>
    set({
      desktopRightSidebarView: view,
      isQueueOpen: view === "queue",
      isDevicesOpen: view === "devices",
    }),
  toggleDesktopRightSidebar: (view) =>
    set((s) => {
      const nextView = s.desktopRightSidebarView === view ? "none" : view;
      return {
        desktopRightSidebarView: nextView,
        isQueueOpen: nextView === "queue",
        isDevicesOpen: nextView === "devices",
      };
    }),
  updateTrackCredits: (songId, credits) => {
    set((state) => {
      if (state.currentTrack && state.currentTrack.id === songId) {
        return {
          currentTrack: {
            ...state.currentTrack,
            credits,
          },
        };
      }
      return state;
    });
  },

  _setStatus: (status) => set({ playbackStatus: status }),
  _setCurrentTime: (time) => set({ currentTime: time }),
  _setDuration: (duration) => set({ duration }),
  _setError: (err) => set({ errorMessage: err, playbackStatus: err ? "error" : "paused" }),
  _setStreamQuality: (quality) => set({ streamQuality: quality }),
  _setStreamFormat: (format) => set({ streamFormat: format }),

  // Jam-controlled internal sync (no outbound WebSocket broadcasts)
  syncJamPlayback: (track, positionSeconds, status) => {
    const current = get().currentTrack;
    const isDifferentTrack = !current || current.id !== track.id;

    if (isDifferentTrack) {
      set({
        currentTrack: track,
        duration: track.durationSeconds || 0,
        currentTime: positionSeconds,
        playbackStatus: status === "playing" ? "loading" : "paused",
        errorMessage: null,
        supersededByDevice: null,
      });
    } else {
      set({
        currentTime: positionSeconds,
        playbackStatus: status,
        errorMessage: null,
        supersededByDevice: null,
      });
    }
  },

  // 0ms localStorage + Debounced Redis Server Sync
  saveSnapshot: () => {
    const state = get();
    const snapshot: PlayerStateSnapshot = {
      currentTrack: state.currentTrack,
      playbackPosition: state.currentTime,
      volume: state.volume,
      isMuted: state.isMuted,
      isShuffle: state.isShuffle,
      repeatMode: state.repeatMode,
      userQueue: state.userQueue,
      contextQueue: state.contextQueue,
      contextIndex: state.contextIndex,
      contextUri: state.contextUri,
      contextTitle: state.contextTitle,
      updatedAt: new Date().toISOString(),
    };

    // 1. Instant local persistence (volume/mute are device-local and live here only)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore quota exceeded or private mode
    }

    // 2. Debounced server sync (1.5s) - only for authenticated members.
    //    Note the deliberate omission of volume/isMuted: they must never travel
    //    between devices (docs/CROSS_DEVICE_PLAYBACK_DESIGN.md rule R2).
    if (saveTimeout) clearTimeout(saveTimeout);
    if (!useAuthStore.getState().isAuthenticated) return;
    saveTimeout = setTimeout(async () => {
      try {
        await playerApi.savePlayerState({
          currentTrack: snapshot.currentTrack,
          playbackPosition: snapshot.playbackPosition,
          isShuffle: snapshot.isShuffle,
          repeatMode: snapshot.repeatMode,
          userQueue: snapshot.userQueue,
          contextQueue: snapshot.contextQueue,
          contextIndex: snapshot.contextIndex,
          contextUri: snapshot.contextUri,
          contextTitle: snapshot.contextTitle,
        });
      } catch {
        // Silently fail if offline or unauthorized
      }
    }, 1500);
  },

  initializeSync: async (force = false) => {
    if (get().isInitialized && !force) return;

    // Check if an active Jam session is active or saved in storage
    const activeJamRoomCode = localStorage.getItem("groovy:jam:active_room_code");

    // 1. Instant 0ms hydration from localStorage (skip if force refreshing after auth transition)
    if (!force) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const local = JSON.parse(raw) as PlayerStateSnapshot;
          set({
            currentTrack: activeJamRoomCode ? get().currentTrack : local.currentTrack,
            currentTime: activeJamRoomCode ? get().currentTime : (local.playbackPosition || 0),
            duration: activeJamRoomCode ? get().duration : (local.currentTrack?.durationSeconds || 0),
            volume: local.volume ?? 0.8,
            isMuted: local.isMuted ?? false,
            isShuffle: local.isShuffle ?? false,
            repeatMode: local.repeatMode ?? "off",
            userQueue: local.userQueue || [],
            contextQueue: local.contextQueue || [],
            originalContextQueue: local.contextQueue || [],
            contextIndex: local.contextIndex || 0,
            contextUri: local.contextUri || null,
            contextTitle: local.contextTitle || null,
            playbackStatus: activeJamRoomCode ? get().playbackStatus : "paused", // Always start paused on solo page load
            isInitialized: true,
          });
        }
      } catch {
        // Ignore local storage parse error
      }
    }

    // 2. Query server for cross-device snapshot (<1ms) - only for authenticated members
    if (!useAuthStore.getState().isAuthenticated) {
      set({ isInitialized: true });
      return;
    }

    try {
      const res = await playerApi.getPlayerState();
      if (res && res.state && res.state.currentTrack) {
        const serverState = res.state;
        const currentJamCode = localStorage.getItem("groovy:jam:active_room_code");

        if (currentJamCode) {
          // If Jam is active, DO NOT overwrite track, position, or playbackStatus with stale solo snapshot!
          set({
            isShuffle: serverState.isShuffle ?? false,
            repeatMode: serverState.repeatMode ?? "off",
            userQueue: serverState.userQueue || [],
            isInitialized: true,
          });
        } else {
          // NOTE: volume / isMuted are intentionally NOT hydrated from the
          // server — they are device-local (rules R2 / A5).
          set({
            currentTrack: serverState.currentTrack,
            currentTime: serverState.playbackPosition || 0,
            duration: serverState.currentTrack?.durationSeconds || 0,
            isShuffle: serverState.isShuffle ?? false,
            repeatMode: serverState.repeatMode ?? "off",
            userQueue: serverState.userQueue || [],
            contextQueue: serverState.contextQueue || [],
            originalContextQueue: serverState.contextQueue || [],
            contextIndex: serverState.contextIndex || 0,
            contextUri: serverState.contextUri || null,
            contextTitle: serverState.contextTitle || null,
            playbackStatus: "paused",
            isInitialized: true,
          });
        }
      }
    } catch {
      // Not authenticated or network down
    }

    set({ isInitialized: true });
  },
}));
