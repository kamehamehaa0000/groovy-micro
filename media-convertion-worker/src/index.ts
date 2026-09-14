import { Worker } from "bullmq";
import fs from "node:fs";
import { config } from "./config";
import { resolveFfmpeg } from "./lib/ffmpeg-resolver";
import { createRedisConnection, redis } from "./lib/redis";
import { pgClient } from "./lib/db";
import { MEDIA_TRANSCODE_QUEUE_NAME } from "./jobs/types";
import { processTranscodeJob } from "./jobs/transcode.processor";

async function bootstrap() {
  console.log("====================================================");
  console.log("🚀 Groovy Media Transcoder Worker Starting Up");
  console.log(`🌍 Environment: ${config.NODE_ENV}`);
  console.log(`⚙️ Concurrency: ${config.CONCURRENCY}`);
  console.log(`📦 Cloudflare R2 Bucket: ${config.R2_BUCKET_NAME}`);
  console.log(`🌐 CDN Base URL: ${config.CDN_BASE_URL}`);

  // 1. Resolve and verify FFmpeg
  const { ffmpegPath, ffprobePath } = resolveFfmpeg();
  console.log(`🎬 FFmpeg Binary: ${ffmpegPath}`);
  console.log(`🔍 FFprobe Binary: ${ffprobePath}`);

  // 2. Test Redis
  try {
    const ping = await redis.ping();
    console.log(`⚡ Redis Connection: ${ping}`);
  } catch (err) {
    console.error("❌ Failed to connect to Redis:", err);
    process.exit(1);
  }

  // 3. Purge orphaned scratch directories from previous runs
  if (fs.existsSync(config.TEMP_DIR)) {
    try {
      const entries = fs.readdirSync(config.TEMP_DIR);
      for (const entry of entries) {
        if (entry.startsWith("job-")) {
          fs.rmSync(`${config.TEMP_DIR}/${entry}`, { recursive: true, force: true });
        }
      }
      console.log(`🧹 Cleaned up stale scratch directories in ${config.TEMP_DIR}`);
    } catch {
      // Ignore scratch cleanup error
    }
  }

  // 4. Initialize BullMQ Worker
  const worker = new Worker(
    MEDIA_TRANSCODE_QUEUE_NAME,
    processTranscodeJob,
    {
      connection: createRedisConnection(),
      concurrency: config.CONCURRENCY,
      lockDuration: 300000, // 5 minutes lock
    }
  );

  worker.on("ready", () => {
    console.log(`🎧 Worker listening for jobs on queue "${MEDIA_TRANSCODE_QUEUE_NAME}"`);
    console.log("====================================================");
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] ✅ Job ${job.id} for song ${job.data.songId} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} for song ${job?.data.songId} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] ⚠️ BullMQ Worker error:", err);
  });

  // 5. Graceful Shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down worker gracefully...`);
    try {
      await worker.close();
      await redis.quit();
      await pgClient.end();
      console.log("👋 Groovy Media Transcoder Worker exited cleanly.");
      process.exit(0);
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("❌ Fatal error starting transcoder worker:", err);
  process.exit(1);
});
