import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, songs, artistProfiles, outboxEvents, listeningHistory } from "../../db/schema";
import { eq } from "drizzle-orm";
import { PlayerService } from "./player.service";

async function runTests() {
  console.log("🧪 Starting Player Heartbeat & Telemetry Integration Tests...\n");

  await bootstrap({ listen: false });

  const testEmail = `player_test_${Date.now()}@groovy.test`;
  const password = "TestPassword123!";
  let userId = "";
  let testSongId = "";
  let originalPlaysCount = 0;

  try {
    // 1. Register test user
    console.log("1️⃣ Registering test user...");
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: testEmail,
        password,
        displayName: "Playback Tester",
      },
    });

    if (registerRes.statusCode !== 201) {
      throw new Error(`Registration failed: ${registerRes.body}`);
    }

    const registerData = JSON.parse(registerRes.body);
    userId = registerData.user.id;
    const { AuthService } = await import("../auth/auth.service");
    const authService = new AuthService(app);
    const tokenPair = await authService.issueTokenPair({
      id: userId,
      email: testEmail,
      role: "LISTENER",
      tokenVersion: 0,
    });
    const accessToken = tokenPair.accessToken;
    console.log("   ✅ User registered. ID:", userId);

    // Find or create a test song
    let [testSong] = await db.select().from(songs).limit(1);
  if (!testSong) {
    // Create an artist and song for testing
    const [artist] = await db
      .insert(artistProfiles)
      .values({
        userId,
        stageName: "Telemetry Artist",
        slug: `telemetry-artist-${Date.now()}`,
      })
      .returning();

    [testSong] = await db
      .insert(songs)
      .values({
        artistId: artist.id,
        title: "Test Track One",
        slug: `test-track-one-${Date.now()}`,
        durationSeconds: 180,
      })
      .returning();
  }
  testSongId = testSong.id;
  originalPlaysCount = Number(testSong.playsCount || 0);
  console.log("   ✅ Using test song:", testSong.id, testSong.title);

  // 2. Test Device A Heartbeat (Start Playback)
  console.log("\n2️⃣ Device A sends playback heartbeat...");
  const deviceAHeartbeatRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-chrome-windows",
      deviceName: "Chrome on Windows",
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 12000,
      isPaused: false,
    },
  });

  if (deviceAHeartbeatRes.statusCode !== 200) {
    throw new Error(`Device A heartbeat failed: ${deviceAHeartbeatRes.body}`);
  }
  const deviceAData = JSON.parse(deviceAHeartbeatRes.body);
  if (deviceAData.status !== "active") {
    throw new Error(`Expected active status for Device A, got: ${deviceAData.status}`);
  }
  console.log("   ✅ Device A registered as active player lease");

  // 3. Verify Active Device Query
  console.log("\n3️⃣ Querying current active device...");
  const activeDeviceRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/active-device",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const activeDeviceData = JSON.parse(activeDeviceRes.body);
  if (activeDeviceData.activeDevice?.deviceId !== "device-chrome-windows") {
    throw new Error(`Active device mismatch: ${activeDeviceRes.body}`);
  }
  console.log("   ✅ Active device verified:", activeDeviceData.activeDevice.deviceName);

  // 4. Test Device B Attempting Concurrent Playback (Without Takeover)
  console.log("\n4️⃣ Device B attempts concurrent playback without takeover...");
  const deviceBHeartbeatRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-safari-iphone",
      deviceName: "Safari on iPhone",
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 5000,
      isPaused: false,
      takeover: false,
    },
  });

  const deviceBData = JSON.parse(deviceBHeartbeatRes.body);
  if (deviceBData.status !== "superseded") {
    throw new Error(`Expected superseded status for Device B, got: ${deviceBData.status}`);
  }
  if (deviceBData.activeDevice?.deviceId !== "device-chrome-windows") {
    throw new Error(`Expected activeDevice to be Device A, got: ${JSON.stringify(deviceBData.activeDevice)}`);
  }
  console.log("   ✅ Device B correctly blocked with 'superseded' pointing to Device A");

  // 5. Test Device B Explicit Takeover
  console.log("\n5️⃣ Device B executes takeover...");
  const takeoverRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-safari-iphone",
      deviceName: "Safari on iPhone",
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 5000,
      isPaused: false,
      takeover: true,
    },
  });

  const takeoverData = JSON.parse(takeoverRes.body);
  if (takeoverData.status !== "active") {
    throw new Error(`Expected active status after takeover, got: ${takeoverData.status}`);
  }
  console.log("   ✅ Device B successfully took over playback lease");

  // 6. Verify Device A is now superseded
  console.log("\n6️⃣ Device A checks in and detects it was superseded...");
  const deviceACheckRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-chrome-windows",
      deviceName: "Chrome on Windows",
      songId: testSong.id,
      progressMs: 15000,
      isPaused: false,
      takeover: false,
    },
  });

  const deviceACheckData = JSON.parse(deviceACheckRes.body);
  if (deviceACheckData.status !== "superseded") {
    throw new Error(`Expected Device A to be superseded, got: ${deviceACheckData.status}`);
  }
  if (deviceACheckData.activeDevice?.deviceId !== "device-safari-iphone") {
    throw new Error(`Expected superseded target to be Device B, got: ${JSON.stringify(deviceACheckData.activeDevice)}`);
  }
  console.log("   ✅ Device A superseded correctly by Device B");

  // 7. Test Qualified Play Telemetry (30s Rule)
  console.log("\n7️⃣ Reporting 30s qualified play telemetry...");
  const telemetryRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/telemetry/play",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      songId: testSong.id,
      durationListenedSeconds: 35,
      completed: false,
    },
  });

  if (telemetryRes.statusCode !== 200) {
    throw new Error(`Telemetry play report failed: ${telemetryRes.body}`);
  }
  console.log("   ✅ Telemetry recorded in Redis buffer & PostgreSQL");

  // 8. Test Recent Listening History API
  console.log("\n8️⃣ Querying recent listening history...");
  const recentRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/history/recent",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (recentRes.statusCode !== 200) {
    throw new Error(`Recent history query failed: ${recentRes.body}`);
  }
  const recentData = JSON.parse(recentRes.body);
  if (!recentData.history || recentData.history.length === 0) {
    throw new Error(`Expected at least 1 history entry, got 0`);
  }
  if (recentData.history[0].song.id !== testSong.id) {
    throw new Error(`Song in history mismatch: ${recentData.history[0].song.id} !== ${testSong.id}`);
  }
  console.log("   ✅ Recent history verified! Found song:", recentData.history[0].song.title);

  // 9. Test Batch Flush of Redis Song Plays Buffer to Database
  console.log("\n9️⃣ Testing Redis-to-DB play count batch flush...");
  const initialPlays = Number(testSong.playsCount || 0);
  const playerService = new PlayerService();
  const flushed = await playerService.flushPlayCountsToDatabase();
  console.log("   ✅ Total play counts flushed:", flushed);

  const [updatedSong] = await db.select().from(songs).where(eq(songs.id, testSong.id)).limit(1);
  const updatedPlays = Number(updatedSong.playsCount || 0);
  if (updatedPlays <= initialPlays) {
    throw new Error(`Plays count did not increment: before ${initialPlays}, after ${updatedPlays}`);
  }
  console.log(`   ✅ playsCount in DB updated from ${initialPlays} -> ${updatedPlays}`);

  console.log("\n🎉 ALL PLAYER HEARTBEAT, TAKEOVER & TELEMETRY TESTS PASSED!\n");
  } finally {
    console.log("🧹 Cleaning up player test records...");
    if (userId) {
      await db.delete(listeningHistory).where(eq(listeningHistory.userId, userId));
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, userId));
      await db.delete(users).where(eq(users.id, userId));
      await redis.del(
        `groovy:presence:user:${userId}`,
        `groovy:player:active_device:${userId}`,
        `groovy:player:state:${userId}`,
        `groovy:player:history:${userId}`
      );
    }
    if (testSongId) {
      await db.update(songs).set({ playsCount: originalPlaysCount }).where(eq(songs.id, testSongId));
      await redis.del(`groovy:telemetry:song_plays:${testSongId}`);
    }
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Player test suite failed:", err);
    process.exit(1);
  });
