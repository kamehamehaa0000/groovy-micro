import type { Job } from "bullmq";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { db, songs } from "../lib/db";
import { redis } from "../lib/redis";
import { downloadRawAudio, uploadHlsDirectory } from "../storage/r2";
import { analyzeAudio } from "../transcoder/audio-analyzer";
import { transcodeToHls } from "../transcoder/ffmpeg";
import { transcodeJobPayloadSchema, type TranscodeJobPayload } from "./types";

/**
 * BullMQ processor function handling end-to-end audio transcoding,
 * audio analysis, R2 uploads, and database status updates.
 */
export async function processTranscodeJob(job: Job<TranscodeJobPayload>): Promise<void> {
  const parsed = transcodeJobPayloadSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(`Invalid job data payload: ${JSON.stringify(parsed.error.flatten())}`);
  }

  const { songId, rawAudioKey, title } = parsed.data;
  console.log(`[Transcoder] 🎵 Starting transcode job ${job.id} for song "${title || songId}" (${rawAudioKey})`);

  // 1. Verify song exists in DB
  const [existingSong] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(eq(songs.id, songId));

  if (!existingSong) {
    console.warn(`[Transcoder] ⚠️ Song ${songId} not found in database. Skipping job.`);
    return;
  }

  // 2. Transition DB state to PROCESSING
  await db
    .update(songs)
    .set({
      processingStatus: "PROCESSING",
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(songs.id, songId));

  // 3. Prepare isolated scratch space
  const jobScratchDir = path.join(config.TEMP_DIR, `job-${job.id || songId}-${Date.now()}`);
  const rawExt = path.extname(rawAudioKey) || ".flac";
  const localRawAudioPath = path.join(jobScratchDir, `source${rawExt}`);
  const hlsOutputDir = path.join(jobScratchDir, "hls");

  try {
    fs.mkdirSync(jobScratchDir, { recursive: true });

    // 4. Download raw master from Cloudflare R2
    console.log(`[Transcoder] ⬇️ Downloading raw audio from R2: ${rawAudioKey}`);
    await downloadRawAudio(rawAudioKey, localRawAudioPath);

    // 5. Audio Analysis (specs, EBU R128 loudness, waveform peak array, BPM)
    console.log(`[Transcoder] 🔍 Performing audio analysis (LUFS, waveform, BPM)...`);
    const analysis = analyzeAudio(localRawAudioPath);
    console.log(
      `[Transcoder] 📊 Analysis: ${analysis.durationSeconds}s | Format: ${analysis.specs.format} | Integrated: ${analysis.loudness?.integratedLufs} LUFS | BPM: ${analysis.musical?.bpm || "N/A"}`
    );

    // 6. Multi-bitrate HLS Transcoding (128k, 192k, 320k)
    console.log(`[Transcoder] ⚙️ Encoding single-pass multi-bitrate HLS ladder...`);
    await transcodeToHls(localRawAudioPath, hlsOutputDir);

    // 7. Parallel upload to Cloudflare R2
    const s3Prefix = `audio/hls/${songId}`;
    console.log(`[Transcoder] ⬆️ Uploading HLS segments & playlists to R2 under "${s3Prefix}"...`);
    const { uploadedKeys } = await uploadHlsDirectory(hlsOutputDir, s3Prefix);
    console.log(`[Transcoder] ✅ Uploaded ${uploadedKeys.length} files to R2`);

    // 8. Update DB state to READY with CDN URL and audio analysis
    const hlsManifestUrl = `${config.CDN_BASE_URL}/${s3Prefix}/master.m3u8`;

    await db
      .update(songs)
      .set({
        processingStatus: "READY",
        hlsManifestUrl,
        durationSeconds: analysis.durationSeconds || undefined,
        audioAnalysis: analysis,
        updatedAt: new Date(),
      })
      .where(eq(songs.id, songId));

    // 9. Emit real-time notification on Redis Pub/Sub
    await redis.publish(
      "song:transcoded",
      JSON.stringify({
        songId,
        status: "READY",
        hlsManifestUrl,
        durationSeconds: analysis.durationSeconds,
      })
    );

    console.log(`[Transcoder] 🎉 Song ${songId} successfully transcoded! Manifest: ${hlsManifestUrl}`);
  } catch (error) {
    const errMessage = (error as Error).message || "Unknown transcoding error";
    console.error(`[Transcoder] ❌ Transcode job failed for song ${songId}:`, errMessage);

    // Update DB with FAILED state and error message
    await db
      .update(songs)
      .set({
        processingStatus: "FAILED",
        processingError: errMessage,
        updatedAt: new Date(),
      })
      .where(eq(songs.id, songId));

    // Emit failure notification on Redis Pub/Sub
    await redis.publish(
      "song:transcoded",
      JSON.stringify({
        songId,
        status: "FAILED",
        error: errMessage,
      })
    );

    throw error;
  } finally {
    // 10. Clean up scratch directory to prevent disk leakage
    if (fs.existsSync(jobScratchDir)) {
      try {
        fs.rmSync(jobScratchDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`[Transcoder] ⚠️ Failed to clean up scratch dir ${jobScratchDir}:`, cleanupErr);
      }
    }
  }
}
