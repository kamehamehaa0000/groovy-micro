export type VerificationStatus = "NONE" | "PENDING" | "VERIFIED" | "REJECTED";

export interface VerificationDetails {
  message?: string;
  contactEmail?: string;
  contactPhone?: string;
  links?: string[];
  requestedAt?: string;
}

export interface ArtistProfile {
  id: string;
  userId?: string | null;
  ownerUserId?: string | null;
  scope?: "GLOBAL" | "PERSONAL";
  stageName: string;
  slug: string;
  bio: string | null;
  bannerUrl: string | null;
  avatarUrl?: string | null;
  verified: boolean;
  verificationStatus: VerificationStatus;
  verificationDetails: VerificationDetails | null;
  rejectionReason: string | null;
  monthlyListeners: number;
  socialLinks: Record<string, string>;
  pinnedReleaseId?: string | null;
  pinnedComment?: string | null;
  followersCount?: number;
  isFollowing?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminArtistListItem extends ArtistProfile {
  ownerEmail: string;
  ownerDisplayName: string;
}

export interface CreateArtistInput {
  stageName: string;
  slug?: string;
  bio?: string;
  socialLinks?: Record<string, string>;
}

export interface UpdateArtistInput {
  stageName?: string;
  slug?: string;
  bio?: string | null;
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  socialLinks?: Record<string, string>;
  pinnedReleaseId?: string | null;
  pinnedComment?: string | null;
}

export interface RequestVerificationInput {
  message: string;
  contactEmail?: string;
  contactPhone?: string;
  links: string[];
}

export type AdminVerifyArtistInput =
  | { status: "VERIFIED"; reason?: never }
  | { status: "REJECTED"; reason: string };

/** Lean row returned by the public artist directory search. */
export interface ArtistSummary {
  id: string;
  stageName: string;
  slug: string;
  bannerUrl: string | null;
  avatarUrl?: string | null;
  verified: boolean;
  monthlyListeners: number;
  scope?: "GLOBAL" | "PERSONAL";
  ownerUserId?: string | null;
  createdAt: string;
  isFollowing?: boolean;
}

export interface SearchArtistsResponse {
  data: ArtistSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminListArtistsResponse {
  data: AdminArtistListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
