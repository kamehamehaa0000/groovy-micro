import { create } from "zustand";
import type {
  PlayerTrack,
  PlaybackStatus,
  RepeatMode,
  PlayerStateSnapshot,
} from "../types/player";
import { playerApi } from "../lib/player.api";
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
  isInitialized: boolean;

  // Multi-Device Takeover (Option A)
  supersededByDevice: { deviceId: string; deviceName: string } | null;
  takeoverPlayback: () => Promise<void>;
  dismissSuperseded: () => void;

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
  next: () => void;
  previous: () => void;

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
  isInitialized: false,
  supersededByDevice: null,

  takeoverPlayback: async () => {
    const { currentTrack, currentTime } = get();
    const { getDeviceInfo } = await import("../lib/device");
    const { deviceId, deviceName } = getDeviceInfo();

    try {
      await playerApi.sendHeartbeat({
        deviceId,
        deviceName,
        songId: currentTrack?.id || null,
        trackTitle: currentTrack?.title || null,
        artistName: currentTrack?.artistName || null,
        coverImageUrl: currentTrack?.coverImageUrl || null,
        progressMs: Math.floor(currentTime * 1000),
        durationMs: currentTrack?.durationSeconds ? currentTrack.durationSeconds * 1000 : undefined,
        isPaused: false,
        takeover: true,
      });
    } catch {
      // Ignore network errors
    }

    set({ supersededByDevice: null, playbackStatus: "playing" });
    get().saveSnapshot();
  },

  dismissSuperseded: () => set({ supersededByDevice: null }),

  playTrack: (track, contextQueue, contextIndex = 0, contextUri, contextTitle) => {
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
    if (nextStatus === "paused") {
      set({ playbackStatus: "paused" });
    } else {
      set({ playbackStatus: "playing", supersededByDevice: null });
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
    const { currentTrack, currentTime } = get();
    if (currentTrack) {
      set({ playbackStatus: "playing", supersededByDevice: null });
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
    set({ volume: clamped, isMuted: clamped === 0 });
    get().saveSnapshot();
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
    get().saveSnapshot();
  },

  toggleShuffle: () => {
    const { isShuffle, contextQueue, originalContextQueue, currentTrack } = get();
    const nextShuffle = !isShuffle;

    if (nextShuffle) {
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
    set({ repeatMode: modes[nextIndex] });
    get().saveSnapshot();
  },

  next: () => {
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
    set((state) => ({
      userQueue: [track, ...state.userQueue],
    }));
    get().saveSnapshot();
  },

  addToQueue: (track) => {
    set((state) => ({
      userQueue: [...state.userQueue, track],
    }));
    get().saveSnapshot();
  },

  reorderUserQueue: (fromIndex, toIndex) => {
    set((state) => {
      const updated = [...state.userQueue];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return { userQueue: updated };
    });
    get().saveSnapshot();
  },

  removeFromUserQueue: (index) => {
    set((state) => ({
      userQueue: state.userQueue.filter((_, i) => i !== index),
    }));
    get().saveSnapshot();
  },

  clearUserQueue: () => {
    set({ userQueue: [] });
    get().saveSnapshot();
  },

  playUserQueueTrack: (index: number) => {
    const { userQueue } = get();
    if (index >= 0 && index < userQueue.length) {
      const selectedTrack = userQueue[index];
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
      isInitialized: false,
      supersededByDevice: null,
    });
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  setQueueOpen: (isOpen) => set({ isQueueOpen: isOpen }),
  toggleQueueDrawer: () => set((s) => ({ isQueueOpen: !s.isQueueOpen })),

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

    // 1. Instant local persistence
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore quota exceeded or private mode
    }

    // 2. Debounced server sync (1.5s) - only for authenticated members
    if (saveTimeout) clearTimeout(saveTimeout);
    if (!useAuthStore.getState().isAuthenticated) return;
    saveTimeout = setTimeout(async () => {
      try {
        await playerApi.savePlayerState({
          currentTrack: snapshot.currentTrack,
          playbackPosition: snapshot.playbackPosition,
          volume: snapshot.volume,
          isMuted: snapshot.isMuted,
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
            volume: serverState.volume ?? 0.8,
            isMuted: serverState.isMuted ?? false,
            isShuffle: serverState.isShuffle ?? false,
            repeatMode: serverState.repeatMode ?? "off",
            userQueue: serverState.userQueue || [],
            isInitialized: true,
          });
        } else {
          set({
            currentTrack: serverState.currentTrack,
            currentTime: serverState.playbackPosition || 0,
            duration: serverState.currentTrack?.durationSeconds || 0,
            volume: serverState.volume ?? 0.8,
            isMuted: serverState.isMuted ?? false,
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
