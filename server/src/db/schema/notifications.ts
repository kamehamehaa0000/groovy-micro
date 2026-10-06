import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { notificationTypeEnum } from "./enums";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: notificationTypeEnum("type").notNull(),
    entityType: text("entity_type").notNull(), // 'album' | 'song' | 'playlist' | 'comment' | 'user' | 'jam' | 'system'
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<{
      slug?: string;
      avatarUrl?: string;
      coverImageUrl?: string;
      jamCode?: string;
      commentId?: string;
      actorName?: string;
      trackTitle?: string;
      artistName?: string;
      releaseTitle?: string;
      playlistTitle?: string;
      actionUrl?: string;
      [key: string]: any;
    }>(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_recipient_unread").on(
      table.recipientId,
      table.isRead,
      table.createdAt
    ),
    index("idx_notifications_recipient_created").on(
      table.recipientId,
      table.createdAt
    ),
  ]
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    emailReleases: boolean("email_releases").notNull().default(true),
    emailComments: boolean("email_comments").notNull().default(true),
    pushSocial: boolean("push_social").notNull().default(true),
    pushJams: boolean("push_jams").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
