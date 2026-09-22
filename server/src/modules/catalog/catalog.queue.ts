import { Queue, Worker, type Job } from "bullmq";
import { db } from "../../db";
import { albums, releasePresaves } from "../../db/schema/catalog";
import { albumLikes } from "../../db/schema/social";
import { outboxEvents } from "../../db/schema/outbox";
import { eq, and, isNull, sql } from "drizzle-orm";
import { cacheManager, cacheKeys } from "../../lib/cache";
import { redis } from "../../db/redis";

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
 * Execute immediate publish of an album:
 * 1. Verifies album exists and is not soft-deleted.
 * 2. In a single ACID transaction:
 *    - Transitions album status to PUBLISHED with publishedAt = NOW().
 *    - Migrates all pre-savers from release_presaves to album_likes.
 *    - Updates albums.likesCount by converted count and resets preSavesCount to 0.
 *    - Deletes processed release_presaves rows.
 *    - Emits 'album.released' outbox event with pre-saver metadata.
 * 3. Reconciles Redis sets: purges albumId from pre-saved sets and adds to liked sets.
 * 4. Invalidates public album and artist catalog caches.
 */
export async function executePublishRelease(albumId: string): Promise<void> {
  const publishedDate = new Date();
  let updatedArtistId: string | null = null;
  let updatedSlug: string | null = null;
  let convertedUserIds: string[] = [];

  await db.transaction(async (tx) => {
    // 1. Verify album is not soft-deleted
    const [existing] = await tx
      .select({
        id: albums.id,
        status: albums.status,
        deletedAt: albums.deletedAt,
        artistId: albums.artistId,
        slug: albums.slug,
        title: albums.title,
        albumType: albums.albumType,
      })
      .from(albums)
      .where(and(eq(albums.id, albumId), isNull(albums.deletedAt)))
      .limit(1);

    if (!existing) {
      // Album does not exist or is in trash
      return;
    }

    updatedArtistId = existing.artistId;
    updatedSlug = existing.slug;

    // 2. Fetch all pre-savers for this release
    const presaverRows = await tx
      .select({ userId: releasePresaves.userId })
      .from(releasePresaves)
      .where(eq(releasePresaves.albumId, albumId));

    convertedUserIds = presaverRows.map((r) => r.userId);

    // 3. Convert pre-savers to album_likes
    if (convertedUserIds.length > 0) {
      await tx
        .insert(albumLikes)
        .values(convertedUserIds.map((userId) => ({ userId, albumId })))
        .onConflictDoNothing();

      await tx
        .delete(releasePresaves)
        .where(eq(releasePresaves.albumId, albumId));
    }

    // 4. Update album status, published date, and like/presave counters
    const [updated] = await tx
      .update(albums)
      .set({
        status: "PUBLISHED",
        publishedAt: publishedDate,
        updatedAt: publishedDate,
        preSavesCount: 0,
        ...(convertedUserIds.length > 0
          ? { likesCount: sql`${albums.likesCount} + ${convertedUserIds.length}` }
          : {}),
      })
      .where(and(eq(albums.id, albumId), isNull(albums.deletedAt)))
      .returning();

    if (!updated) return;

    // 5. Transactional outbox event for downstream consumers
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
        convertedPreSavesCount: convertedUserIds.length,
        convertedUserIds,
      },
    });
  });

  // 6. Synchronize Redis Sets for converted listeners
  for (const userId of convertedUserIds) {
    try {
      const presavedKey = cacheKeys.social.userPreSavedAlbums(userId);
      const likedKey = cacheKeys.social.userLikedAlbums(userId);

      await redis.srem(presavedKey, albumId);

      const likedExists = await redis.exists(likedKey);
      if (likedExists) {
        await redis.srem(likedKey, "__EMPTY__");
        await redis.sadd(likedKey, albumId);
        await redis.expire(likedKey, 86400);
      }
    } catch (err) {
      console.warn(`[executePublishRelease] Redis sync failed for user ${userId}:`, err);
    }
  }

  // 7. Invalidate Redis caches
  try {
    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: updatedSlug,
      artistId: updatedArtistId,
    });
    if (updatedArtistId) {
      await cacheManager.invalidate(
        cacheKeys.catalog.artist(updatedArtistId),
        cacheKeys.catalog.artistAlbumsTag(updatedArtistId)
      );
    }
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
