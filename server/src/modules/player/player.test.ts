import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, songs, artistProfiles, outboxEvents, listeningHistory } from "../../db/schema";
import { eq } from "drizzle-orm";
import { PlayerService } from "./player.service";
import {
  resetTransferTimers,
  setTransferTtlMs,
  resetTransferTtlMs,
} from "./player.service";
import { cacheKeys } from "../../lib/cache/keys";
import {
  openPlayerStream,
  closePlayerStream,
  hasPlayerStream,
  playerStreamKey,
  resetPlayerStreamRegistry,
} from "./player.events";

async function runTests() {
  console.log("🧪 Starting Player Heartbeat & Telemetry Integration Tests...\n");

  await bootstrap({ listen: false });

  const testEmail = `player_test_${Date.now()}@groovy.test`;
  const password = "TestPassword123!";
  let userId = "";
  let testSongId = "";
  let testArtistId = "";

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

    // Create our own song instead of borrowing one from the catalog. The recently
    // played list only returns GLOBAL songs plus the caller's own PERSONAL uploads,
    // so a song picked at random may belong to someone else's locker and would be
    // filtered out of the very history this test asserts on.
    const [testArtist] = await db
      .insert(artistProfiles)
      .values({
        ownerUserId: userId,
        userId: null,
        scope: "PERSONAL",
        stageName: "Telemetry Artist",
        slug: `telemetry-artist-${Date.now()}`,
      })
      .returning();
    testArtistId = testArtist.id;

    const [testSong] = await db
      .insert(songs)
      .values({
        artistId: testArtist.id,
        scope: "PERSONAL",
        uploaderUserId: userId,
        title: "Test Track One",
        slug: `test-track-one-${Date.now()}`,
        durationSeconds: 180,
      })
      .returning();
    testSongId = testSong.id;
    console.log("   ✅ Created a personal test song:", testSong.id, testSong.title);

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

  // 10. Groovy Connect: Listen Session, server-stamped needle & device registry
  console.log("\n🔟 Groovy Connect: verifying session, needle and device registry...");

  // 10a. The session reflects the current Speaker (Device B won the takeover above)
  const sessionRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/session?deviceId=device-safari-iphone&instanceId=device-safari-iphone",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (sessionRes.statusCode !== 200) {
    throw new Error(`GET /session failed: ${sessionRes.body}`);
  }
  const sessionView = JSON.parse(sessionRes.body).session;
  if (!sessionView) throw new Error("Expected a Groovy Connect session to exist");
  if (sessionView.session.speaker?.deviceId !== "device-safari-iphone") {
    throw new Error(
      `Expected Speaker to be Device B, got: ${JSON.stringify(sessionView.session.speaker)}`
    );
  }
  if (!sessionView.youAreSpeaker) {
    throw new Error("Expected youAreSpeaker=true when the caller is the Speaker");
  }
  if (typeof sessionView.livePositionMs !== "number" || sessionView.livePositionMs < 5000) {
    throw new Error(
      `Expected a live needle of at least 5000ms, got ${sessionView.livePositionMs}`
    );
  }
  console.log(
    `   ✅ Speaker=${sessionView.session.speaker.deviceName}, live needle=${sessionView.livePositionMs}ms`
  );

  // 10b. Volume/mute must never travel with the session (rule R2)
  if ("volume" in sessionView.session.playback || "isMuted" in sessionView.session.playback) {
    throw new Error("Session playback must not carry volume/isMuted");
  }
  const sessionBody = JSON.parse(sessionRes.body);
  const serializedView = JSON.stringify(sessionBody.session);
  if (serializedView.includes('"volume"') || serializedView.includes('"isMuted"')) {
    throw new Error("Session payload must not contain volume/isMuted");
  }
  console.log("   ✅ volume/isMuted are absent from the session payload");

  // 10c. Two tabs of one browser collapse to a single device row (rule R10)
  await app.inject({
    method: "POST",
    url: "/api/v1/player/presence",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceId: "device-chrome-windows", instanceId: "tab_second", unlocked: true },
  });

  const devicesRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/devices",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const devices = JSON.parse(devicesRes.body).devices as Array<{
    deviceId: string;
    online: boolean;
    isSpeaker: boolean;
  }>;
  const registryIds = devices.map((d) => d.deviceId);
  if (!registryIds.includes("device-chrome-windows") || !registryIds.includes("device-safari-iphone")) {
    throw new Error(`Expected both devices in the registry, got ${JSON.stringify(registryIds)}`);
  }
  const chromeRows = devices.filter((d) => d.deviceId === "device-chrome-windows");
  if (chromeRows.length !== 1) {
    throw new Error(`Expected exactly 1 row per browser, got ${chromeRows.length}`);
  }
  if (!chromeRows[0].online) {
    throw new Error("Expected device-chrome-windows to be online after its presence ping");
  }
  console.log(`   ✅ Registry lists ${devices.length} device row(s), one per browser`);

  // 10d. Only the Speaker may write the needle
  const rejectedPosition = await app.inject({
    method: "POST",
    url: "/api/v1/player/session/position",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-chrome-windows",
      instanceId: "device-chrome-windows",
      positionMs: 999999,
      isPlaying: true,
    },
  });
  if (JSON.parse(rejectedPosition.body).updated !== false) {
    throw new Error("Expected a non-Speaker needle write to be rejected");
  }
  // The rejection must name the current Speaker, so the losing device can step
  // down and show "Playback moved to {device}" (rules A4 / C1).
  const rejectedBody = JSON.parse(rejectedPosition.body);
  if (rejectedBody.speaker?.deviceId !== "device-safari-iphone") {
    throw new Error(
      `Expected the rejection to report the current Speaker, got: ${rejectedPosition.body}`
    );
  }
  console.log("   ✅ Non-Speaker needle write rejected and handed back the Speaker");

  const acceptedPosition = await app.inject({
    method: "POST",
    url: "/api/v1/player/session/position",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-safari-iphone",
      instanceId: "device-safari-iphone",
      positionMs: 40000,
      isPlaying: true,
    },
  });
  if (JSON.parse(acceptedPosition.body).updated !== true) {
    throw new Error("Expected the Speaker's needle write to be accepted");
  }
  const afterTick = JSON.parse(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/player/session?deviceId=device-safari-iphone&instanceId=device-safari-iphone",
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).body
  ).session;
  if (afterTick.livePositionMs < 40000) {
    throw new Error(`Expected the needle to jump to ~40000ms, got ${afterTick.livePositionMs}`);
  }
  console.log(`   ✅ Needle re-stamped by the Speaker: ${afterTick.livePositionMs}ms`);

  // 10e. Device registration returns the session view for first paint
  const deviceRegisterRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/devices/register",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-firefox-linux",
      deviceName: "Firefox on Linux",
      instanceId: "tab_firefox",
      unlocked: true,
    },
  });
  if (deviceRegisterRes.statusCode !== 200) {
    throw new Error(`Device registration failed: ${deviceRegisterRes.body}`);
  }
  const registered = JSON.parse(deviceRegisterRes.body).session;
  if (!registered?.devices?.some((d: any) => d.deviceId === "device-firefox-linux" && d.online)) {
    throw new Error(`Expected the registered device to be online: ${deviceRegisterRes.body}`);
  }
  // The device list must come back even when there is no session yet, so the
  // panel is never empty on a fresh account.
  if (!Array.isArray(JSON.parse(deviceRegisterRes.body).devices)) {
    throw new Error("Expected the registration response to carry a device list");
  }
  console.log("   ✅ Device registration returns an online device row");

  // 10f. Releasing the Speaker freezes the needle and detaches the role (rule R7)
  const leaveRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/session/speaker/leave",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { deviceId: "device-safari-iphone", instanceId: "device-safari-iphone" },
  });
  if (JSON.parse(leaveRes.body).released !== true) {
    throw new Error(`Expected the Speaker to be released: ${leaveRes.body}`);
  }
  const afterLeave = JSON.parse(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/player/session",
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).body
  ).session;
  if (afterLeave.session.speaker !== null) {
    throw new Error(`Expected speaker=null after release, got ${JSON.stringify(afterLeave.session.speaker)}`);
  }
  if (afterLeave.session.playback.isPlaying !== false) {
    throw new Error("Expected playback to be frozen (isPlaying=false) after release");
  }
  console.log("   ✅ Speaker release detached the role and froze the needle");

  // 10g. A fresh account with no session yet still sees its devices
  await redis.del(
    `groovy:player:session:${userId}`,
    `groovy:player:state:${userId}`
  );
  const noSessionRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/session",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const noSessionBody = JSON.parse(noSessionRes.body);
  if (noSessionBody.session !== null) {
    throw new Error(
      `Expected session=null when nothing has ever played, got: ${noSessionRes.body}`
    );
  }
  if (!Array.isArray(noSessionBody.devices) || noSessionBody.devices.length < 1) {
    throw new Error(
      `Expected the device list to survive with no session: ${noSessionRes.body}`
    );
  }
  console.log(
    `   ✅ Devices list works with no session (${noSessionBody.devices.length} row(s))`
  );

  // 11. Groovy Connect realtime stream (SSE + Redis Pub/Sub)
  //     See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6 and §9.3.
  console.log("\n1️⃣1️⃣ Groovy Connect: realtime events...");

  const realtimeService = new PlayerService();
  const eventChannel = `groovy:player:events:${userId}`;
  const subscriber = redis.duplicate();
  await subscriber.connect();
  await subscriber.subscribe(eventChannel);

  const received: Array<Record<string, any>> = [];
  subscriber.on("message", (ch: string, message: string) => {
    if (ch !== eventChannel) return;
    try {
      received.push(JSON.parse(message));
    } catch {
      // ignore malformed frames
    }
  });

  const waitFor = async (type: string, timeoutMs = 4000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = received.find((e) => e.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(
      `Timed out waiting for a ${type} event; saw: [${received.map((e) => e.type).join(", ")}]`
    );
  };

  // 11a. A Speaker claim broadcasts the new session state to the account
  received.length = 0;
  await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-chrome-windows",
      deviceName: "Chrome on Windows",
      instanceId: "device-chrome-windows",
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 8000,
      isPaused: false,
      takeover: true,
    },
  });

  const stateEvent = await waitFor("SESSION_STATE");
  if (stateEvent.session?.speaker?.deviceId !== "device-chrome-windows") {
    throw new Error(
      `Expected SESSION_STATE to name the new Speaker, got ${JSON.stringify(stateEvent.session?.speaker)}`
    );
  }
  if (typeof stateEvent.livePositionMs !== "number") {
    throw new Error("Expected SESSION_STATE to carry a numeric live needle");
  }
  if (JSON.stringify(stateEvent.session).includes('"volume"')) {
    throw new Error("Broadcast session state must not carry device-local volume");
  }
  console.log("   ✅ Speaker claim broadcasts SESSION_STATE with the new Speaker");

  // 11b. A transfer names the *losing* device so only it stands down (rule C1)
  received.length = 0;
  await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-safari-iphone",
      deviceName: "Safari on iPhone",
      instanceId: "device-safari-iphone",
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 9000,
      isPaused: false,
      takeover: true,
    },
  });

  const lostEvent = await waitFor("SPEAKER_LOST");
  if (lostEvent.deviceId !== "device-chrome-windows") {
    throw new Error(
      `Expected SPEAKER_LOST to name the losing device, got ${JSON.stringify(lostEvent)}`
    );
  }
  if (lostEvent.newSpeaker?.deviceId !== "device-safari-iphone") {
    throw new Error(
      `Expected SPEAKER_LOST to carry the new Speaker, got ${JSON.stringify(lostEvent.newSpeaker)}`
    );
  }
  console.log("   ✅ Transfer broadcasts SPEAKER_LOST naming the losing device");

  // 11c. The needle tick broadcasts a small POSITION payload
  received.length = 0;
  await app.inject({
    method: "POST",
    url: "/api/v1/player/session/position",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-safari-iphone",
      instanceId: "device-safari-iphone",
      positionMs: 30000,
      isPlaying: true,
    },
  });

  const positionEvent = await waitFor("POSITION");
  if (positionEvent.positionMs !== 30000 || positionEvent.isPlaying !== true) {
    throw new Error(`Unexpected POSITION payload: ${JSON.stringify(positionEvent)}`);
  }
  if (positionEvent.session !== undefined) {
    throw new Error("POSITION must stay a small payload and not embed the session");
  }
  console.log("   ✅ Needle tick broadcasts a small POSITION payload");

  // 11d. A device joining broadcasts DEVICES_CHANGED
  received.length = 0;
  await app.inject({
    method: "POST",
    url: "/api/v1/player/devices/register",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-edge-android",
      deviceName: "Edge on Android",
      instanceId: "tab_edge",
      unlocked: false,
    },
  });

  const devicesEvent = await waitFor("DEVICES_CHANGED");
  const joined = (devicesEvent.devices as Array<{ deviceId: string }>).some(
    (d) => d.deviceId === "device-edge-android"
  );
  if (!joined) {
    throw new Error(
      `Expected DEVICES_CHANGED to include the new device, got ${JSON.stringify(devicesEvent.devices)}`
    );
  }
  console.log("   ✅ A device joining broadcasts DEVICES_CHANGED");

  // 11e. A dropped Speaker stream stands the session down, but only for the
  //      real Speaker (rule R7 / failure table)
  const notSpeaker = await realtimeService.detachSpeakerOnDisconnect(
    userId,
    "device-chrome-windows",
    "device-chrome-windows"
  );
  if (notSpeaker) {
    throw new Error("Expected detachSpeakerOnDisconnect to ignore a non-Speaker");
  }

  received.length = 0;
  const detached = await realtimeService.detachSpeakerOnDisconnect(
    userId,
    "device-safari-iphone",
    "device-safari-iphone"
  );
  if (!detached) {
    throw new Error("Expected detachSpeakerOnDisconnect to detach the actual Speaker");
  }
  const afterDetach = JSON.parse(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/player/session",
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).body
  ).session;
  if (afterDetach.session.speaker !== null) {
    throw new Error("Expected speaker=null after a dropped Speaker stream");
  }
  if (afterDetach.session.playback.isPlaying !== false) {
    throw new Error("Expected the needle to freeze after a dropped Speaker stream");
  }
  if (!received.some((e) => e.type === "SPEAKER_LOST")) {
    throw new Error("Expected a dropped Speaker stream to broadcast SPEAKER_LOST");
  }
  console.log("   ✅ A dropped Speaker stream stands the session down");

  // 11f. The grace window is what makes a reload seamless: a reconnect inside
  //      it cancels the stand-down, leaving for good fires it
  const graceKey = playerStreamKey(userId, "device-grace", "tab_grace");
  // A Set behind a getter, not a counter: the write happens inside the grace
  // callback, which TypeScript's flow analysis cannot see, so reading the size
  // through a call keeps it honestly `number` instead of a narrowed literal.
  const graceStandDowns = new Set<string>();
  const standDownCount = () => graceStandDowns.size;

  openPlayerStream(graceKey);
  if (!hasPlayerStream(graceKey)) {
    throw new Error("Expected an open stream to be registered");
  }
  closePlayerStream(graceKey, () => { graceStandDowns.add("closed"); }, 40);
  await new Promise((r) => setTimeout(r, 15));
  openPlayerStream(graceKey);
  await new Promise((r) => setTimeout(r, 60));
  if (standDownCount() !== 0) {
    throw new Error("Expected a reconnect within the grace window to cancel the stand-down");
  }

  closePlayerStream(graceKey, () => { graceStandDowns.add("closed"); }, 20);
  await new Promise((r) => setTimeout(r, 70));
  if (standDownCount() !== 1) {
    throw new Error(
      `Expected the stand-down to fire exactly once, fired ${standDownCount()} time(s)`
    );
  }
  if (hasPlayerStream(graceKey)) {
    throw new Error("Expected the stream registry to forget a stream that went away for good");
  }
  console.log("   ✅ A reconnect within the grace window cancels the stand-down");

  // 11g. The endpoint itself: SSE headers plus a `hello` frame that resyncs
  await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: "device-safari-iphone",
      deviceName: "Safari on iPhone",
      instanceId: "device-safari-iphone",
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 11000,
      isPaused: false,
      takeover: true,
    },
  });

  const listenAddress = await app.listen({ port: 0, host: "127.0.0.1" });
  const streamResponse = await fetch(
    `${listenAddress}/api/v1/player/session/events?token=${encodeURIComponent(
      accessToken
    )}&deviceId=device-safari-iphone&instanceId=device-safari-iphone`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (streamResponse.status !== 200) {
    throw new Error(`Expected the SSE endpoint to return 200, got ${streamResponse.status}`);
  }
  if (!String(streamResponse.headers.get("content-type")).includes("text/event-stream")) {
    throw new Error(
      `Expected text/event-stream, got ${streamResponse.headers.get("content-type")}`
    );
  }

  const reader = streamResponse.body!.getReader();
  const decoder = new TextDecoder();
  let head = "";
  while (!head.includes("\n\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    head += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  const dataLine = head.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`Expected the stream to open with a data frame, got: ${JSON.stringify(head)}`);
  }
  const hello = JSON.parse(dataLine.slice("data: ".length));
  if (hello.type !== "hello") {
    throw new Error(`Expected a hello frame first, got ${hello.type}`);
  }
  if (hello.yourInstanceId !== "device-safari-iphone") {
    throw new Error(`Expected hello to echo the viewer instance, got ${hello.yourInstanceId}`);
  }
  if (!hello.session?.youAreSpeaker) {
    throw new Error("Expected hello to report youAreSpeaker for the Speaker's own stream");
  }
  if (!Array.isArray(hello.devices)) {
    throw new Error("Expected hello to carry the device list");
  }
  console.log("   ✅ The stream opens with a hello frame that resyncs the client");

  // 1️⃣2️⃣ Groovy Connect: remote control...
  console.log("\n1️⃣2️⃣ Groovy Connect: remote control...");

  const speakerDevice = "device-safari-iphone";
  const speakerInstance = "device-safari-iphone";
  const remoteDevice = "device-chrome-mac";
  const remoteInstance = "tab-1";

  // Re-claim from the "Speaker" so the role and its liveness are both fresh
  // (the SSE reader above was cancelled, which arms the 10s stand-down).
  await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: speakerDevice,
      deviceName: "Safari on iPhone",
      instanceId: speakerInstance,
      songId: testSong.id,
      trackTitle: testSong.title,
      progressMs: 20000,
      isPaused: false,
      takeover: true,
    },
  });

  // A second device registers and becomes the Remote under test.
  await app.inject({
    method: "POST",
    url: "/api/v1/player/devices/register",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      deviceId: remoteDevice,
      deviceName: "Chrome on macOS",
      instanceId: remoteInstance,
    },
  });

  const authHeaders = { authorization: `Bearer ${accessToken}` };
  const postCommand = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/api/v1/player/session/command",
      headers: authHeaders,
      payload: {
        deviceId: remoteDevice,
        instanceId: remoteInstance,
        commandId: `cmd-${Math.random().toString(16).slice(2)}`,
        ...payload,
      },
    });

  const readSession = async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/player/session?deviceId=${remoteDevice}&instanceId=${remoteInstance}`,
      headers: authHeaders,
    });
    return res.json().session;
  };

  // 12a. The Speaker acts locally; it may not command itself (rule B1).
  const selfCommand = await app.inject({
    method: "POST",
    url: "/api/v1/player/session/command",
    headers: authHeaders,
    payload: {
      deviceId: speakerDevice,
      instanceId: speakerInstance,
      commandId: "cmd-self",
      type: "PAUSE",
    },
  });
  const selfBody = selfCommand.json();
  if (selfBody.ok !== false || selfBody.reason !== "IS_SPEAKER") {
    throw new Error(
      `Expected a command from the Speaker to be refused, got ${JSON.stringify(selfBody)}`
    );
  }
  console.log("   ✅ A command from the Speaker itself is refused");

  // 12b. A Remote's PAUSE is applied by the server, so every device agrees at
  //      once instead of waiting for the Speaker to answer (rule B4).
  received.length = 0;
  const pauseBody = (await postCommand({ type: "PAUSE", commandId: "cmd-pause" })).json();
  if (!pauseBody.ok) {
    throw new Error(`Expected PAUSE to be accepted, got ${JSON.stringify(pauseBody)}`);
  }
  const pauseEvent = await waitFor("SESSION_STATE");
  if (pauseEvent.session?.playback?.isPlaying !== false) {
    throw new Error("Expected the broadcast state to show the session paused");
  }
  const pausedView = await readSession();
  if (pausedView.session.playback.isPlaying !== false) {
    throw new Error("Expected the stored session to be paused");
  }
  if (pausedView.youAreSpeaker !== false) {
    throw new Error("Expected the Remote to be told it is not the Speaker");
  }
  if (pausedView.speakerOnline !== true) {
    throw new Error("Expected the Speaker to still read as online");
  }
  console.log("   ✅ A Remote's PAUSE pauses the session and broadcasts it");

  // 12c. A repeat of the same command id is a no-op, so a retried request (or a
  //      double tap) can never cost the user two skips (rule A8).
  const duplicateBody = (
    await postCommand({ type: "PAUSE", commandId: "cmd-pause" })
  ).json();
  if (duplicateBody.ok !== true || duplicateBody.duplicate !== true) {
    throw new Error(
      `Expected the repeated command id to be deduplicated, got ${JSON.stringify(duplicateBody)}`
    );
  }
  console.log("   ✅ A repeated command id is applied only once");

  // 12d. PLAY resumes from where the needle froze.
  const beforePlay = await readSession();
  const playBody = (await postCommand({ type: "PLAY" })).json();
  if (!playBody.ok) {
    throw new Error(`Expected PLAY to be accepted, got ${JSON.stringify(playBody)}`);
  }
  const afterPlay = await readSession();
  if (afterPlay.session.playback.isPlaying !== true) {
    throw new Error("Expected PLAY to resume the session");
  }
  if (afterPlay.session.revision <= beforePlay.session.revision) {
    throw new Error("Expected a logical change to bump the session revision");
  }
  console.log("   ✅ PLAY resumes the session from the frozen position");

  // 12e. SEEK re-anchors the needle on the server clock.
  await postCommand({ type: "SEEK", payload: { positionMs: 12000 } });
  const seeked = await readSession();
  if (seeked.livePositionMs < 12000 || seeked.livePositionMs > 14000) {
    throw new Error(`Expected the needle near 12000ms, got ${seeked.livePositionMs}ms`);
  }
  console.log("   ✅ SEEK re-anchors the needle for every device");

  // 12f. Everything the server cannot do itself is relayed to the Speaker as a
  //      COMMAND frame naming exactly one device — and changes no state here,
  //      because the Speaker owns the queue (design doc §6.4).
  received.length = 0;
  const revisionBeforeNext = (await readSession()).session.revision;
  const nextBody = (await postCommand({ type: "NEXT" })).json();
  if (!nextBody.ok) {
    throw new Error(`Expected NEXT to be accepted, got ${JSON.stringify(nextBody)}`);
  }
  const commandEvent = await waitFor("COMMAND");
  if (
    commandEvent.deviceId !== speakerDevice ||
    commandEvent.instanceId !== speakerInstance
  ) {
    throw new Error(
      `Expected COMMAND to target the Speaker, got ${commandEvent.deviceId}|${commandEvent.instanceId}`
    );
  }
  if (commandEvent.command !== "NEXT") {
    throw new Error(`Expected the relayed command to be NEXT, got ${commandEvent.command}`);
  }
  if ((await readSession()).session.revision !== revisionBeforeNext) {
    throw new Error("A relayed command must not change server-side session state");
  }
  console.log("   ✅ NEXT is relayed to the Speaker without touching the session");

  // 12g. A malformed command is the only 400.
  const badCommand = await postCommand({ type: "TELEPORT" });
  if (badCommand.statusCode !== 400) {
    throw new Error(`Expected an unknown command to be a 400, got ${badCommand.statusCode}`);
  }
  console.log("   ✅ An unknown command is rejected as a bad request");

  // 12i. Rule B7 (Spotify semantics): a Remote picking a song plays it *on the
  //      Speaker*. The server moves the session's content itself so every device
  //      converges from one broadcast, and the Speaker still receives the
  //      command that swaps its audio and adopts the tapped context.
  received.length = 0;
  const revisionBeforePlayTrack = (await readSession()).session.revision;
  const tappedTrack = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Tapped On A Remote",
    artistId: testArtistId,
    artistName: "Telemetry Artist",
    durationSeconds: 210,
  };
  const playTrackBody = (
    await postCommand({
      type: "PLAY_TRACK",
      payload: {
        track: tappedTrack,
        contextQueue: [tappedTrack],
        contextIndex: 0,
        contextUri: "album:remote-tap",
        contextTitle: "Remote Album",
      },
    })
  ).json();
  if (!playTrackBody.ok) {
    throw new Error(
      `Expected PLAY_TRACK to be accepted, got ${JSON.stringify(playTrackBody)}`
    );
  }
  const trackEvent = await waitFor("SESSION_STATE");
  if (trackEvent.session?.playback?.track?.id !== tappedTrack.id) {
    throw new Error(
      `Expected the session to move to the tapped song, got ${JSON.stringify(trackEvent.session?.playback?.track)}`
    );
  }
  if (trackEvent.session.playback.isPlaying !== true) {
    throw new Error("Expected the tapped song to start playing on the Speaker");
  }
  if (trackEvent.session.context.title !== "Remote Album") {
    throw new Error(
      `Expected the tapped context to travel with the song, got ${JSON.stringify(trackEvent.session.context)}`
    );
  }
  if (trackEvent.session.revision <= revisionBeforePlayTrack) {
    throw new Error("Expected a Remote's song pick to bump the session revision");
  }
  const trackCommand = await waitFor("COMMAND");
  if (
    trackCommand.command !== "PLAY_TRACK" ||
    trackCommand.deviceId !== speakerDevice ||
    trackCommand.payload?.track?.id !== tappedTrack.id
  ) {
    throw new Error(
      `Expected PLAY_TRACK to be relayed to the Speaker with the track, got ${JSON.stringify(trackCommand)}`
    );
  }
  console.log("   ✅ A Remote's song pick moves the session and reaches the Speaker");

  // 12h. An unreachable Speaker fails fast rather than hanging (rule B3).
  await redis.zrem(
    cacheKeys.player.online(userId),
    `${speakerDevice}|${speakerInstance}`
  );
  const offlineBody = (await postCommand({ type: "NEXT" })).json();
  if (offlineBody.ok !== false || offlineBody.reason !== "SPEAKER_OFFLINE") {
    throw new Error(
      `Expected an offline Speaker to fail fast, got ${JSON.stringify(offlineBody)}`
    );
  }
  if (offlineBody.speaker?.deviceName !== "Safari on iPhone") {
    throw new Error("Expected the refusal to name the unreachable device");
  }
  // Restore liveness so the cleanup and any later assertion sees a sane world.
  await app.inject({
    method: "POST",
    url: "/api/v1/player/presence",
    headers: authHeaders,
    payload: { deviceId: speakerDevice, instanceId: speakerInstance },
  });
  console.log("   ✅ An offline Speaker fails fast and names itself");

  // 1️⃣3️⃣ Groovy Connect: push transfer ("Play on {device}") + the autoplay
  //      handshake. See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.5 and §9.5.
  console.log("\n1️⃣3️⃣ Groovy Connect: push transfer handshake...");

  const readSessionAs = async (deviceId: string, instanceId: string) => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/player/session?deviceId=${deviceId}&instanceId=${instanceId}`,
      headers: authHeaders,
    });
    return res.json().session;
  };

  const postTransfer = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/api/v1/player/session/transfer",
      headers: authHeaders,
      payload,
    });

  const postConfirm = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/api/v1/player/session/transfer/confirm",
      headers: authHeaders,
      payload,
    });

  const registerDevice = (
    deviceId: string,
    deviceName: string,
    instanceId: string,
    unlocked: boolean
  ) =>
    app.inject({
      method: "POST",
      url: "/api/v1/player/devices/register",
      headers: authHeaders,
      payload: { deviceId, deviceName, instanceId, unlocked },
    });

  const phoneDevice = "device-phone";
  const phoneInstance = "tab-phone";
  const tabletDevice = "device-tablet";
  const tabletInstance = "tab-tablet";

  // Seed the session's *content*: the track lives in the state snapshot while
  // the Speaker and the needle live in the session (design doc §4). Section 10g
  // deliberately wiped the session to prove a fresh account still works, so this
  // is simply the "the user has something playing" precondition.
  await app.inject({
    method: "PUT",
    url: "/api/v1/player/state",
    headers: authHeaders,
    payload: {
      currentTrack: {
        id: testSongId,
        title: testSong.title,
        artistId: testArtistId,
        artistName: "Telemetry Artist",
        durationSeconds: 180,
      },
      playbackPosition: 20,
      isShuffle: false,
      repeatMode: "off",
      userQueue: [],
      contextQueue: [],
      contextIndex: 0,
    },
  });

  // 13a. A push to an offline device is refused with copy, not queued (rule A6).
  await registerDevice("device-old-laptop", "Old laptop", "tab-old", true);
  await redis.zrem(
    cacheKeys.player.online(userId),
    "device-old-laptop|tab-old"
  );
  const offlineTransfer = (
    await postTransfer({
      deviceId: speakerDevice,
      instanceId: speakerInstance,
      transferId: "xfer-offline",
      targetDeviceId: "device-old-laptop",
    })
  ).json();
  if (offlineTransfer.ok !== false || offlineTransfer.reason !== "TARGET_OFFLINE") {
    throw new Error(
      `Expected an offline target to be refused, got ${JSON.stringify(offlineTransfer)}`
    );
  }
  console.log("   ✅ A push to an offline device is refused");

  // 13b. A push to a never-unlocked device asks for a tap (rule A10), mutes the
  //      old Speaker immediately and offers the playback to the target (A9).
  await registerDevice(phoneDevice, "Phone", phoneInstance, false);
  received.length = 0;
  const push = (
    await postTransfer({
      deviceId: speakerDevice,
      instanceId: speakerInstance,
      transferId: "xfer-1",
      targetDeviceId: phoneDevice,
    })
  ).json();
  if (!push.ok) {
    throw new Error(`Expected the push to be accepted, got ${JSON.stringify(push)}`);
  }
  if (push.needsGesture !== true) {
    throw new Error("Expected a never-unlocked target to need a tap first");
  }
  if (push.target?.instanceId !== phoneInstance) {
    throw new Error(
      `Expected the server to pick the target's tab, got ${JSON.stringify(push.target)}`
    );
  }

  const movingState = await waitFor("SESSION_STATE");
  if (movingState.session?.speaker?.deviceId !== phoneDevice) {
    throw new Error(
      `Expected the session to point at the target, got ${JSON.stringify(movingState.session?.speaker)}`
    );
  }
  if (movingState.session.speaker.confirmed !== false) {
    throw new Error("Expected the target to start as unconfirmed");
  }
  if (movingState.session.playback.isPlaying !== false) {
    throw new Error("Expected the old Speaker to go silent immediately (rule A9)");
  }
  const lostForPush = received.find((e) => e.type === "SPEAKER_LOST");
  if (lostForPush?.deviceId !== speakerDevice) {
    throw new Error(
      `Expected SPEAKER_LOST to name the old Speaker, got ${JSON.stringify(lostForPush)}`
    );
  }
  const offer = await waitFor("TRANSFER_OFFER");
  if (offer.deviceId !== phoneDevice || offer.instanceId !== phoneInstance) {
    throw new Error(`Expected the offer to target the phone, got ${JSON.stringify(offer)}`);
  }
  if (offer.transferId !== "xfer-1" || offer.track?.id !== testSongId) {
    throw new Error(`Unexpected offer payload: ${JSON.stringify(offer)}`);
  }
  if (offer.positionMs < 12000) {
    throw new Error(`Expected the offer to carry the live needle, got ${offer.positionMs}`);
  }
  console.log("   ✅ A push mutes the old Speaker and offers the live needle");

  // The target does not own the room until it confirms — not even on its own view.
  const midFlightView = await readSessionAs(phoneDevice, phoneInstance);
  if (midFlightView.youAreSpeaker !== false) {
    throw new Error("Expected an unconfirmed target to not be the Speaker yet");
  }
  const midCommand = (await postCommand({ type: "PLAY" })).json();
  if (midCommand.ok !== false || midCommand.reason !== "NO_SPEAKER") {
    throw new Error(
      `Expected a command mid-handshake to be refused, got ${JSON.stringify(midCommand)}`
    );
  }
  console.log("   ✅ An unconfirmed target is not the Speaker yet");

  // 13c. Confirming moves the role and anchors the needle on where the target
  //      actually started.
  received.length = 0;
  const confirm = (
    await postConfirm({
      deviceId: phoneDevice,
      instanceId: phoneInstance,
      transferId: "xfer-1",
      ok: true,
      positionMs: 41000,
      isPlaying: true,
    })
  ).json();
  if (!confirm.ok) {
    throw new Error(`Expected the confirmation to be accepted, got ${JSON.stringify(confirm)}`);
  }
  const confirmedView = await readSessionAs(phoneDevice, phoneInstance);
  if (
    confirmedView.session.speaker?.deviceId !== phoneDevice ||
    confirmedView.session.speaker.confirmed !== true
  ) {
    throw new Error(
      `Expected the target to own the role after confirming, got ${JSON.stringify(confirmedView.session.speaker)}`
    );
  }
  if (confirmedView.youAreSpeaker !== true) {
    throw new Error("Expected the confirmed target to be told it is the Speaker");
  }
  if (confirmedView.session.playback.isPlaying !== true) {
    throw new Error("Expected the session to be playing after the confirmation");
  }
  if (
    confirmedView.livePositionMs < 41000 ||
    confirmedView.livePositionMs > 44000
  ) {
    throw new Error(
      `Expected the needle to anchor on the target's position, got ${confirmedView.livePositionMs}ms`
    );
  }
  if (confirmedView.session.revision <= midFlightView.session.revision) {
    throw new Error("Expected the confirmation to bump the session revision");
  }
  const resultEvent = await waitFor("TRANSFER_RESULT");
  if (resultEvent.ok !== true || resultEvent.transferId !== "xfer-1") {
    throw new Error(`Unexpected TRANSFER_RESULT: ${JSON.stringify(resultEvent)}`);
  }
  if (resultEvent.deviceId !== speakerDevice) {
    throw new Error("Expected the result to be routed back to the requester");
  }
  console.log("   ✅ Confirming moves the role and anchors the needle");

  // 13i. The new Speaker keeps the room. A transfer moves the *session* but not
  //      the legacy single-device lease, so the first routine heartbeat after a
  //      push used to come back "superseded" — and the device that had just
  //      started playing stood down, leaving *both* devices silent while the
  //      session still claimed to be playing. The session is the source of
  //      truth, so the confirmed Speaker is never refused by the old lease.
  const newSpeakerHeartbeat = (
    await app.inject({
      method: "POST",
      url: "/api/v1/player/heartbeat",
      headers: authHeaders,
      payload: {
        deviceId: phoneDevice,
        deviceName: "Phone",
        instanceId: phoneInstance,
        unlocked: true,
        songId: testSongId,
        trackTitle: testSong.title,
        progressMs: confirmedView.livePositionMs,
        isPaused: false,
      },
    })
  ).json();
  if (newSpeakerHeartbeat.status !== "active") {
    throw new Error(
      `Expected the confirmed Speaker's routine heartbeat to be accepted, got ${JSON.stringify(newSpeakerHeartbeat)}`
    );
  }
  const oldSpeakerHeartbeat = (
    await app.inject({
      method: "POST",
      url: "/api/v1/player/heartbeat",
      headers: authHeaders,
      payload: {
        deviceId: speakerDevice,
        deviceName: "Safari on iPhone",
        instanceId: speakerInstance,
        songId: testSongId,
        trackTitle: testSong.title,
        progressMs: confirmedView.livePositionMs,
        isPaused: false,
      },
    })
  ).json();
  if (
    oldSpeakerHeartbeat.status !== "superseded" ||
    oldSpeakerHeartbeat.activeDevice?.deviceId !== phoneDevice
  ) {
    throw new Error(
      `Expected the old Speaker to be superseded by the new one, got ${JSON.stringify(oldSpeakerHeartbeat)}`
    );
  }
  console.log("   ✅ After a transfer the new Speaker keeps the room");

  // 13d. The same ticket can only ever move the playback once (rule A8).
  const duplicateConfirm = await postConfirm({
    deviceId: phoneDevice,
    instanceId: phoneInstance,
    transferId: "xfer-1",
    ok: true,
    positionMs: 41000,
    isPlaying: true,
  });
  if (duplicateConfirm.statusCode !== 409) {
    throw new Error(
      `Expected a replayed confirmation to be stale, got ${duplicateConfirm.statusCode}`
    );
  }
  if (duplicateConfirm.json().reason !== "STALE_TRANSFER") {
    throw new Error("Expected a replayed confirmation to report STALE_TRANSFER");
  }
  console.log("   ✅ A replayed confirmation cannot move the playback twice");

  // 13e. "Not now" hands the needle straight back to the previous Speaker, which
  //      needs an explicit grant because it was faded out a moment ago (A9).
  await registerDevice(tabletDevice, "Tablet", tabletInstance, true);
  received.length = 0;
  const pushToUnlocked = (
    await postTransfer({
      deviceId: phoneDevice,
      instanceId: phoneInstance,
      transferId: "xfer-2",
      targetDeviceId: tabletDevice,
    })
  ).json();
  if (!pushToUnlocked.ok || pushToUnlocked.needsGesture !== false) {
    throw new Error(
      `Expected an unlocked target to play straight away, got ${JSON.stringify(pushToUnlocked)}`
    );
  }
  const offerToUnlocked = await waitFor("TRANSFER_OFFER");
  if (offerToUnlocked.needsGesture !== false || offerToUnlocked.deviceId !== tabletDevice) {
    throw new Error(`Unexpected offer: ${JSON.stringify(offerToUnlocked)}`);
  }

  received.length = 0;
  const declined = (
    await postConfirm({
      deviceId: tabletDevice,
      instanceId: tabletInstance,
      transferId: "xfer-2",
      ok: false,
    })
  ).json();
  if (!declined.ok) {
    throw new Error(`Expected the decline to be processed, got ${JSON.stringify(declined)}`);
  }
  const backOnPhone = await readSessionAs(phoneDevice, phoneInstance);
  if (
    backOnPhone.session.speaker?.deviceId !== phoneDevice ||
    backOnPhone.session.speaker.confirmed !== true
  ) {
    throw new Error(
      `Expected the needle to go back to the phone, got ${JSON.stringify(backOnPhone.session.speaker)}`
    );
  }
  if (backOnPhone.session.playback.isPlaying !== true) {
    throw new Error("Expected the reverted Speaker to resume");
  }
  const granted = await waitFor("SPEAKER_GRANTED");
  if (granted.deviceId !== phoneDevice || granted.isPlaying !== true) {
    throw new Error(`Unexpected SPEAKER_GRANTED: ${JSON.stringify(granted)}`);
  }
  const declinedResult = await waitFor("TRANSFER_RESULT");
  if (declinedResult.ok !== false || declinedResult.reason !== "DECLINED") {
    throw new Error(`Unexpected decline result: ${JSON.stringify(declinedResult)}`);
  }
  console.log("   ✅ Declining reverts the Speaker and resumes it");

  // 13f. An unanswered push times out and reverts on its own — the client is
  //      never the only thing standing between a stuck ticket and the user.
  setTransferTtlMs(500);
  received.length = 0;
  const pushToTimeout = (
    await postTransfer({
      deviceId: phoneDevice,
      instanceId: phoneInstance,
      transferId: "xfer-3",
      targetDeviceId: tabletDevice,
    })
  ).json();
  if (!pushToTimeout.ok) {
    throw new Error(`Expected the push to start, got ${JSON.stringify(pushToTimeout)}`);
  }
  const duringTimeout = await readSessionAs(phoneDevice, phoneInstance);
  if (duringTimeout.session.speaker?.confirmed !== false) {
    throw new Error("Expected the handshake to still be in flight");
  }
  await new Promise((r) => setTimeout(r, 900));
  const afterTimeout = await readSessionAs(phoneDevice, phoneInstance);
  if (
    afterTimeout.session.speaker?.deviceId !== phoneDevice ||
    afterTimeout.session.speaker.confirmed !== true
  ) {
    throw new Error(
      `Expected the timeout to revert the Speaker, got ${JSON.stringify(afterTimeout.session.speaker)}`
    );
  }
  if (afterTimeout.session.playback.isPlaying !== true) {
    throw new Error("Expected the timed-out push to restore playback");
  }
  if (!received.some((e) => e.type === "SPEAKER_GRANTED" && e.deviceId === phoneDevice)) {
    throw new Error("Expected a timed-out push to grant the role back");
  }
  resetTransferTtlMs();
  console.log("   ✅ An unanswered push times out and reverts");

  // 13g. Only the target may answer an offer.
  setTransferTtlMs(5000);
  received.length = 0;
  const pushForAnswer = (
    await postTransfer({
      deviceId: phoneDevice,
      instanceId: phoneInstance,
      transferId: "xfer-4",
      targetDeviceId: tabletDevice,
    })
  ).json();
  if (!pushForAnswer.ok) {
    throw new Error(`Expected the push to start, got ${JSON.stringify(pushForAnswer)}`);
  }
  const wrongAnswer = (
    await postConfirm({
      deviceId: phoneDevice,
      instanceId: phoneInstance,
      transferId: "xfer-4",
      ok: true,
    })
  ).json();
  if (wrongAnswer.ok !== false || wrongAnswer.reason !== "NOT_TARGET") {
    throw new Error(
      `Expected a non-target answer to be refused, got ${JSON.stringify(wrongAnswer)}`
    );
  }
  const rightAnswer = (
    await postConfirm({
      deviceId: tabletDevice,
      instanceId: tabletInstance,
      transferId: "xfer-4",
      ok: false,
    })
  ).json();
  if (!rightAnswer.ok) {
    throw new Error("Expected the actual target to still be able to answer");
  }
  resetTransferTtlMs();
  console.log("   ✅ Only the offered device may answer an offer");

  // 13h. A push onto a session the user never saw is a genuine conflict.
  const stalePush = await postTransfer({
    deviceId: phoneDevice,
    instanceId: phoneInstance,
    transferId: "xfer-5",
    targetDeviceId: tabletDevice,
    expectedRevision: 999999,
  });
  if (stalePush.statusCode !== 409 || stalePush.json().reason !== "STALE_STATE") {
    throw new Error(
      `Expected a stale revision to be a 409 STALE_STATE, got ${stalePush.statusCode}`
    );
  }
  console.log("   ✅ A push onto a stale revision is refused as a conflict");

  await subscriber.unsubscribe(eventChannel).catch(() => {});
  await subscriber.quit().catch(() => {});

  console.log("\n🎉 ALL PLAYER HEARTBEAT, TAKEOVER & TELEMETRY TESTS PASSED!\n");
  } finally {
    console.log("🧹 Cleaning up player test records...");
    resetPlayerStreamRegistry();
    resetTransferTimers();
    resetTransferTtlMs();
    if (testSongId) {
      // The song is ours, so there is no shared plays counter to restore: deleting the
      // row (which clears its listening-history rows via cascade) is the whole cleanup.
      await db.delete(songs).where(eq(songs.id, testSongId));
      await redis.del(`groovy:telemetry:song_plays:${testSongId}`);
    }
    if (testArtistId) {
      await db.delete(artistProfiles).where(eq(artistProfiles.id, testArtistId));
    }
    if (userId) {
      await db.delete(listeningHistory).where(eq(listeningHistory.userId, userId));
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, userId));
      await db.delete(users).where(eq(users.id, userId));
      await redis.del(
        `groovy:presence:user:${userId}`,
        `groovy:player:active_device:${userId}`,
        `groovy:player:state:${userId}`,
        `groovy:player:session:${userId}`,
        `groovy:player:queue:${userId}`,
        `groovy:player:online:${userId}`,
        `groovy:player:devices:${userId}`,
        `groovy:player:unlocked:${userId}`,
        `groovy:player:transfer:${userId}`,
        `groovy:player:history:${userId}`
      );
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
