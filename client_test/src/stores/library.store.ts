import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  libraryApi,
  type LibraryPayload,
  type LibraryPin,
} from "../lib/library.api";
import type {
  LibraryFilterType,
  LibrarySortType,
  LibraryViewMode,
  UnifiedLibraryItem,
} from "../types/library";

interface LibraryPreferences {
  viewMode: LibraryViewMode;
  activeSort: LibrarySortType;
}

interface LibraryStoreState extends LibraryPreferences {
  activeFilter: LibraryFilterType;
  searchQuery: string;
  payload: LibraryPayload | null;
  isLoading: boolean;
  error: string | null;

  setViewMode: (mode: LibraryViewMode) => void;
  setActiveSort: (sort: LibrarySortType) => void;
  setActiveFilter: (filter: LibraryFilterType) => void;
  setSearchQuery: (query: string) => void;

  fetchLibrary: (force?: boolean) => Promise<void>;
  togglePin: (
    itemType: "LIKED_SONGS" | "PERSONAL_COLLECTION" | "PLAYLIST" | "ALBUM" | "ARTIST",
    itemId: string
  ) => Promise<{ success: boolean; isPinned: boolean; message?: string }>;
}

let fetchLibraryPromise: Promise<void> | null = null;

export const useLibraryStore = create<LibraryStoreState>()(
  persist(
    (set, get) => ({
      viewMode: "list",
      activeSort: "recent",
      activeFilter: "all",
      searchQuery: "",
      payload: null,
      isLoading: false,
      error: null,

      setViewMode: (viewMode) => set({ viewMode }),
      setActiveSort: (activeSort) => set({ activeSort }),
      setActiveFilter: (activeFilter) => set({ activeFilter }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),

      fetchLibrary: async (force = false) => {
        if (!force && get().payload && !get().isLoading) {
          return;
        }

        if (fetchLibraryPromise && !force) {
          return fetchLibraryPromise;
        }

        set({ isLoading: true, error: null });

        fetchLibraryPromise = (async () => {
          try {
            const data = await libraryApi.getLibrary();
            set({ payload: data, isLoading: false, error: null });
          } catch (err: any) {
            set({
              isLoading: false,
              error: err?.message || "Failed to load library",
            });
          } finally {
            fetchLibraryPromise = null;
          }
        })();

        return fetchLibraryPromise;
      },

      togglePin: async (itemType, itemId) => {
        const payload = get().payload;
        if (!payload) {
          return { success: false, isPinned: false };
        }

        const isCurrentlyPinned = payload.pins.some(
          (p) => p.itemType === itemType && p.itemId === itemId
        );

        if (!isCurrentlyPinned && payload.pins.length >= 6) {
          return {
            success: false,
            isPinned: false,
            message: "You can only pin up to 6 items to the top of your library.",
          };
        }

        // 1. Optimistic Update
        const previousPins = [...payload.pins];
        let nextPins: LibraryPin[];

        if (isCurrentlyPinned) {
          nextPins = previousPins.filter(
            (p) => !(p.itemType === itemType && p.itemId === itemId)
          );
        } else {
          const optimisticPin: LibraryPin = {
            id: `temp-${Date.now()}`,
            itemType,
            itemId,
            pinnedAt: new Date().toISOString(),
          };
          nextPins = [optimisticPin, ...previousPins];
        }

        set({
          payload: {
            ...payload,
            pins: nextPins,
          },
        });

        // 2. Network Sync with Rollback
        try {
          if (isCurrentlyPinned) {
            await libraryApi.unpinItem(itemType, itemId);
            return { success: true, isPinned: false };
          } else {
            const res = await libraryApi.pinItem(itemType, itemId);
            if (res.pin) {
              const currentPayload = get().payload;
              if (currentPayload) {
                set({
                  payload: {
                    ...currentPayload,
                    pins: currentPayload.pins.map((p) =>
                      p.itemType === itemType && p.itemId === itemId
                        ? (res.pin as LibraryPin)
                        : p
                    ),
                  },
                });
              }
            }
            return { success: true, isPinned: true };
          }
        } catch (err: any) {
          // Rollback on error
          const currentPayload = get().payload;
          if (currentPayload) {
            set({
              payload: {
                ...currentPayload,
                pins: previousPins,
              },
            });
          }
          return {
            success: false,
            isPinned: isCurrentlyPinned,
            message: err?.message || "Failed to update pin",
          };
        }
      },
    }),
    {
      name: "groovy_library_prefs",
      partialize: (state) => ({
        viewMode: state.viewMode,
        activeSort: state.activeSort,
      }),
    }
  )
);

/**
 * Transforms the raw library payload into unified items ready for sorting and filtering.
 */
export function buildUnifiedLibraryItems(
  payload: LibraryPayload | null
): UnifiedLibraryItem[] {
  if (!payload) return [];

  const pinnedMap = new Map<string, { pinnedAt: string }>();
  for (const pin of payload.pins) {
    pinnedMap.set(`${pin.itemType}:${pin.itemId}`, { pinnedAt: pin.pinnedAt });
  }

  const items: UnifiedLibraryItem[] = [];

  // 1. Liked Songs Tile (Special)
  const likedSongsPinKey = "LIKED_SONGS:LIKED_SONGS";
  const likedSongsPin = pinnedMap.get(likedSongsPinKey);
  items.push({
    id: "special:liked_songs",
    kind: "liked_songs",
    itemId: "LIKED_SONGS",
    title: "Liked Songs",
    subtitle: `Playlist • ${payload.likedSongs.totalTracks} songs`,
    imageUrl: null,
    linkTo: "/playlists/liked", // or liked songs route
    addedAt: payload.likedSongs.lastAddedAt || new Date(0).toISOString(),
    creatorOrArtistName: "You",
    isPinned: !!likedSongsPin,
    pinnedAt: likedSongsPin?.pinnedAt,
    tracksCount: payload.likedSongs.totalTracks,
  });

  // 2. Personal Collection Tile (Special)
  const collectionPinKey = "PERSONAL_COLLECTION:PERSONAL_COLLECTION";
  const collectionPin = pinnedMap.get(collectionPinKey);
  items.push({
    id: "special:personal_collection",
    kind: "personal_collection",
    itemId: "PERSONAL_COLLECTION",
    title: "Personal Collection",
    subtitle: `Vault • ${payload.personalCollection.totalReleases} releases, ${payload.personalCollection.totalTracks} tracks`,
    imageUrl: null,
    linkTo: "/collection",
    addedAt: payload.personalCollection.lastAddedAt || new Date(0).toISOString(),
    creatorOrArtistName: "Personal Vault",
    isPinned: !!collectionPin,
    pinnedAt: collectionPin?.pinnedAt,
    tracksCount: payload.personalCollection.totalTracks,
  });

  // 3. Playlists (Created and Saved)
  for (const pl of payload.playlists) {
    const pinKey = `PLAYLIST:${pl.id}`;
    const pin = pinnedMap.get(pinKey);
    const subtitle = pl.isOwner
      ? `Playlist • ${pl.tracksCount} tracks`
      : `Playlist • by ${pl.ownerName}`;

    items.push({
      id: `playlist:${pl.id}`,
      kind: "playlist",
      itemId: pl.id,
      title: pl.title,
      subtitle,
      imageUrl: pl.coverImageUrl,
      linkTo: `/playlists/${pl.id}`,
      addedAt: pl.addedAt,
      creatorOrArtistName: pl.ownerName || (pl.isOwner ? "You" : "Playlist"),
      isPinned: !!pin,
      pinnedAt: pin?.pinnedAt,
      tracksCount: pl.tracksCount,
      isOwner: pl.isOwner,
    });
  }

  // 4. Saved Releases (Albums, EPs, LPs, Singles)
  for (const rel of payload.releases) {
    const pinKey = `ALBUM:${rel.id}`;
    const pin = pinnedMap.get(pinKey);
    const typeLabel =
      rel.albumType === "EP"
        ? "EP"
        : rel.albumType === "LP"
        ? "LP"
        : rel.albumType === "SINGLE"
        ? "Single"
        : "Album";
    const subtitle = `${typeLabel} • ${rel.artistName}`;

    items.push({
      id: `album:${rel.id}`,
      kind: "album",
      itemId: rel.id,
      title: rel.title,
      subtitle,
      imageUrl: rel.coverImageUrl,
      linkTo: `/albums/${rel.slug || rel.id}`,
      addedAt: rel.savedAt,
      creatorOrArtistName: rel.artistName,
      isPinned: !!pin,
      pinnedAt: pin?.pinnedAt,
      releaseType: rel.albumType,
      tracksCount: rel.tracksCount,
    });
  }

  // 5. Followed Artists
  for (const art of payload.artists) {
    const pinKey = `ARTIST:${art.id}`;
    const pin = pinnedMap.get(pinKey);

    items.push({
      id: `artist:${art.id}`,
      kind: "artist",
      itemId: art.id,
      title: art.stageName,
      subtitle: "Artist",
      imageUrl: art.avatarUrl,
      isRoundImage: true,
      linkTo: `/artists/${art.slug || art.id}`,
      addedAt: art.followedAt,
      creatorOrArtistName: art.stageName,
      isPinned: !!pin,
      pinnedAt: pin?.pinnedAt,
    });
  }

  return items;
}
