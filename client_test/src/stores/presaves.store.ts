import { create } from "zustand";
import { catalogApi } from "../lib/catalog.api";

interface PreSavesState {
  preSavedAlbumIds: Set<string>;
  isInitialized: boolean;
  isLoading: boolean;

  // Read helper
  isPreSaved: (albumId: string) => boolean;

  // Hydration helper
  hydrateAlbums: (albums: Array<{ id: string; isPreSaved?: boolean }>) => void;

  // Sync & lifecycle
  initializePreSaves: () => Promise<void>;
  clearPreSaves: () => void;

  // 0ms Optimistic Mutator
  togglePreSave: (albumId: string) => Promise<{ preSaved: boolean; preSavesCount: number }>;
}

let initPreSavesPromise: Promise<void> | null = null;

export const usePreSavesStore = create<PreSavesState>((set, get) => ({
  preSavedAlbumIds: new Set<string>(),
  isInitialized: false,
  isLoading: false,

  isPreSaved: (albumId: string) => get().preSavedAlbumIds.has(albumId),

  hydrateAlbums: (albums: Array<{ id: string; isPreSaved?: boolean }>) => {
    let changed = false;
    const next = new Set(get().preSavedAlbumIds);
    for (const album of albums) {
      if (album.isPreSaved && !next.has(album.id)) {
        next.add(album.id);
        changed = true;
      }
    }
    if (changed) {
      set({ preSavedAlbumIds: next });
    }
  },

  initializePreSaves: async () => {
    if (initPreSavesPromise) return initPreSavesPromise;

    initPreSavesPromise = (async () => {
      try {
        set({ isLoading: true });
        const res = await catalogApi.getPreSavedAlbumIds().catch(() => ({ albumIds: [] }));
        set({
          preSavedAlbumIds: new Set(res.albumIds),
          isInitialized: true,
        });
      } finally {
        set({ isLoading: false });
        initPreSavesPromise = null;
      }
    })();

    return initPreSavesPromise;
  },

  clearPreSaves: () => {
    set({
      preSavedAlbumIds: new Set<string>(),
      isInitialized: false,
      isLoading: false,
    });
  },

  togglePreSave: async (albumId: string) => {
    const prevSet = get().preSavedAlbumIds;
    const wasPreSaved = prevSet.has(albumId);
    const nextPreSaved = !wasPreSaved;

    // 0ms Optimistic UI Update
    const nextSet = new Set(prevSet);
    if (nextPreSaved) {
      nextSet.add(albumId);
    } else {
      nextSet.delete(albumId);
    }
    set({ preSavedAlbumIds: nextSet });

    try {
      const res = wasPreSaved
        ? await catalogApi.removePreSave(albumId)
        : await catalogApi.preSaveAlbum(albumId);

      // Reconcile if server returns unexpected state
      if (res.preSaved !== nextPreSaved) {
        const reconciled = new Set(get().preSavedAlbumIds);
        if (res.preSaved) {
          reconciled.add(albumId);
        } else {
          reconciled.delete(albumId);
        }
        set({ preSavedAlbumIds: reconciled });
      }
      return res;
    } catch (err) {
      // Rollback on failure
      const rollbackSet = new Set(get().preSavedAlbumIds);
      if (wasPreSaved) {
        rollbackSet.add(albumId);
      } else {
        rollbackSet.delete(albumId);
      }
      set({ preSavedAlbumIds: rollbackSet });
      throw err;
    }
  },
}));
