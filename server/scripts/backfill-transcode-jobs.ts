import { client, db } from "../src/db";
import { songs, outboxEvents } from "../src/db/schema";
import { enqueueTranscodeJob } from "../src/lib/queue/transcode.queue";
import { isNull, and, isNotNull } from "drizzle-orm";

async function backfill() {
  console.log("🚀 Checking for songs needing HLS transcoding backfill...\n");

  try {
    const unTranscodedSongs = await db
      .select({
        id: songs.id,
        title: songs.title,
        artistId: songs.artistId,
        rawAudioKey: songs.rawAudioKey,
      })
      .from(songs)
      .where(and(isNull(songs.hlsManifestUrl), isNotNull(songs.rawAudioKey)));

    if (unTranscodedSongs.length === 0) {
      console.log("✅ All songs in catalog already have HLS manifests! No backfill needed.");
      return;
    }

    console.log(`Found ${unTranscodedSongs.length} songs without HLS manifests:`);
    for (const song of unTranscodedSongs) {
      console.log(`  - "${song.title}" (${song.id}) [Key: ${song.rawAudioKey}]`);
    }

    console.log("\n📦 Enqueueing BullMQ transcode jobs & recording outbox events...");

    for (const song of unTranscodedSongs) {
      if (!song.rawAudioKey) continue;

      const payload = {
        songId: song.id,
        rawAudioKey: song.rawAudioKey,
        artistId: song.artistId,
        title: song.title,
      };

      // 1. Record in Transactional Outbox
      await db.insert(outboxEvents).values({
        aggregateType: "SONG",
        aggregateId: song.id,
        eventType: "SONG_UPLOADED",
        payload,
        publishedAt: new Date(), // Marked published since we are dispatching to BullMQ now
      });

      // 2. Enqueue directly to BullMQ
      const jobId = await enqueueTranscodeJob(payload);
      console.log(`  ✓ Enqueued job for "${song.title}" -> Job ID: ${jobId}`);
    }

    console.log(
      `\n🎉 Successfully enqueued ${unTranscodedSongs.length} transcode jobs into BullMQ queue!`
    );
    console.log("💡 Run the media-convertion-worker to process these jobs in the background.");
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
    process.exit(0);
  }
}

backfill();
