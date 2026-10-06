import { isNull, sql, and, lt, eq } from "drizzle-orm";
import { db } from "../../db";
import { outboxEvents, artistFollowers, albums, artistProfiles } from "../../db/schema";
import { enqueueTranscodeJob, type TranscodeJobData } from "./transcode.queue";
import { NotificationService } from "../../modules/notifications/notification.service";

const notificationService = new NotificationService();

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

/**
 * Polls the outbox_events table for any unpublished events older than 5 seconds
 * (acting as the safety net if the fast-path dispatch failed or crashed).
 */
export async function sweepOutboxEvents(): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  try {
    const fiveSecondsAgo = new Date(Date.now() - 5000);

    // Fetch up to 50 pending events
    const pendingEvents = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.publishedAt),
          lt(outboxEvents.createdAt, fiveSecondsAgo)
        )
      )
      .limit(50);

    let processedCount = 0;

    for (const event of pendingEvents) {
      try {
        if (event.eventType === "SONG_UPLOADED") {
          const payload = event.payload as TranscodeJobData;
          if (payload && payload.songId && payload.rawAudioKey) {
            await enqueueTranscodeJob(payload);
          }
        } else if (event.eventType === "album.released") {
          const payload = event.payload as any;
          if (payload && payload.albumId && payload.artistId) {
            // 1. Fetch artist and album info
            const [[artist], [album]] = await Promise.all([
              db
                .select({ stageName: artistProfiles.stageName, avatarUrl: artistProfiles.avatarUrl })
                .from(artistProfiles)
                .where(eq(artistProfiles.id, payload.artistId))
                .limit(1),
              db
                .select({ title: albums.title, slug: albums.slug, coverImageUrl: albums.coverImageUrl })
                .from(albums)
                .where(eq(albums.id, payload.albumId))
                .limit(1),
            ]);

            // 2. Fetch all followers of the artist
            const followers = await db
              .select({ userId: artistFollowers.userId })
              .from(artistFollowers)
              .where(eq(artistFollowers.artistId, payload.artistId));

            if (followers.length > 0) {
              const notificationsToCreate = followers.map((f) => ({
                recipientId: f.userId,
                actorId: null,
                type: "ARTIST_RELEASE" as const,
                entityType: "album",
                entityId: payload.albumId,
                title: "New Release Drop",
                body: `${artist?.stageName || "An artist you follow"} released "${album?.title || "a new project"}"`,
                metadata: {
                  albumId: payload.albumId,
                  slug: payload.slug || album?.slug,
                  coverImageUrl: album?.coverImageUrl,
                  artistName: artist?.stageName,
                },
              }));

              // Fan-out in chunks of 500
              for (let i = 0; i < notificationsToCreate.length; i += 500) {
                await notificationService.bulkCreateNotifications(
                  notificationsToCreate.slice(i, i + 500)
                );
              }
            }
          }
        }

        // Mark published
        await db
          .update(outboxEvents)
          .set({
            publishedAt: new Date(),
            errorMessage: null,
          })
          .where(sql`${outboxEvents.id} = ${event.id}`);

        processedCount++;
      } catch (err) {
        // Record retry and error
        await db
          .update(outboxEvents)
          .set({
            retryCount: sql`${outboxEvents.retryCount} + 1`,
            errorMessage: (err as Error).message,
          })
          .where(sql`${outboxEvents.id} = ${event.id}`);
      }
    }

    return processedCount;
  } catch (error) {
    console.error("[OutboxRelay] Error sweeping outbox events:", error);
    return 0;
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the background outbox polling timer (default every 10 seconds).
 */
export function startOutboxRelay(intervalMs: number = 10000): void {
  if (pollTimer) return;
  pollTimer = setInterval(sweepOutboxEvents, intervalMs);
}

/**
 * Stops the outbox relay timer for graceful shutdown.
 */
export function stopOutboxRelay(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
