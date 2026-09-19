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
  verified: boolean;
  verificationStatus: VerificationStatus;
  verificationDetails: VerificationDetails | null;
  rejectionReason: string | null;
  monthlyListeners: number;
  socialLinks: Record<string, string>;
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
  socialLinks?: Record<string, string>;
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

export interface SearchArtistsResponse {
  data: ArtistProfile[];
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
