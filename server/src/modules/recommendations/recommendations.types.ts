export interface TasteProfile {
  topGenres: { genre: string; weight: number }[];
  topMoods: { mood: string; weight: number }[];
  avgBpm: number | null;
  avgEnergy: number | null;
  totalSignals: number;
}

export interface ScoredRecommendationTrack {
  id: string;
  title: string;
  slug: string;
  artistId: string;
  artistStageName: string;
  artistSlug: string;
  artistVerified: boolean;
  albumId: string | null;
  albumTitle: string | null;
  albumSlug?: string | null;
  albumType?: string | null;
  coverImageUrl: string | null;
  durationSeconds: number;
  audioUrl?: string | null;
  hlsManifestUrl?: string | null;
  primaryGenre: string | null;
  subGenre: string | null;
  moods: string[];
  bpm: number | null;
  energy: number | null;
  playsCount: number;
  likesCount: number;
  isLiked?: boolean;
  score?: number;
  recommendationReason: string;
}

export interface RadioMixCard {
  id: string;
  seedSongId: string;
  seedSongTitle: string;
  seedArtistName: string;
  title: string;
  subtitle: string;
  coverImageUrl: string | null;
  primaryGenre: string | null;
  trackCount: number;
  previewTracks: ScoredRecommendationTrack[];
}

export interface UserPlaylistSummary {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  totalTracks: number;
  ownerName: string;
  isOwner: boolean;
}

export interface SimilarArtistCard {
  id: string;
  stageName: string;
  slug: string;
  avatarUrl: string | null;
  verified: boolean;
  monthlyListeners: number;
  primaryGenre: string | null;
  scope: "GLOBAL" | "PERSONAL";
}

export type RecommendationScopeMode = "UNAUTHORIZED" | "GLOBAL_ONLY" | "MIXED";

export interface RecommendationContext {
  userId?: string | null;
  mode: RecommendationScopeMode;
  includePersonal: boolean;
}

export interface PersonalizedHomeFeed {
  tasteProfile: TasteProfile;
  newReleasesForYou: any[];
  artistRadar: any[];
  globalHits: ScoredRecommendationTrack[];
  similarArtists: {
    seedArtist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
    artists: SimilarArtistCard[];
  } | null;
  moreLikeArtist?: {
    artist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
    tracks: ScoredRecommendationTrack[];
  } | null;
  moreLikeSong: {
    seedSong: ScoredRecommendationTrack | null;
    tracks: ScoredRecommendationTrack[];
  } | null;
  userPlaylists: UserPlaylistSummary[];
  radioMixes: RadioMixCard[];
  heavyRotation: ScoredRecommendationTrack[];
  forYou: ScoredRecommendationTrack[];
  playlistAssisted: ScoredRecommendationTrack[];
  forgottenFavorites: ScoredRecommendationTrack[];
}

