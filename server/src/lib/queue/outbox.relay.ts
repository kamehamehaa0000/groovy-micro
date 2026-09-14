import { isNull, sql, and, lt } from "drizzle-orm";
import { db } from "../../db";
import { outboxEvents } from "../../db/schema";
import { enqueueTranscodeJob, type TranscodeJobData } from "./transcode.queue";

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
