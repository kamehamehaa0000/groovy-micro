import { Queue } from "bullmq";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const queueConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const MEDIA_TRANSCODE_QUEUE_NAME = "media-transcode";

export interface TranscodeJobData {
  songId: string;
  rawAudioKey: string;
  artistId?: string;
  title?: string;
}

export const transcodeQueue = new Queue<TranscodeJobData>(
  MEDIA_TRANSCODE_QUEUE_NAME,
  {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 100,
        age: 86400, // 24 hours
      },
      removeOnFail: {
        count: 500,
      },
    },
  }
);

/**
 * Enqueues an audio transcode job to the BullMQ media-transcode queue.
 */
export async function enqueueTranscodeJob(data: TranscodeJobData): Promise<string> {
  const job = await transcodeQueue.add(`transcode-${data.songId}`, data, {
    jobId: `song-${data.songId}`, // Deterministic deduplication
  });
  return job.id!;
}
