import { create } from "zustand";
import { catalogApi } from "../lib/catalog.api";

interface LikesState {
  likedSongIds: Set<string>;
  likedAlbumIds: Set<string>;
  isInitialized: boolean;
  isLoading: boolean;

  // Read helpers
  isSongLiked: (songId: string) => boolean;
  isAlbumLiked: (albumId: string) => boolean;

  // Hydration helpers
  hydrateSongs: (songs: Array<{ id: string; isLiked?: boolean }>) => void;
  hydrateAlbums: (albums: Array<{ id: string; isLiked?: boolean }>) => void;

  // Sync & lifecycle
  initializeLikes: () => Promise<void>;
  clearLikes: () => void;

  // 0ms Optimistic Mutators
  toggleSongLike: (songId: string) => Promise<{ liked: boolean; likesCount: number }>;
  toggleAlbumLike: (albumId: string) => Promise<{ liked: boolean; likesCount: number }>;
}

let initPromise: Promise<void> | null = null;

export const useLikesStore = create<LikesState>((set, get) => ({
  likedSongIds: new Set<string>(),
  likedAlbumIds: new Set<string>(),
  isInitialized: false,
  isLoading: false,

  isSongLiked: (songId: string) => get().likedSongIds.has(songId),
  isAlbumLiked: (albumId: string) => get().likedAlbumIds.has(albumId),

  hydrateSongs: (songs: Array<{ id: string; isLiked?: boolean }>) => {
    let changed = false;
    const next = new Set(get().likedSongIds);
    for (const song of songs) {
      if (song.isLiked && !next.has(song.id)) {
        next.add(song.id);
        changed = true;
      }
    }
    if (changed) {
      set({ likedSongIds: next });
    }
  },

  hydrateAlbums: (albums: Array<{ id: string; isLiked?: boolean }>) => {
    let changed = false;
    const next = new Set(get().likedAlbumIds);
    for (const album of albums) {
      if (album.isLiked && !next.has(album.id)) {
        next.add(album.id);
        changed = true;
      }
    }
    if (changed) {
      set({ likedAlbumIds: next });
    }
  },

  initializeLikes: async () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        set({ isLoading: true });
        const [songsRes, albumsRes] = await Promise.all([
          catalogApi.getLikedSongIds().catch(() => ({ songIds: [] })),
          catalogApi.getLikedAlbumIds().catch(() => ({ albumIds: [] })),
        ]);

        set({
          likedSongIds: new Set(songsRes.songIds),
          likedAlbumIds: new Set(albumsRes.albumIds),
          isInitialized: true,
        });
      } finally {
        set({ isLoading: false });
        initPromise = null;
      }
    })();

    return initPromise;
  },

  clearLikes: () => {
    set({
      likedSongIds: new Set<string>(),
      likedAlbumIds: new Set<string>(),
      isInitialized: false,
      isLoading: false,
    });
  },

  toggleSongLike: async (songId: string) => {
    const prevSet = get().likedSongIds;
    const wasLiked = prevSet.has(songId);
    const nextLiked = !wasLiked;

    // 0ms Optimistic Update
    const nextSet = new Set(prevSet);
    if (nextLiked) {
      nextSet.add(songId);
    } else {
      nextSet.delete(songId);
    }
    set({ likedSongIds: nextSet });

    try {
      const res = await catalogApi.toggleSongLike(songId);
      // Reconcile if server returned unexpected status
      if (res.liked !== nextLiked) {
        const reconciled = new Set(get().likedSongIds);
        if (res.liked) {
          reconciled.add(songId);
        } else {
          reconciled.delete(songId);
        }
        set({ likedSongIds: reconciled });
      }
      return res;
    } catch (err) {
      // Rollback on failure
      const rollbackSet = new Set(get().likedSongIds);
      if (wasLiked) {
        rollbackSet.add(songId);
      } else {
        rollbackSet.delete(songId);
      }
      set({ likedSongIds: rollbackSet });
      throw err;
    }
  },

  toggleAlbumLike: async (albumId: string) => {
    const prevSet = get().likedAlbumIds;
    const wasLiked = prevSet.has(albumId);
    const nextLiked = !wasLiked;

    // 0ms Optimistic Update
    const nextSet = new Set(prevSet);
    if (nextLiked) {
      nextSet.add(albumId);
    } else {
      nextSet.delete(albumId);
    }
    set({ likedAlbumIds: nextSet });

    try {
      const res = await catalogApi.toggleAlbumLike(albumId);
      if (res.liked !== nextLiked) {
        const reconciled = new Set(get().likedAlbumIds);
        if (res.liked) {
          reconciled.add(albumId);
        } else {
          reconciled.delete(albumId);
        }
        set({ likedAlbumIds: reconciled });
      }
      return res;
    } catch (err) {
      // Rollback on failure
      const rollbackSet = new Set(get().likedAlbumIds);
      if (wasLiked) {
        rollbackSet.add(albumId);
      } else {
        rollbackSet.delete(albumId);
      }
      set({ likedAlbumIds: rollbackSet });
      throw err;
    }
  },
}));
