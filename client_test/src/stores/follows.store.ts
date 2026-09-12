import { create } from "zustand";
import { artistsApi } from "../lib/artists.api";

interface FollowsState {
  followedArtistIds: Set<string>;
  isInitialized: boolean;
  isLoading: boolean;

  // Read helper
  isFollowing: (artistId: string) => boolean;

  // Hydration helper
  hydrateArtists: (artists: Array<{ id: string; isFollowing?: boolean }>) => void;

  // Sync & lifecycle
  initializeFollows: () => Promise<void>;
  clearFollows: () => void;

  // 0ms Optimistic Mutator
  toggleFollow: (artistId: string) => Promise<{ following: boolean; followersCount: number }>;
}

let initFollowsPromise: Promise<void> | null = null;

export const useFollowsStore = create<FollowsState>((set, get) => ({
  followedArtistIds: new Set<string>(),
  isInitialized: false,
  isLoading: false,

  isFollowing: (artistId: string) => get().followedArtistIds.has(artistId),

  hydrateArtists: (artists: Array<{ id: string; isFollowing?: boolean }>) => {
    let changed = false;
    const next = new Set(get().followedArtistIds);
    for (const artist of artists) {
      if (artist.isFollowing && !next.has(artist.id)) {
        next.add(artist.id);
        changed = true;
      }
    }
    if (changed) {
      set({ followedArtistIds: next });
    }
  },

  initializeFollows: async () => {
    if (initFollowsPromise) return initFollowsPromise;

    initFollowsPromise = (async () => {
      try {
        set({ isLoading: true });
        const res = await artistsApi.getFollowingArtistIds().catch(() => ({ artistIds: [] }));
        set({
          followedArtistIds: new Set(res.artistIds),
          isInitialized: true,
        });
      } finally {
        set({ isLoading: false });
        initFollowsPromise = null;
      }
    })();

    return initFollowsPromise;
  },

  clearFollows: () => {
    set({
      followedArtistIds: new Set<string>(),
      isInitialized: false,
      isLoading: false,
    });
  },

  toggleFollow: async (artistId: string) => {
    const prevSet = get().followedArtistIds;
    const wasFollowing = prevSet.has(artistId);
    const nextFollowing = !wasFollowing;

    // 0ms Optimistic UI Update
    const nextSet = new Set(prevSet);
    if (nextFollowing) {
      nextSet.add(artistId);
    } else {
      nextSet.delete(artistId);
    }
    set({ followedArtistIds: nextSet });

    try {
      const res = wasFollowing
        ? await artistsApi.unfollow(artistId)
        : await artistsApi.follow(artistId);

      // Reconcile if server returns unexpected state
      if (res.following !== nextFollowing) {
        const reconciled = new Set(get().followedArtistIds);
        if (res.following) {
          reconciled.add(artistId);
        } else {
          reconciled.delete(artistId);
        }
        set({ followedArtistIds: reconciled });
      }
      return res;
    } catch (err) {
      // Rollback on failure
      const rollbackSet = new Set(get().followedArtistIds);
      if (wasFollowing) {
        rollbackSet.add(artistId);
      } else {
        rollbackSet.delete(artistId);
      }
      set({ followedArtistIds: rollbackSet });
      throw err;
    }
  },
}));
