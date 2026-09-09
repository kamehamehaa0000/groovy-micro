import { api } from "./api";
import { useAuthStore } from "../stores/auth.store";
import type {
  ArtistProfile,
  CreateArtistInput,
  UpdateArtistInput,
  RequestVerificationInput,
  AdminVerifyArtistInput,
  SearchArtistsResponse,
  AdminListArtistsResponse,
} from "../types/artist";

/**
 * Normalizes stage name into a URL-friendly slug for live form previews.
 */
export function slugifyText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const artistsApi = {
  /**
   * Instantly upgrades listener to ARTIST and establishes profile.
   * Immediately updates client auth store with fresh token and promoted role.
   */
  async createProfile(input: CreateArtistInput): Promise<{
    profile: ArtistProfile;
    user: any;
    accessToken: string;
  }> {
    const res = await api.post<{
      profile: ArtistProfile;
      user: any;
      accessToken: string;
    }>("/api/v1/artists", input);

    if (res.accessToken) {
      useAuthStore.getState().setAccessToken(res.accessToken);
    }
    // Re-sync user profile to get promoted role and fresh subscription data
    await useAuthStore.getState().refreshProfile();

    return res;
  },

  /**
   * Fetches logged-in artist's own profile and studio telemetry.
   */
  async getMyProfile(): Promise<ArtistProfile> {
    return await api.get<ArtistProfile>("/api/v1/artists/me");
  },

  /**
   * Updates artist's own profile.
   */
  async updateMyProfile(input: UpdateArtistInput): Promise<{ profile: ArtistProfile }> {
    return await api.patch<{ profile: ArtistProfile }>("/api/v1/artists/me", input);
  },

  /**
   * Submits verification application pitch and portfolio proof links.
   */
  async requestVerification(input: RequestVerificationInput): Promise<{
    message: string;
    profile: ArtistProfile;
  }> {
    return await api.post<{ message: string; profile: ArtistProfile }>(
      "/api/v1/artists/me/request-verification",
      input
    );
  },

  /**
   * Public dual lookup by either UUID or custom vanity slug.
   */
  async getByIdOrSlug(idOrSlug: string): Promise<ArtistProfile> {
    return await api.get<ArtistProfile>(`/api/v1/artists/${encodeURIComponent(idOrSlug)}`);
  },

  /**
   * Search and browse artist roster with pagination.
   */
  async searchArtists(params?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<SearchArtistsResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());

    const qs = query.toString();
    return await api.get<SearchArtistsResponse>(`/api/v1/artists${qs ? `?${qs}` : ""}`);
  },

  /**
   * Follow an artist.
   */
  async follow(artistId: string): Promise<{ following: boolean; followersCount: number }> {
    return await api.post<{ following: boolean; followersCount: number }>(
      `/api/v1/artists/${artistId}/follow`
    );
  },

  /**
   * Unfollow an artist.
   */
  async unfollow(artistId: string): Promise<{ following: boolean; followersCount: number }> {
    return await api.delete<{ following: boolean; followersCount: number }>(
      `/api/v1/artists/${artistId}/follow`
    );
  },

  /**
   * Check if current user follows an artist.
   */
  async checkFollowing(artistId: string): Promise<{ isFollowing: boolean }> {
    return await api.get<{ isFollowing: boolean }>(
      `/api/v1/artists/${artistId}/following`
    );
  },

  /**
   * Upload an artist banner image to Cloudflare R2 via presigned PUT.
   */
  async uploadBanner(artistId: string, file: File): Promise<string> {
    const ext = file.name.split(".").pop() || "webp";

    // 1. Get presigned upload URL
    const presigned = await api.post<{
      uploadUrl: string;
      storageKey: string;
      publicUrl: string;
    }>("/api/v1/storage/presigned-url", {
      category: "ARTIST_BANNER",
      resourceId: artistId,
      mimeType: file.type || "image/webp",
      fileExtension: ext,
      fileSizeBytes: file.size,
    });

    // 2. Direct PUT upload to Cloudflare R2
    const uploadRes = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "image/webp",
      },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload banner to R2 (Status: ${uploadRes.status})`);
    }

    // 3. Update artist profile with the new public CDN URL
    await this.updateMyProfile({ bannerUrl: presigned.publicUrl });

    return presigned.publicUrl;
  },

  /**
   * Admin: List artists filtered by verification status.
   */
  async adminListArtists(params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<AdminListArtistsResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());

    const qs = query.toString();
    return await api.get<AdminListArtistsResponse>(
      `/api/v1/admin/artists${qs ? `?${qs}` : ""}`
    );
  },

  /**
   * Admin: Approve or reject verification application.
   */
  async adminVerify(
    artistId: string,
    input: AdminVerifyArtistInput
  ): Promise<{
    id: string;
    verified: boolean;
    verificationStatus: string;
    rejectionReason: string | null;
  }> {
    return await api.patch(
      `/api/v1/admin/artists/${artistId}/verify`,
      input
    );
  },
};
