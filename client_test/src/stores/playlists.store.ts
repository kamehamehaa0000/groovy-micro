import { create } from "zustand";
import { playlistsApi } from "../lib/playlists.api";

interface PlaylistsState {
  savedPlaylistIds: Set<string>;
  isInitialized: boolean;
  isLoading: boolean;

  // Read helper (Tier 1: 0ms In-Memory Set lookup)
  isPlaylistSaved: (playlistId: string) => boolean;

  // Hydration helper (Tier 3: Passive hydration on list fetch)
  hydratePlaylists: (playlists: Array<{ id: string; isSaved?: boolean }>) => void;

  // Sync & lifecycle (Tier 4: Fast Sync)
  initializePlaylists: () => Promise<void>;
  clearPlaylists: () => void;

  // 0ms Optimistic Mutator (Tier 1 & Tier 2: Write-Through)
  toggleSavePlaylist: (playlistId: string) => Promise<{ saved: boolean; savesCount: number }>;
}

let initPlaylistsPromise: Promise<void> | null = null;

export const usePlaylistsStore = create<PlaylistsState>((set, get) => ({
  savedPlaylistIds: new Set<string>(),
  isInitialized: false,
  isLoading: false,

  isPlaylistSaved: (playlistId: string) => get().savedPlaylistIds.has(playlistId),

  hydratePlaylists: (playlists: Array<{ id: string; isSaved?: boolean }>) => {
    let changed = false;
    const next = new Set(get().savedPlaylistIds);
    for (const pl of playlists) {
      if (pl.isSaved && !next.has(pl.id)) {
        next.add(pl.id);
        changed = true;
      }
    }
    if (changed) {
      set({ savedPlaylistIds: next });
    }
  },

  initializePlaylists: async () => {
    if (initPlaylistsPromise) return initPlaylistsPromise;

    initPlaylistsPromise = (async () => {
      try {
        set({ isLoading: true });
        const res = await playlistsApi.getSavedPlaylistIds().catch(() => ({ playlistIds: [] }));
        set({
          savedPlaylistIds: new Set(res.playlistIds),
          isInitialized: true,
        });
      } finally {
        set({ isLoading: false });
        initPlaylistsPromise = null;
      }
    })();

    return initPlaylistsPromise;
  },

  clearPlaylists: () => {
    set({
      savedPlaylistIds: new Set<string>(),
      isInitialized: false,
      isLoading: false,
    });
  },

  toggleSavePlaylist: async (playlistId: string) => {
    const prevSet = get().savedPlaylistIds;
    const wasSaved = prevSet.has(playlistId);
    const nextSaved = !wasSaved;

    // 0ms Optimistic UI Update (Tier 1)
    const nextSet = new Set(prevSet);
    if (nextSaved) {
      nextSet.add(playlistId);
    } else {
      nextSet.delete(playlistId);
    }
    set({ savedPlaylistIds: nextSet });

    try {
      const res = wasSaved
        ? await playlistsApi.unsavePlaylist(playlistId)
        : await playlistsApi.savePlaylist(playlistId);

      // Reconcile if server returned unexpected state
      if (res.saved !== nextSaved) {
        const reconciled = new Set(get().savedPlaylistIds);
        if (res.saved) {
          reconciled.add(playlistId);
        } else {
          reconciled.delete(playlistId);
        }
        set({ savedPlaylistIds: reconciled });
      }

      return res;
    } catch (err) {
      // Rollback on network or authorization failure
      set({ savedPlaylistIds: prevSet });
      throw err;
    }
  },
}));
