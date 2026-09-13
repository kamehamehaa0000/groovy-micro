import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, songs, artistProfiles, outboxEvents } from "../../db/schema";
import { eq } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";

async function runSocialTests() {
  console.log("🧪 Starting Social Follow, Friend Requests & Activity Integration Tests...\n");

  await bootstrap({ listen: false });
  const authService = new AuthService(app);

  const timestamp = Date.now();
  let userA: any = null;
  let userB: any = null;

  try {
    // 1. Create User A (Public)
    console.log("1️⃣ Creating User A (Public Listener)...");
    const emailA = `user_a_${timestamp}@groovy.test`;
    [userA] = await db
    .insert(users)
    .values({
      email: emailA,
      displayName: "Alice Public",
      role: "LISTENER",
      isEmailVerified: true,
      isPrivateAccount: false,
      listeningActivityPrivacy: "FRIENDS_ONLY",
    })
    .returning();
  const tokenA = (await authService.issueTokenPair({ id: userA.id, email: emailA, role: "LISTENER", tokenVersion: 0 })).accessToken;
  console.log("   ✅ User A created:", userA.id);

  // 2. Create User B (Private)
  console.log("2️⃣ Creating User B (Private Listener)...");
  const emailB = `user_b_${timestamp}@groovy.test`;
  [userB] = await db
    .insert(users)
    .values({
      email: emailB,
      displayName: "Bob Private",
      role: "LISTENER",
      isEmailVerified: true,
      isPrivateAccount: true,
      listeningActivityPrivacy: "FRIENDS_ONLY",
    })
    .returning();
  const tokenB = (await authService.issueTokenPair({ id: userB.id, email: emailB, role: "LISTENER", tokenVersion: 0 })).accessToken;
  console.log("   ✅ User B created:", userB.id);

  // 3. User A sends follow request to private User B
  console.log("3️⃣ User A requests to follow private User B...");
  const followRes = await app.inject({
    method: "POST",
    url: `/api/v1/social/users/${userB.id}/follow`,
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (followRes.statusCode !== 200) {
    throw new Error(`Follow request failed: ${followRes.body}`);
  }
  const followData = JSON.parse(followRes.body);
  if (followData.status !== "PENDING" || !followData.isPrivateAccount) {
    throw new Error(`Expected PENDING status for private account, got: ${followRes.body}`);
  }
  console.log("   ✅ User A follow request queued as PENDING");

  // 4. User B inspects incoming requests
  console.log("4️⃣ User B checks incoming follow requests...");
  const reqRes = await app.inject({
    method: "GET",
    url: "/api/v1/social/requests/incoming",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const reqData = JSON.parse(reqRes.body);
  if (!reqData.requests.some((r: any) => r.requesterId === userA.id)) {
    throw new Error(`Expected incoming request from User A, got: ${reqRes.body}`);
  }
  console.log("   ✅ User B sees incoming request from Alice");

  // 5. User B accepts User A's follow request
  console.log("5️⃣ User B accepts User A's follow request...");
  const acceptRes = await app.inject({
    method: "POST",
    url: `/api/v1/social/requests/${userA.id}/accept`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (acceptRes.statusCode !== 200) {
    throw new Error(`Accept failed: ${acceptRes.body}`);
  }
  console.log("   ✅ Follow request accepted! User A now follows User B");

  // 6. User B follows User A (User A is public -> immediate ACCEPTED)
  console.log("6️⃣ User B follows User A (public -> immediate ACCEPTED)...");
  const followBackRes = await app.inject({
    method: "POST",
    url: `/api/v1/social/users/${userA.id}/follow`,
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const followBackData = JSON.parse(followBackRes.body);
  if (followBackData.status !== "ACCEPTED" || !followBackData.isMutualFriend) {
    throw new Error(`Expected ACCEPTED and mutual friend, got: ${followBackRes.body}`);
  }
  console.log("   ✅ Mutual friendship achieved!");

  // 7. Check relationship endpoint
  console.log("7️⃣ Verifying relationship status...");
  const relRes = await app.inject({
    method: "GET",
    url: `/api/v1/social/users/${userB.id}/relationship`,
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const relData = JSON.parse(relRes.body);
  if (relData.status !== "FRIENDS") {
    throw new Error(`Expected FRIENDS relationship, got: ${relRes.body}`);
  }
  console.log("   ✅ Relationship confirmed: FRIENDS");

  // 8. User B broadcasts active listening heartbeat
  console.log("8️⃣ User B plays a track and sends playback heartbeat...");
  let [testSong] = await db.select().from(songs).limit(1);
  if (!testSong) {
    throw new Error("No songs in DB for test");
  }

  const heartbeatRes = await app.inject({
    method: "POST",
    url: "/api/v1/player/heartbeat",
    headers: { Authorization: `Bearer ${tokenB}` },
    payload: {
      deviceId: `device_b_${timestamp}`,
      deviceName: "MacBook Pro",
      songId: testSong.id,
      trackTitle: testSong.title,
      artistName: "Test Artist",
      progressMs: 32000,
      durationMs: 180000,
      isPaused: false,
    },
  });
  if (heartbeatRes.statusCode !== 200) {
    throw new Error(`Heartbeat failed: ${heartbeatRes.body}`);
  }
  console.log("   ✅ User B heartbeat recorded with live presence");

  // 9. User A queries friends listening activity
  console.log("9️⃣ User A queries /api/v1/player/friends-activity...");
  const activityRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/friends-activity",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const activityData = JSON.parse(activityRes.body);
  if (!activityData.activities.some((a: any) => a.user.id === userB.id && a.activity.songId === testSong.id)) {
    throw new Error(`Expected User B in friend activity, got: ${activityRes.body}`);
  }
  console.log("   ✅ User A successfully sees User B listening to:", activityData.activities[0].activity.trackTitle);

  // 10. Test Privacy OFF gating
  console.log("🔟 User B turns listeningActivityPrivacy to OFF...");
  const privacyRes = await app.inject({
    method: "PATCH",
    url: "/api/v1/users/privacy-settings",
    headers: { Authorization: `Bearer ${tokenB}` },
    payload: {
      listeningActivityPrivacy: "OFF",
    },
  });
  if (privacyRes.statusCode !== 200) {
    throw new Error(`Privacy update failed: ${privacyRes.body}`);
  }

  // Check friends activity again -> User B must vanish
  const hiddenRes = await app.inject({
    method: "GET",
    url: "/api/v1/player/friends-activity",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const hiddenData = JSON.parse(hiddenRes.body);
  if (hiddenData.activities.some((a: any) => a.user.id === userB.id)) {
    throw new Error(`Expected User B to be hidden when privacy is OFF, got: ${hiddenRes.body}`);
  }
  console.log("   ✅ User B successfully hidden from friend activity when privacy is OFF");

  console.log("\n🎉 ALL SOCIAL FOLLOW, FRIEND REQUEST & ACTIVITY TESTS PASSED!\n");
  } finally {
    console.log("🧹 Cleaning up social test users and Redis keys...");
    if (userA?.id) {
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, userA.id));
      await db.delete(users).where(eq(users.id, userA.id));
      await redis.del(
        `groovy:presence:user:${userA.id}`,
        `groovy:player:active_device:${userA.id}`,
        `groovy:player:state:${userA.id}`
      );
    }
    if (userB?.id) {
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, userB.id));
      await db.delete(users).where(eq(users.id, userB.id));
      await redis.del(
        `groovy:presence:user:${userB.id}`,
        `groovy:player:active_device:${userB.id}`,
        `groovy:player:state:${userB.id}`
      );
    }
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

runSocialTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Social test failed:", err);
    process.exit(1);
  });
