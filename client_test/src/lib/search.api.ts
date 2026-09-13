import { apiFetch } from "./api";

export interface SearchSongItem {
  id: string;
  title: string;
  slug: string;
  durationSeconds: number;
  audioUrl: string | null;
  coverImageUrl: string | null;
  isExplicit: boolean;
  artistId: string;
  artistName: string;
  artistSlug: string;
  albumId: string | null;
  albumTitle: string | null;
  playsCount: number;
}

export interface SearchAlbumItem {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  albumType: string;
  releaseDate: string;
  isReleased: boolean;
  artistId: string;
  artistName: string;
  artistSlug: string;
  likesCount: number;
}

export interface SearchArtistItem {
  id: string;
  stageName: string;
  slug: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  verified: boolean;
  monthlyListeners: number;
}

export interface SearchPlaylistItem {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  savesCount: number;
  ownerId: string;
  ownerName: string;
  tracksCount: number;
}

export interface SearchUserItem {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  isPrivateAccount: boolean;
}

export interface TopSearchResult {
  type: "song" | "album" | "artist" | "playlist" | "user";
  item:
    | SearchSongItem
    | SearchAlbumItem
    | SearchArtistItem
    | SearchPlaylistItem
    | SearchUserItem;
}

export interface GlobalSearchResponse {
  query: string;
  topResult: TopSearchResult | null;
  songs: SearchSongItem[];
  albums: SearchAlbumItem[];
  artists: SearchArtistItem[];
  playlists: SearchPlaylistItem[];
  users: SearchUserItem[];
}

export const searchApi = {
  async search(
    query: string,
    limit = 5,
    type: "all" | "songs" | "albums" | "artists" | "playlists" | "users" = "all"
  ): Promise<GlobalSearchResponse> {
    const params = new URLSearchParams({
      q: query.trim(),
      limit: limit.toString(),
      type,
    });
    return apiFetch<GlobalSearchResponse>(`/api/v1/search?${params.toString()}`);
  },
};
