import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, albums, songs, artistProfiles, outboxEvents, subscriptionPlans, userSubscriptions } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { entitlementsCacheService } from "../../lib/cache";

async function runTests() {
  console.log("🧪 Starting Personal Cloud Locker & Bulk Importer Tests...\n");

  await bootstrap({ listen: false });

  let userAId = "";
  let userBId = "";
  let userAToken = "";
  let userBToken = "";

  try {
    // 1. Register User A and User B
    console.log("1️⃣ Registering test users...");
    const emailA = `locker_user_a_${Date.now()}@groovy.test`;
    const emailB = `locker_user_b_${Date.now()}@groovy.test`;
    const password = "Password123!";

    const resA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: emailA,
        password,
        displayName: "Locker Tester A",
      },
    });
    const bodyA = JSON.parse(resA.body);
    userAId = bodyA.user.id;

    const resB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: emailB,
        password,
        displayName: "Locker Tester B",
      },
    });
    const bodyB = JSON.parse(resB.body);
    userBId = bodyB.user.id;

    // Verify emails directly in DB to allow immediate login
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userAId));
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userBId));

    const loginResA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: emailA, password },
    });
    userAToken = JSON.parse(loginResA.body).accessToken;

    const loginResB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: emailB, password },
    });
    userBToken = JSON.parse(loginResB.body).accessToken;

    if (!userAToken || !userBToken) {
      throw new Error(`Failed to login test users: A=${loginResA.statusCode}, B=${loginResB.statusCode}`);
    }
    console.log("   ✅ User A & User B registered and authenticated successfully");

    // 2. Test Quota Endpoint
    console.log("\n2️⃣ Checking initial personal collection quota...");
    const quotaRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/quota",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (quotaRes.statusCode !== 200) {
      throw new Error(`Expected 200, got ${quotaRes.statusCode}: ${quotaRes.body}`);
    }
    const quotaBody = JSON.parse(quotaRes.body);
    if (quotaBody.quota.maxSongs <= 0 || quotaBody.quota.remainingSongs <= 0) {
      throw new Error(`Invalid quota: ${JSON.stringify(quotaBody)}`);
    }
    console.log(`   ✅ Initial quota: ${quotaBody.quota.usedSongs} / ${quotaBody.quota.maxSongs} songs used, ${quotaBody.quota.remainingSongs} remaining`);

    // 3. Batch presigned URLs with quota check
    console.log("\n3️⃣ Testing batch presigned URLs & quota gating...");
    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/batch-presigned-urls",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        files: [
          {
            clientFileId: "f1",
            category: "SONG_AUDIO_RAW",
            resourceId: "song_guid_1",
            mimeType: "audio/mpeg",
            fileExtension: "mp3",
            fileSizeBytes: 8 * 1024 * 1024,
          },
          {
            clientFileId: "f2",
            category: "SONG_AUDIO_RAW",
            resourceId: "song_guid_2",
            mimeType: "audio/flac",
            fileExtension: "flac",
            fileSizeBytes: 25 * 1024 * 1024,
          },
          {
            clientFileId: "c1",
            category: "ALBUM_COVER",
            resourceId: "album_guid_1",
            mimeType: "image/jpeg",
            fileExtension: "jpg",
            fileSizeBytes: 500 * 1024,
          },
        ],
      },
    });

    if (batchRes.statusCode !== 200) {
      throw new Error(`Batch presigned URLs failed (${batchRes.statusCode}): ${batchRes.body}`);
    }
    const batchBody = JSON.parse(batchRes.body);
    if (batchBody.uploads.length !== 3) {
      throw new Error(`Expected 3 signed URLs, got ${batchBody.uploads.length}`);
    }
    console.log("   ✅ 3 Presigned URLs generated successfully for audio & cover art");

    // Test exceeding quota via low-quota plan (e.g. personal_collection_quota: 2)
    await db
      .insert(subscriptionPlans)
      .values({
        id: "test_low_quota_plan",
        name: "Low Quota Test Plan",
        features: { personal_collection_quota: 2 },
        priceCents: 0,
        currency: "USD",
        interval: "month",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: subscriptionPlans.id,
        set: { features: { personal_collection_quota: 2 } },
      });

    await db
      .update(userSubscriptions)
      .set({ planId: "test_low_quota_plan" })
      .where(eq(userSubscriptions.userId, userAId));
    await entitlementsCacheService.invalidateUserEntitlements(userAId);

    const overFiles = Array.from({ length: 3 }, (_, i) => ({
      clientFileId: `over_${i}`,
      category: "SONG_AUDIO_RAW",
      resourceId: `res_${i}`,
      mimeType: "audio/mpeg",
      fileExtension: "mp3",
      fileSizeBytes: 1024 * 1024,
    }));
    const overRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/batch-presigned-urls",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { files: overFiles },
    });
    if (overRes.statusCode !== 403) {
      throw new Error(`Expected 403 quota exceeded, got ${overRes.statusCode}: ${overRes.body}`);
    }
    console.log("   ✅ Batch request exceeding quota correctly rejected with 403 Forbidden");

    // Restore userA plan to free
    await db
      .update(userSubscriptions)
      .set({ planId: "free" })
      .where(eq(userSubscriptions.userId, userAId));
    await entitlementsCacheService.invalidateUserEntitlements(userAId);

    // 4. Bulk import release with sandboxed artist & outbox events
    console.log("\n4️⃣ Importing clustered release (Album + 2 tracks)...");
    const importPayload = {
      artistName: "The Local Band",
      albumTitle: "Garage Demos 2026",
      albumType: "EP",
      genre: "Indie Rock",
      releaseDate: "2026-09-01",
      tracks: [
        {
          title: "First Take",
          trackNumber: 1,
          discNumber: 1,
          durationSeconds: 180,
          genre: "Indie Rock",
          isExplicit: false,
          rawAudioKey: "audio/raw/demo-1/original.mp3",
        },
        {
          title: "Second Take (Acoustic)",
          trackNumber: 2,
          discNumber: 1,
          durationSeconds: 210,
          genre: "Acoustic",
          isExplicit: false,
          rawAudioKey: "audio/raw/demo-2/original.flac",
        },
      ],
    };

    const importRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: importPayload,
    });

    if (importRes.statusCode !== 201) {
      throw new Error(`Bulk import failed (${importRes.statusCode}): ${importRes.body}`);
    }
    const importBody = JSON.parse(importRes.body);
    if (importBody.album.scope !== "PERSONAL" || importBody.artist.scope !== "PERSONAL") {
      throw new Error(`Expected PERSONAL scope, got ${JSON.stringify(importBody)}`);
    }
    if (importBody.tracks.length !== 2) {
      throw new Error(`Expected 2 tracks created, got ${importBody.tracks.length}`);
    }
    console.log("   ✅ Release imported with sandboxed artist & personal scope");

    // Verify outbox events recorded for background transcoding
    const events = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.aggregateType, "SONG"), eq(outboxEvents.eventType, "SONG_UPLOADED")));
    if (events.length < 2) {
      throw new Error(`Expected at least 2 SONG_UPLOADED outbox events, found ${events.length}`);
    }
    console.log("   ✅ Transactional Outbox events recorded for HLS transcode worker");

    // 5. Test Personal Artist Deduplication on subsequent import
    console.log("\n5️⃣ Testing personal artist deduplication across releases...");
    const secondRelease = {
      artistName: "the local band", // case-insensitive match
      albumTitle: "Garage Demos Vol 2",
      albumType: "SINGLE",
      tracks: [
        {
          title: "Third Take",
          trackNumber: 1,
          durationSeconds: 195,
          rawAudioKey: "audio/raw/demo-3/original.mp3",
        },
      ],
    };

    const secondImportRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: secondRelease,
    });
    if (secondImportRes.statusCode !== 201) {
      throw new Error(`Second import failed: ${secondImportRes.body}`);
    }

    const personalArtists = await db
      .select()
      .from(artistProfiles)
      .where(and(eq(artistProfiles.ownerUserId, userAId), eq(artistProfiles.scope, "PERSONAL")));
    if (personalArtists.length !== 1) {
      throw new Error(`Expected exactly 1 deduplicated personal artist, found ${personalArtists.length}`);
    }
    console.log("   ✅ Personal artist deduplication verified: only 1 profile created");

    // 6. Test Search Scoping & Isolation
    console.log("\n6️⃣ Testing Search scoping and personal privacy toggles...");
    // User A searches -> should find their personal song
    const searchResA = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=First%20Take&type=songs",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const searchBodyA = JSON.parse(searchResA.body);
    const foundTrackA = searchBodyA.songs?.find((s: any) => s.title === "First Take");
    if (!foundTrackA || !foundTrackA.isPersonal) {
      throw new Error(`User A should find personal track with isPersonal=true: ${JSON.stringify(searchBodyA)}`);
    }
    console.log("   ✅ User A finds personal track with isPersonal=true badge");

    // User B searches -> must NOT see User A's personal track
    const searchResB = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=First%20Take&type=songs",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    const searchBodyB = JSON.parse(searchResB.body);
    const foundTrackB = searchBodyB.songs?.find((s: any) => s.title === "First Take");
    if (foundTrackB) {
      throw new Error(`CRITICAL LEAK: User B found User A's personal track: ${JSON.stringify(foundTrackB)}`);
    }
    console.log("   ✅ User B blocked from finding User A's personal track (Zero Leak)");

    // User A disables lockerIncludeInSearch -> track disappears from User A's search
    await app.inject({
      method: "PATCH",
      url: "/api/v1/users/privacy-settings",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { lockerIncludeInSearch: false },
    });
    const searchResAOff = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=First%20Take&type=songs",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const searchBodyAOff = JSON.parse(searchResAOff.body);
    if (searchBodyAOff.songs?.find((s: any) => s.title === "First Take")) {
      throw new Error("Track should not appear when lockerIncludeInSearch is false");
    }
    console.log("   ✅ lockerIncludeInSearch = false successfully excludes personal tracks");

    // 7. Test Stream Gate & Jam Authorization
    console.log("\n7️⃣ Testing stream gate & Live Jam room playback authorization...");
    const [personalSong] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.title, "First Take"), eq(songs.uploaderUserId, userAId)))
      .limit(1);

    // Owner streaming
    const streamResA = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${personalSong.id}/stream`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (streamResA.statusCode !== 200) {
      throw new Error(`Owner could not stream: ${streamResA.body}`);
    }
    console.log("   ✅ Owner (User A) successfully streams personal track");

    // Non-owner streaming without Jam -> blocked (404)
    const streamResB = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${personalSong.id}/stream`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (streamResB.statusCode !== 404) {
      throw new Error(`Expected 404 for non-owner, got ${streamResB.statusCode}`);
    }
    console.log("   ✅ Non-owner (User B) blocked with 404 outside Jam session");

    // Put User A & User B into active Jam room
    const roomCode = "JAM-LOCKER";
    await redis.set(`jam:user:${userAId}:active_room`, roomCode, "EX", 300);
    await redis.set(`jam:user:${userBId}:active_room`, roomCode, "EX", 300);
    await redis.hset(`jam:session:${roomCode}:members`, userAId, JSON.stringify({ userId: userAId }));
    await redis.hset(`jam:session:${roomCode}:members`, userBId, JSON.stringify({ userId: userBId }));

    // Non-owner streams during active Jam session -> Authorized!
    const streamResBJam = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${personalSong.id}/stream`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (streamResBJam.statusCode !== 200) {
      throw new Error(`Jam member should be authorized to stream, got ${streamResBJam.statusCode}: ${streamResBJam.body}`);
    }
    console.log("   ✅ Non-owner (User B) successfully authorized to stream via Live Jam room session");

    // Cleanup Jam keys
    await redis.del(`jam:user:${userAId}:active_room`);
    await redis.del(`jam:user:${userBId}:active_room`);
    await redis.del(`jam:session:${roomCode}:members`);

    // 8. GET /api/v1/storage/personal-collection/releases
    console.log("\n8️⃣ Testing GET /api/v1/storage/personal-collection/releases...");
    const lockerRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/releases",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (lockerRes.statusCode !== 200) {
      throw new Error(`Failed to get locker releases: ${lockerRes.body}`);
    }
    const lockerBody = JSON.parse(lockerRes.body);
    if (lockerBody.releases.length !== 2) {
      throw new Error(`Expected 2 releases in locker, got ${lockerBody.releases.length}`);
    }
    console.log(`   ✅ Successfully retrieved ${lockerBody.releases.length} locker releases with structured tracks`);

    // 9. Testing DELETE personal song
    console.log("\n9️⃣ Testing DELETE /api/v1/storage/personal-collection/songs/:id...");
    const targetRelease = lockerBody.releases.find((r: any) => r.tracks.length >= 2);
    const targetSong = targetRelease.tracks[0];

    // User B tries to delete User A's personal song -> 404
    const delResB = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (delResB.statusCode !== 404) {
      throw new Error(`Expected 404 when unauthorized user deletes personal song, got ${delResB.statusCode}`);
    }
    console.log("   ✅ Unauthorized deletion by other users correctly blocked with 404");

    // User A deletes their personal song
    const delResA = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (delResA.statusCode !== 200) {
      throw new Error(`Failed to delete personal song: ${delResA.body}`);
    }
    console.log("   ✅ Personal track successfully removed by owner");

    // Check quota decremented
    const quotaAfterSongDel = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/quota",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const quotaData = JSON.parse(quotaAfterSongDel.body).quota;
    if (quotaData.usedSongs !== 2) {
      throw new Error(`Expected usedSongs=2 after deleting 1 of 3 songs, got ${quotaData.usedSongs}`);
    }
    console.log(`   ✅ Quota correctly updated: ${quotaData.usedSongs} / ${quotaData.maxSongs} used, ${quotaData.remainingSongs} remaining`);

    // 10. Testing DELETE personal release
    console.log("\n🔟 Testing DELETE /api/v1/storage/personal-collection/releases/:id...");
    const delRelA = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/releases/${targetRelease.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (delRelA.statusCode !== 200) {
      throw new Error(`Failed to delete personal release: ${delRelA.body}`);
    }
    console.log("   ✅ Entire personal release and remaining tracks removed by owner");

    const releasesAfterDel = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/releases",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const remainingReleases = JSON.parse(releasesAfterDel.body).releases;
    if (remainingReleases.length !== 1) {
      throw new Error(`Expected 1 release remaining, got ${remainingReleases.length}`);
    }
    console.log(`   ✅ Active releases list updated: ${remainingReleases.length} release remaining`);

    console.log("\n🎉 ALL PERSONAL COLLECTION INTEGRATION TESTS PASSED! 🚀");
  } finally {
    console.log("🧹 Cleaning up locker test records...");
    if (userAId) {
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(users).where(eq(users.id, userBId));
    }
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Test failed with error:", err);
    process.exit(1);
  });
