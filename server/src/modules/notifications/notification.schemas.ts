import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "FOLLOW_REQUEST",
  "FOLLOW_ACCEPTED",
  "NEW_FOLLOWER",
  "COMMENT_REPLY",
  "COMMENT_MENTION",
  "PLAYLIST_COMMENT",
  "ARTIST_RELEASE",
  "JAM_INVITE",
  "TRANSCODE_COMPLETE",
  "TRANSCODE_FAILED",
  "SYSTEM_ALERT",
]);

export const getNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  filter: z
    .enum(["all", "unread", "social", "comments", "releases", "system"])
    .default("all"),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});

export const updateNotificationPreferencesSchema = z.object({
  emailReleases: z.boolean().optional(),
  emailComments: z.boolean().optional(),
  pushSocial: z.boolean().optional(),
  pushJams: z.boolean().optional(),
});

export type GetNotificationsQuery = z.infer<typeof getNotificationsQuerySchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
export type UpdateNotificationPreferences = z.infer<
  typeof updateNotificationPreferencesSchema
>;

export interface CreateNotificationInput {
  recipientId: string;
  actorId?: string | null;
  type: z.infer<typeof notificationTypeSchema>;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

export interface NotificationResponseItem {
  id: string;
  recipientId: string;
  actor?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
  type: z.infer<typeof notificationTypeSchema>;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  metadata?: Record<string, any> | null;
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
