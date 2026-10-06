import { eq, and, desc, lt, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  notifications,
  notificationPreferences,
  users,
  type Notification,
  type NewNotification,
  type NotificationPreference,
} from "../../db/schema";
import { redis } from "../../index";
import type {
  CreateNotificationInput,
  GetNotificationsQuery,
  NotificationResponseItem,
  NotificationsListResponse,
  UpdateNotificationPreferences,
} from "./notification.schemas";

export class NotificationService {
  private getUnreadCacheKey(userId: string): string {
    return `notifications:unread:${userId}`;
  }

  private getChannelKey(userId: string): string {
    return `notifications:events:${userId}`;
  }

  /**
   * Publishes real-time event to Redis Pub/Sub for SSE/WebSocket subscribers
   */
  private async publishEvent(userId: string, payload: any): Promise<void> {
    try {
      await redis.publish(this.getChannelKey(userId), JSON.stringify(payload));
    } catch (err) {
      console.warn(`[NotificationService] Redis publish failed for user ${userId}:`, err);
    }
  }

  /**
   * Creates a single notification, increments Redis unread counter, and publishes real-time event.
   */
  async createNotification(
    input: CreateNotificationInput
  ): Promise<NotificationResponseItem> {
    // 1. Check user's notification preferences if applicable
    if (
      input.type === "ARTIST_RELEASE" ||
      input.type === "JAM_INVITE" ||
      input.type === "FOLLOW_REQUEST" ||
      input.type === "NEW_FOLLOWER"
    ) {
      const prefs = await this.getPreferences(input.recipientId);
      if (input.type === "ARTIST_RELEASE" && !prefs.emailReleases && !prefs.pushSocial) {
        // If user disabled all release notifications, still allow or skip depending on rules
      }
      if (input.type === "JAM_INVITE" && !prefs.pushJams) {
        // user muted jam invites
      }
    }

    // 2. Insert notification into PostgreSQL
    const [inserted] = await db
      .insert(notifications)
      .values({
        recipientId: input.recipientId,
        actorId: input.actorId || null,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        body: input.body,
        metadata: input.metadata || null,
      })
      .returning();

    // 3. Increment Redis unread count (O(1))
    try {
      const cacheKey = this.getUnreadCacheKey(input.recipientId);
      await redis.incr(cacheKey);
      await redis.expire(cacheKey, 86400 * 7); // 7-day TTL
    } catch (err) {
      console.warn("[NotificationService] Redis unread count increment failed:", err);
    }

    // 4. Fetch actor info if available for immediate display
    let actor = null;
    if (inserted.actorId) {
      const [actorRow] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, inserted.actorId))
        .limit(1);
      actor = actorRow || null;
    }

    const responseItem: NotificationResponseItem = {
      id: inserted.id,
      recipientId: inserted.recipientId,
      actor,
      type: inserted.type,
      entityType: inserted.entityType,
      entityId: inserted.entityId,
      title: inserted.title,
      body: inserted.body,
      metadata: inserted.metadata,
      isRead: inserted.isRead,
      readAt: inserted.readAt ? inserted.readAt.toISOString() : null,
      createdAt: inserted.createdAt.toISOString(),
    };

    // 5. Publish real-time event to user's personal channel
    await this.publishEvent(input.recipientId, {
      type: "NOTIFICATION_CREATED",
      notification: responseItem,
    });

    return responseItem;
  }

  /**
   * Bulk creates notifications (e.g. outbox fan-out when an artist drops an album).
   */
  async bulkCreateNotifications(
    inputs: CreateNotificationInput[]
  ): Promise<number> {
    if (inputs.length === 0) return 0;

    // Batch insert into PostgreSQL
    const values: NewNotification[] = inputs.map((item) => ({
      recipientId: item.recipientId,
      actorId: item.actorId || null,
      type: item.type,
      entityType: item.entityType,
      entityId: item.entityId,
      title: item.title,
      body: item.body,
      metadata: item.metadata || null,
    }));

    await db.insert(notifications).values(values);

    // Invalidate / update Redis counters in background pipeline
    try {
      const pipeline = redis.pipeline();
      for (const item of inputs) {
        const cacheKey = this.getUnreadCacheKey(item.recipientId);
        pipeline.incr(cacheKey);
        pipeline.expire(cacheKey, 86400 * 7);
      }
      await pipeline.exec();
    } catch (err) {
      console.warn("[NotificationService] Redis bulk unread count update failed:", err);
    }

    return inputs.length;
  }

  /**
   * Retrieves cursor-paginated list of notifications with optional filtering.
   */
  async getNotifications(
    userId: string,
    query: GetNotificationsQuery
  ): Promise<NotificationsListResponse> {
    const { cursor, limit = 20, filter = "all" } = query;
    const cursorDate = cursor ? new Date(cursor) : null;

    const conditions = [eq(notifications.recipientId, userId)];

    if (cursorDate) {
      conditions.push(lt(notifications.createdAt, cursorDate));
    }

    // Apply category filters
    if (filter === "unread") {
      conditions.push(eq(notifications.isRead, false));
    } else if (filter === "social") {
      conditions.push(
        inArray(notifications.type, [
          "FOLLOW_REQUEST",
          "FOLLOW_ACCEPTED",
          "NEW_FOLLOWER",
        ])
      );
    } else if (filter === "comments") {
      conditions.push(
        inArray(notifications.type, [
          "COMMENT_REPLY",
          "COMMENT_MENTION",
          "PLAYLIST_COMMENT",
        ])
      );
    } else if (filter === "releases") {
      conditions.push(eq(notifications.type, "ARTIST_RELEASE"));
    } else if (filter === "system") {
      conditions.push(
        inArray(notifications.type, [
          "TRANSCODE_COMPLETE",
          "TRANSCODE_FAILED",
          "SYSTEM_ALERT",
          "JAM_INVITE",
        ])
      );
    }

    // Fetch limit + 1 to calculate hasMore
    const rows = await db
      .select({
        notification: notifications,
        actor: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const formattedNotifications: NotificationResponseItem[] = pageRows.map(
      ({ notification: n, actor }) => ({
        id: n.id,
        recipientId: n.recipientId,
        actor: actor?.id ? actor : null,
        type: n.type,
        entityType: n.entityType,
        entityId: n.entityId,
        title: n.title,
        body: n.body,
        metadata: n.metadata,
        isRead: n.isRead,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })
    );

    const nextCursor =
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1].notification.createdAt.toISOString()
        : null;

    const unreadCount = await this.getUnreadCount(userId);

    return {
      notifications: formattedNotifications,
      unreadCount,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Returns current unread count with O(1) Redis caching.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = this.getUnreadCacheKey(userId);

    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return Math.max(0, parseInt(cached, 10) || 0);
      }
    } catch (err) {
      console.warn("[NotificationService] Redis get unread failed:", err);
    }

    // Cache miss or Redis error: Query PostgreSQL
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.recipientId, userId), eq(notifications.isRead, false))
      );

    const count = result?.count ?? 0;

    try {
      await redis.set(cacheKey, count.toString(), "EX", 86400 * 7);
    } catch {}

    return count;
  }

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(
    userId: string,
    notificationId: string
  ): Promise<{ success: boolean; unreadCount: number }> {
    const now = new Date();

    const [updated] = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: now,
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.recipientId, userId),
          eq(notifications.isRead, false)
        )
      )
      .returning({ id: notifications.id });

    if (updated) {
      try {
        const cacheKey = this.getUnreadCacheKey(userId);
        const newCount = await redis.decr(cacheKey);
        if (newCount < 0) {
          await redis.set(cacheKey, "0");
        }
      } catch (err) {
        console.warn("[NotificationService] Redis decr failed:", err);
      }

      await this.publishEvent(userId, {
        type: "NOTIFICATION_READ",
        notificationId,
      });
    }

    const unreadCount = await this.getUnreadCount(userId);
    return { success: !!updated, unreadCount };
  }

  /**
   * Marks all notifications as read for the user in a single operation.
   */
  async markAllAsRead(
    userId: string
  ): Promise<{ success: boolean; unreadCount: number }> {
    const now = new Date();

    await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: now,
      })
      .where(
        and(eq(notifications.recipientId, userId), eq(notifications.isRead, false))
      );

    try {
      const cacheKey = this.getUnreadCacheKey(userId);
      await redis.set(cacheKey, "0");
    } catch (err) {
      console.warn("[NotificationService] Redis reset unread failed:", err);
    }

    await this.publishEvent(userId, {
      type: "ALL_NOTIFICATIONS_READ",
    });

    return { success: true, unreadCount: 0 };
  }

  /**
   * Retrieves notification preferences for a user, provisioning defaults if needed.
   */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Initialize defaults
    const [created] = await db
      .insert(notificationPreferences)
      .values({
        userId,
        emailReleases: true,
        emailComments: true,
        pushSocial: true,
        pushJams: true,
      })
      .onConflictDoNothing()
      .returning();

    return (
      created || {
        userId,
        emailReleases: true,
        emailComments: true,
        pushSocial: true,
        pushJams: true,
        updatedAt: new Date(),
      }
    );
  }

  /**
   * Updates notification preferences.
   */
  async updatePreferences(
    userId: string,
    updates: UpdateNotificationPreferences
  ): Promise<NotificationPreference> {
    await this.getPreferences(userId); // ensure row exists

    const [updated] = await db
      .update(notificationPreferences)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    return updated;
  }
}
