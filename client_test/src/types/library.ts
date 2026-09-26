export type LibraryFilterType =
  | "all"
  | "playlists"
  | "albums"
  | "eps"
  | "lps"
  | "singles"
  | "artists"
  | "collection";

export type LibrarySortType = "recent" | "alphabetical" | "creator";

export type LibraryViewMode = "list" | "grid";

export type LibraryItemKind =
  | "liked_songs"
  | "personal_collection"
  | "playlist"
  | "album"
  | "artist";

export interface UnifiedLibraryItem {
  id: string; // Unique string key for React lists, e.g. "special:liked_songs", "playlist:uuid"
  kind: LibraryItemKind;
  itemId: string;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  isRoundImage?: boolean; // For artists
  linkTo: string;
  addedAt: string; // ISO date for sorting
  creatorOrArtistName: string;
  isPinned: boolean;
  pinnedAt?: string;
  releaseType?: "ALBUM" | "EP" | "SINGLE" | "MIXTAPE" | "LP";
  tracksCount?: number;
  isOwner?: boolean;
}
