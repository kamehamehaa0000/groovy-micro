import { Queue, Worker, type Job } from "bullmq";
import { db } from "../../db";
import { albums } from "../../db/schema/catalog";
import { outboxEvents } from "../../db/schema/outbox";
import { eq } from "drizzle-orm";
import { cacheManager } from "../../lib/cache";

const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");
export const bullmqConnection = {
  host: redisUrl.hostname || "localhost",
  port: parseInt(redisUrl.port || "6379", 10),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
};

export interface ScheduledReleaseJobPayload {
  albumId: string;
  artistId: string;
  title: string;
  albumType: string;
}

export const releaseQueue = new Queue<ScheduledReleaseJobPayload>(
  "scheduled-releases",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  }
);

/**
 * Execute immediate publish of an album
 */
export async function executePublishRelease(albumId: string): Promise<void> {
  const publishedDate = new Date();
  let updatedArtistId: string | null = null;
  let updatedSlug: string | null = null;

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(albums)
      .set({
        status: "PUBLISHED",
        publishedAt: publishedDate,
        updatedAt: publishedDate,
      })
      .where(eq(albums.id, albumId))
      .returning();

    if (!updated) return;
    updatedArtistId = updated.artistId;
    updatedSlug = updated.slug;

    // Transactional outbox event for downstream consumers (e.g. notifications)
    await tx.insert(outboxEvents).values({
      aggregateType: "ALBUM",
      aggregateId: albumId,
      eventType: "album.released",
      payload: {
        albumId,
        artistId: updated.artistId,
        title: updated.title,
        albumType: updated.albumType,
        publishedAt: publishedDate.toISOString(),
      },
    });
  });

  // Invalidate Redis caches
  try {
    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: updatedSlug,
      artistId: updatedArtistId,
    });
  } catch (err) {
    console.warn(`[executePublishRelease] Cache invalidation failed:`, err);
  }
}

/**
 * Schedule a release job
 */
export async function scheduleReleaseJob(album: {
  id: string;
  artistId: string;
  title: string;
  albumType: string;
  scheduledReleaseAt?: Date | string | null;
}): Promise<void> {
  if (!album.scheduledReleaseAt) return;

  const targetTime = new Date(album.scheduledReleaseAt).getTime();
  const delayMs = targetTime - Date.now();

  if (delayMs <= 0) {
    // Timestamp already elapsed, execute publish directly
    await executePublishRelease(album.id);
    return;
  }

  // Deduplication: remove existing delayed job for this album if any
  try {
    await releaseQueue.remove(`album-release-${album.id}`);
  } catch {}

  await releaseQueue.add(
    `release:${album.id}`,
    {
      albumId: album.id,
      artistId: album.artistId,
      title: album.title,
      albumType: album.albumType,
    },
    {
      delay: delayMs,
      jobId: `album-release-${album.id}`,
    }
  );
}

/**
 * Cancel a scheduled release job
 */
export async function cancelScheduledReleaseJob(albumId: string): Promise<void> {
  try {
    await releaseQueue.remove(`album-release-${albumId}`);
  } catch {}
}

let releaseWorker: Worker<ScheduledReleaseJobPayload> | null = null;

export function initReleaseWorker(): Worker<ScheduledReleaseJobPayload> {
  if (!releaseWorker) {
    releaseWorker = new Worker<ScheduledReleaseJobPayload>(
      "scheduled-releases",
      async (job: Job<ScheduledReleaseJobPayload>) => {
        const { albumId } = job.data;
        await executePublishRelease(albumId);
      },
      {
        connection: bullmqConnection,
        concurrency: 20,
      }
    );

    releaseWorker.on("error", (err) => {
      console.error("BullMQ Release Worker error:", err);
    });
  }

  return releaseWorker;
}

export async function closeReleaseQueue(): Promise<void> {
  if (releaseWorker) {
    await releaseWorker.close();
    releaseWorker = null;
  }
  await releaseQueue.close();
}
