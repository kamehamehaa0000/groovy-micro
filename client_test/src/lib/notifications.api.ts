import { apiFetch } from "./api";

export type NotificationType =
  | "FOLLOW_REQUEST"
  | "FOLLOW_ACCEPTED"
  | "NEW_FOLLOWER"
  | "COMMENT_REPLY"
  | "COMMENT_MENTION"
  | "PLAYLIST_COMMENT"
  | "ARTIST_RELEASE"
  | "JAM_INVITE"
  | "TRANSCODE_COMPLETE"
  | "TRANSCODE_FAILED"
  | "SYSTEM_ALERT";

export type NotificationFilter =
  | "all"
  | "unread"
  | "social"
  | "comments"
  | "releases"
  | "system";

export interface NotificationResponseItem {
  id: string;
  recipientId: string;
  actor?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
  type: NotificationType;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  metadata?: {
    slug?: string;
    avatarUrl?: string;
    coverImageUrl?: string;
    jamCode?: string;
    commentId?: string;
    [key: string]: any;
  } | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsListResponse {
  notifications: NotificationResponseItem[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NotificationPreferences {
  emailReleases: boolean;
  emailComments: boolean;
  pushSocial: boolean;
  pushJams: boolean;
}

export const notificationsApi = {
  /**
   * Retrieves paginated notifications with optional category filtering.
   */
  async getNotifications(params?: {
    filter?: NotificationFilter;
    cursor?: string;
    limit?: number;
  }): Promise<NotificationsListResponse> {
    const query = new URLSearchParams();
    if (params?.filter) query.set("filter", params.filter);
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));

    const queryString = query.toString();
    const endpoint = `/api/v1/notifications${queryString ? `?${queryString}` : ""}`;
    return apiFetch<NotificationsListResponse>(endpoint);
  },

  /**
   * Retrieves lightweight unread count for the navigation bell badge (< 1ms from Redis).
   */
  async getUnreadCount(): Promise<{ count: number }> {
    return apiFetch<{ count: number }>("/api/v1/notifications/unread-count");
  },

  /**
   * Marks a single notification as read.
   */
  async markAsRead(id: string): Promise<{ success: boolean; notification: NotificationResponseItem }> {
    return apiFetch<{ success: boolean; notification: NotificationResponseItem }>(
      `/api/v1/notifications/${id}/read`,
      {
        method: "PATCH",
      }
    );
  },

  /**
   * Marks all unread notifications as read.
   */
  async markAllAsRead(): Promise<{ success: boolean; count: number }> {
    return apiFetch<{ success: boolean; count: number }>(
      "/api/v1/notifications/read-all",
      {
        method: "POST",
      }
    );
  },

  /**
   * Retrieves user notification preferences.
   */
  async getPreferences(): Promise<{ preferences: NotificationPreferences }> {
    return apiFetch<{ preferences: NotificationPreferences }>(
      "/api/v1/notifications/preferences"
    );
  },

  /**
   * Updates user notification preferences.
   */
  async updatePreferences(
    data: Partial<NotificationPreferences>
  ): Promise<{ preferences: NotificationPreferences }> {
    return apiFetch<{ preferences: NotificationPreferences }>(
      "/api/v1/notifications/preferences",
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  },
};
