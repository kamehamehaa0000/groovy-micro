export type AlbumType = "ALBUM" | "SINGLE" | "EP" | "MIXTAPE" | "LP";

export type ReleaseStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
export type ReleaseVisibility = "PUBLIC" | "UNLISTED" | "PRIVATE";

export type CreditRole =
  | "PRIMARY"
  | "FEATURED"
  | "PRODUCER"
  | "COMPOSER"
  | "LYRICIST"
  | "ENGINEER"
  | "MIX_AND_MASTER"
  | "OTHER";

export interface SongCredit {
  songId?: string;
  artistId: string;
  stageName: string;
  slug: string;
  verified: boolean;
  role: CreditRole;
}

export interface SongCreditInput {
  artistId: string;
  role?: CreditRole;
}

export interface InitialTrackInput {
  title: string;
  slug?: string;
  genre?: string;
  durationSeconds?: number;
  trackNumber?: number;
  discNumber?: number;
  isExplicit?: boolean;
  rawAudioKey?: string;
  audioUrl?: string;
  coverImageUrl?: string;
  credits?: SongCreditInput[];
}

export interface CreateAlbumInput {
  title: string;
  slug?: string;
  albumType?: AlbumType;
  visibility?: ReleaseVisibility;
  scheduledReleaseAt?: string | null;
  coverImageUrl: string;
  description?: string;
  genre?: string | null;
  releaseDate?: string;
  allowComments?: boolean;
  tracks?: InitialTrackInput[];
}

export interface UpdateAlbumInput {
  title?: string;
  slug?: string;
  albumType?: AlbumType;
  visibility?: ReleaseVisibility;
  scheduledReleaseAt?: string | null;
  coverImageUrl?: string;
  description?: string | null;
  genre?: string | null;
  releaseDate?: string;
  allowComments?: boolean;
}

export interface CreateSongInput {
  title: string;
  slug?: string;
  albumId?: string | null;
  genre?: string;
  durationSeconds?: number;
  trackNumber?: number;
  discNumber?: number;
  isExplicit?: boolean;
  rawAudioKey?: string;
  audioUrl?: string;
  coverImageUrl?: string | null;
  allowComments?: boolean;
  credits?: SongCreditInput[];
}

export interface UpdateSongInput {
  title?: string;
  slug?: string;
  albumId?: string | null;
  genre?: string | null;
  durationSeconds?: number;
  trackNumber?: number | null;
  discNumber?: number;
  isExplicit?: boolean;
  allowComments?: boolean;
  rawAudioKey?: string | null;
  audioUrl?: string | null;
  coverImageUrl?: string | null;
  credits?: SongCreditInput[];
}

export interface Song {
  id: string;
  artistId: string;
  albumId: string | null;
  title: string;
  slug: string;
  genre: string | null;
  durationSeconds: number;
  trackNumber: number | null;
  discNumber: number;
  isExplicit: boolean;
  rawAudioKey: string | null;
  audioUrl: string | null;
  coverImageUrl?: string | null;
  hlsManifestUrl: string | null;
  processingStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  playsCount: number;
  likesCount: number;
  allowComments?: boolean;
  isStreamable?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface EnrichedSong extends Song {
  isLiked?: boolean;
  credits?: SongCredit[];
  artistStageName?: string;
  artistSlug?: string;
  artistVerified?: boolean;
  albumTitle?: string | null;
  albumSlug?: string | null;
  albumCoverImageUrl?: string | null;
  scheduledReleaseAt?: string | null;
}

export interface Album {
  id: string;
  artistId: string;
  title: string;
  slug: string;
  albumType: AlbumType;
  coverImageUrl: string;
  description: string | null;
  genre?: string | null;
  releaseDate: string;
  status?: ReleaseStatus;
  visibility?: ReleaseVisibility;
  allowComments?: boolean;
  scheduledReleaseAt?: string | null;
  publishedAt?: string | null;
  shareToken?: string | null;
  preSavesCount?: number;
  likesCount: number;
  totalTracks: number;
  totalDurationSeconds: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AlbumDetail extends Album {
  artistStageName: string;
  artistSlug: string;
  artistVerified: boolean;
  artistBannerUrl?: string | null;
  isLiked?: boolean;
  isUpcoming?: boolean;
  isPreSaved?: boolean;
  tracks: EnrichedSong[];
}

export interface PreSavedRelease {
  albumId: string;
  title: string;
  slug: string;
  albumType: AlbumType;
  coverImageUrl: string;
  scheduledReleaseAt: string | null;
  releaseDate: string;
  totalTracks: number;
  totalDurationSeconds: number;
  preSavedAt: string;
  artistStageName: string;
  artistSlug: string;
  artistVerified: boolean;
}

export interface AppearsOnCredit {
  songId: string;
  role: CreditRole;
  songTitle: string;
  songSlug: string;
  songDuration: number;
  audioUrl: string | null;
  primaryArtistName: string;
  primaryArtistSlug: string;
}

export interface PersonalCollectionTrack {
  id: string;
  title: string;
  slug: string;
  durationSeconds: number;
  audioUrl: string | null;
  hlsManifestUrl: string | null;
  rawAudioKey: string | null;
  coverImageUrl: string | null;
  playsCount: number;
  likesCount: number;
  albumTitle: string | null;
  artistName: string;
  scope: string;
  isPersonal: boolean;
  isStreamable: boolean;
}

export interface DiscographyResponse {
  artist: {
    id: string;
    stageName: string;
  };
  upcoming?: (Album & { isUpcoming?: boolean; isPreSaved?: boolean })[];
  albums: Album[];
  eps: Album[];
  singles: Album[];
  mixtapes?: Album[];
  topTracks: EnrichedSong[];
  appearsOn: AppearsOnCredit[];
  inYourCollection?: PersonalCollectionTrack[];
}

export interface StudioReleasesResponse {
  artist: {
    id: string;
    stageName: string;
  };
  albums: Album[];
  songs: Song[];
}

export interface SearchAlbumsResponse {
  data: (Album & { artistStageName?: string; artistSlug?: string })[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SearchSongsResponse {
  data: EnrichedSong[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
