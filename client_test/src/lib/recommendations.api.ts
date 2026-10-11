import { api } from "./api";

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
  heavyRotation?: ScoredRecommendationTrack[];
  forYou?: ScoredRecommendationTrack[];
  playlistAssisted?: ScoredRecommendationTrack[];
  forgottenFavorites?: ScoredRecommendationTrack[];
}

export const recommendationsApi = {
  /**
   * Retrieves user's complete consolidated personalized feed in a single request.
   */
  getHomeFeed: async (): Promise<PersonalizedHomeFeed> => {
    const res = await api.get<{ feed: PersonalizedHomeFeed }>("/api/v1/recommendations/home");
    return res.feed;
  },

  /**
   * Retrieves user's computed sonic taste profile (top genres, moods, BPM/energy).
   */
  getTasteProfile: async (): Promise<TasteProfile> => {
    const res = await api.get<{ profile: TasteProfile }>("/api/v1/recommendations/taste-profile");
    return res.profile;
  },

  /**
   * Retrieves new releases matching user's taste.
   */
  getNewReleases: async (limit: number = 8): Promise<any[]> => {
    const res = await api.get<{ releases: any[] }>(
      `/api/v1/recommendations/new-releases?limit=${limit}`
    );
    return res.releases;
  },

  /**
   * Retrieves new releases from followed artists dropped in the last 6 months.
   */
  getArtistRadar: async (limit: number = 8): Promise<any[]> => {
    const res = await api.get<{ releases: any[] }>(
      `/api/v1/recommendations/radar?limit=${limit}`
    );
    return res.releases;
  },

  /**
   * Retrieves global hits matching user's taste.
   */
  getGlobalHits: async (limit: number = 8): Promise<ScoredRecommendationTrack[]> => {
    const res = await api.get<{ tracks: ScoredRecommendationTrack[] }>(
      `/api/v1/recommendations/global-hits?limit=${limit}`
    );
    return res.tracks;
  },

  /**
   * Retrieves artists similar to user's top-played artist.
   */
  getSimilarArtists: async (limit: number = 8) => {
    const res = await api.get<{
      seedArtist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
      artists: SimilarArtistCard[];
    }>(`/api/v1/recommendations/similar-artists?limit=${limit}`);
    return res;
  },

  /**
   * Retrieves recommendations similar to user's top-played artist.
   */
  getMoreLikeArtist: async (limit: number = 8) => {
    const res = await api.get<{
      artist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
      tracks: ScoredRecommendationTrack[];
    }>(`/api/v1/recommendations/more-like-artist?limit=${limit}`);
    return res;
  },

  /**
   * Retrieves tracks similar to user's top-played song.
   */
  getMoreLikeSong: async (limit: number = 8) => {
    const res = await api.get<{
      seedSong: ScoredRecommendationTrack | null;
      tracks: ScoredRecommendationTrack[];
    }>(`/api/v1/recommendations/more-like-song?limit=${limit}`);
    return res;
  },

  /**
   * Retrieves user's created and saved playlists.
   */
  getUserPlaylists: async (limit: number = 8): Promise<UserPlaylistSummary[]> => {
    const res = await api.get<{ playlists: UserPlaylistSummary[] }>(
      `/api/v1/recommendations/user-playlists?limit=${limit}`
    );
    return res.playlists;
  },

  /**
   * Retrieves 5 dynamic radio mixes seeded from user's top rotation.
   */
  getRadioMixes: async (): Promise<RadioMixCard[]> => {
    const res = await api.get<{ mixes: RadioMixCard[] }>(
      `/api/v1/recommendations/radio-mixes`
    );
    return res.mixes;
  },

  /**
   * Retrieves user's repeat tracks with high completion rate.
   */
  getHeavyRotation: async (limit: number = 8): Promise<ScoredRecommendationTrack[]> => {
    const res = await api.get<{ tracks: ScoredRecommendationTrack[] }>(
      `/api/v1/recommendations/heavy-rotation?limit=${limit}`
    );
    return res.tracks;
  },

  /**
   * Retrieves content-based discovery candidates matching user's taste.
   */
  getRecommendedForYou: async (limit: number = 10): Promise<ScoredRecommendationTrack[]> => {
    const res = await api.get<{ tracks: ScoredRecommendationTrack[] }>(
      `/api/v1/recommendations/for-you?limit=${limit}`
    );
    return res.tracks;
  },

  /**
   * Retrieves playlist-assisted recommendations.
   */
  getPlaylistAssisted: async (limit: number = 8): Promise<ScoredRecommendationTrack[]> => {
    const res = await api.get<{ tracks: ScoredRecommendationTrack[] }>(
      `/api/v1/recommendations/playlist-assisted?limit=${limit}`
    );
    return res.tracks;
  },

  /**
   * Retrieves forgotten favorites.
   */
  getForgottenFavorites: async (limit: number = 8): Promise<ScoredRecommendationTrack[]> => {
    const res = await api.get<{ tracks: ScoredRecommendationTrack[] }>(
      `/api/v1/recommendations/forgotten?limit=${limit}`
    );
    return res.tracks;
  },

  /**
   * Retrieves infinite track radio matching the seed song.
   */
  getTrackRadio: async (
    songId: string,
    limit: number = 20
  ): Promise<{
    seedSong: ScoredRecommendationTrack | null;
    tracks: ScoredRecommendationTrack[];
  }> => {
    const res = await api.get<{
      seedSong?: ScoredRecommendationTrack | null;
      tracks: ScoredRecommendationTrack[];
    }>(`/api/v1/recommendations/radio/${songId}?limit=${limit}`);
    return {
      seedSong: res.seedSong || null,
      tracks: res.tracks || [],
    };
  },
};



