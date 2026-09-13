import { apiFetch } from "./api";

export type RelationshipStatus =
  | "SELF"
  | "NONE"
  | "PENDING_SENT"
  | "PENDING_RECEIVED"
  | "FOLLOWING"
  | "FRIENDS";

export interface IncomingFollowRequest {
  requesterId: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  isPrivateAccount: boolean;
  relationship: RelationshipStatus;
}

export interface PrivacySettings {
  isPrivateAccount: boolean;
  listeningActivityPrivacy: "FRIENDS_ONLY" | "FOLLOWERS" | "OFF";
  libraryPrivacy: "PUBLIC" | "FOLLOWERS_ONLY" | "PRIVATE";
}

export type FeedItemType =
  | "NEW_RELEASE"
  | "PLAYLIST_CREATED"
  | "PLAYLIST_SAVED"
  | "SONG_LIKED";

export interface FeedActor {
  id: string;
  name: string;
  avatarUrl?: string | null;
  slug?: string | null;
  isArtist: boolean;
}

export interface FeedTarget {
  id: string;
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  slug?: string | null;
  type: "album" | "playlist" | "song";
  durationSeconds?: number;
  tracksCount?: number;
  audioUrl?: string | null;
  isExplicit?: boolean;
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: string;
  actor: FeedActor;
  target: FeedTarget;
}

export interface SocialFeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const socialApi = {
  /**
   * Follows a user or submits a pending follow request if target is private.
   */
  async followUser(targetUserId: string): Promise<{
    status: "ACCEPTED" | "PENDING";
    alreadyFollowing?: boolean;
    alreadyPending?: boolean;
    isPrivateAccount: boolean;
    isMutualFriend: boolean;
  }> {
    return apiFetch(`/api/v1/social/users/${targetUserId}/follow`, {
      method: "POST",
    });
  },

  /**
   * Unfollows a user or revokes an outgoing follow request.
   */
  async unfollowUser(targetUserId: string): Promise<{ success: boolean }> {
    return apiFetch(`/api/v1/social/users/${targetUserId}/follow`, {
      method: "DELETE",
    });
  },

  /**
   * Retrieves granular relationship between current user and target user.
   */
  async getRelationship(targetUserId: string): Promise<{ status: RelationshipStatus }> {
    return apiFetch(`/api/v1/social/users/${targetUserId}/relationship`);
  },

  /**
   * Retrieves pending incoming follow requests.
   */
  async getIncomingRequests(): Promise<{ requests: IncomingFollowRequest[] }> {
    return apiFetch("/api/v1/social/requests/incoming");
  },

  /**
   * Accepts a pending follow request.
   */
  async acceptRequest(requesterId: string): Promise<{
    success: boolean;
    status: "ACCEPTED";
    isMutualFriend: boolean;
  }> {
    return apiFetch(`/api/v1/social/requests/${requesterId}/accept`, {
      method: "POST",
    });
  },

  /**
   * Rejects a pending follow request.
   */
  async rejectRequest(requesterId: string): Promise<{ success: boolean }> {
    return apiFetch(`/api/v1/social/requests/${requesterId}/reject`, {
      method: "POST",
    });
  },

  /**
   * Retrieves mutual friends (two-way accepted follows).
   */
  async getFriends(): Promise<{ friends: UserSummary[] }> {
    return apiFetch("/api/v1/social/friends");
  },

  /**
   * Searches for community members with live relationship enrichment.
   */
  async searchUsers(query?: string, limit = 20): Promise<{ users: UserSummary[] }> {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    params.set("limit", limit.toString());

    return apiFetch(`/api/v1/social/users/search?${params.toString()}`);
  },

  /**
   * Updates privacy preferences (private account, listening activity, library privacy).
   */
  async updatePrivacySettings(
    settings: Partial<PrivacySettings>
  ): Promise<{ settings: PrivacySettings }> {
    return apiFetch("/api/v1/users/privacy-settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  },

  /**
   * Retrieves aggregated chronological social activity feed.
   */
  async getFeed(params?: {
    cursor?: string;
    limit?: number;
    filter?: "all" | "releases" | "playlists" | "friends";
  }): Promise<SocialFeedResponse> {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.filter) searchParams.set("filter", params.filter);

    const query = searchParams.toString();
    return apiFetch(`/api/v1/social/feed${query ? `?${query}` : ""}`);
  },
};
