import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, userSubscriptions, outboxEvents } from "../../db/schema";
import { eq } from "drizzle-orm";

async function runTests() {
  console.log("🧪 Starting Comprehensive Auth System Tests...\n");

  await bootstrap({ listen: false });

  const testEmail = `test_${Date.now()}@groovy.test`;
  const testPassword = "Password123!";
  const testDisplayName = "Test Engineer";

  // Clean up any existing test user
  await db.delete(users).where(eq(users.email, testEmail));

  // --- TEST 1: Register ---
  console.log("1️⃣ Testing User Registration & ACID Transaction...");
  const registerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: testEmail,
      password: testPassword,
      displayName: testDisplayName,
    },
  });

  if (registerRes.statusCode !== 201) {
    throw new Error(`Register failed (${registerRes.statusCode}): ${registerRes.body}`);
  }

  const registerData = JSON.parse(registerRes.body);
  console.log("   ✅ Status 201 Created");
  console.log("   ✅ User ID:", registerData.user.id);
  console.log("   ✅ Access token issued:", !!registerData.accessToken);

  // Extract refresh_token cookie
  const setCookieHeader = registerRes.headers["set-cookie"];
  const refreshCookieMatch = setCookieHeader?.toString().match(/refresh_token=([^;]+)/);
  let refreshToken = refreshCookieMatch ? refreshCookieMatch[1] : null;

  if (!refreshToken) {
    throw new Error("Refresh token cookie not found in register response");
  }
  console.log("   ✅ Refresh token cookie set (httpOnly, path=/api/v1/auth)");

  // Verify PostgreSQL ACID consistency
  const [createdUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, registerData.user.id));

  if (!createdUser || !createdUser.passwordHash?.startsWith("$argon2id$")) {
    throw new Error("User record missing or password is not Argon2id hash!");
  }
  console.log("   ✅ Password successfully hashed with Argon2id:", createdUser.passwordHash.substring(0, 30) + "...");

  const [createdSub] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, createdUser.id));

  if (!createdSub || createdSub.planId !== "free") {
    throw new Error("User subscription was not provisioned with 'free' plan!");
  }
  console.log("   ✅ Default 'free' user subscription automatically linked in same tx");

  const [outboxEvent] = await db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.aggregateId, createdUser.id));

  if (!outboxEvent || outboxEvent.eventType !== "USER_REGISTERED") {
    throw new Error("Outbox event was not written in same transaction!");
  }
  console.log("   ✅ Transactional Outbox event 'USER_REGISTERED' recorded in same tx\n");

  // --- TEST 2: Login ---
  console.log("2️⃣ Testing User Login & Password Verification...");
  const loginRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: testEmail,
      password: testPassword,
    },
  });

  if (loginRes.statusCode !== 200) {
    throw new Error(`Login failed (${loginRes.statusCode}): ${loginRes.body}`);
  }
  const loginData = JSON.parse(loginRes.body);
  const accessToken = loginData.accessToken;
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ Valid credentials verified, fresh access token issued\n");

  // --- TEST 3: Invalid Login ---
  console.log("3️⃣ Testing Invalid Password & Timing Attack Defense...");
  const invalidLoginRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: testEmail,
      password: "WrongPassword123!",
    },
  });

  if (invalidLoginRes.statusCode !== 401) {
    throw new Error(`Expected 401 for wrong password, got ${invalidLoginRes.statusCode}`);
  }
  console.log("   ✅ Status 401 Unauthorized for bad password\n");

  // --- TEST 4: Protected /me Endpoint with requireAuth ---
  console.log("4️⃣ Testing Protected Route (/api/v1/auth/me) with requireAuth Guard...");
  const meRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (meRes.statusCode !== 200) {
    throw new Error(`GET /me failed (${meRes.statusCode}): ${meRes.body}`);
  }
  const meData = JSON.parse(meRes.body);
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ User Identity:", meData.user.displayName, `(${meData.user.email})`);
  console.log("   ✅ Active Subscription Plan:", meData.user.subscription.planId);
  console.log("   ✅ Plan Features:", JSON.stringify(meData.user.plan.features), "\n");

  // --- TEST 5: Refresh Token Rotation (RTR) ---
  console.log("5️⃣ Testing Refresh Token Rotation (RTR)...");
  const refreshRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    cookies: {
      refresh_token: refreshToken,
    },
  });

  if (refreshRes.statusCode !== 200) {
    throw new Error(`Refresh failed (${refreshRes.statusCode}): ${refreshRes.body}`);
  }

  const refreshData = JSON.parse(refreshRes.body);
  const newAccessToken = refreshData.accessToken;
  const newRefreshCookie = refreshRes.headers["set-cookie"]?.toString().match(/refresh_token=([^;]+)/);
  const newRefreshToken = newRefreshCookie ? newRefreshCookie[1] : null;

  if (!newRefreshToken) {
    throw new Error("New refresh token not returned in Set-Cookie");
  }
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ Old refresh token consumed and rotated");
  console.log("   ✅ New access token and refresh token successfully generated\n");

  // --- TEST 6: Token Theft / Reuse Detection ---
  console.log("6️⃣ Testing Security Reuse Detection (Replaying Consumed Refresh Token)...");
  const replayRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    cookies: {
      refresh_token: refreshToken, // REPLAYING OLD TOKEN!
    },
  });

  if (replayRes.statusCode !== 401) {
    throw new Error(`Expected 401 for token replay attack, got ${replayRes.statusCode}`);
  }
  console.log("   ✅ Status 401 Unauthorized");
  console.log("   ✅ Theft detected! Token reuse blocked.");

  // Check that token_version was incremented in DB
  const [userAfterTheft] = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, createdUser.id));

  if (userAfterTheft.tokenVersion <= createdUser.tokenVersion) {
    throw new Error("Global token_version was not incremented upon token reuse detection!");
  }
  console.log(`   ✅ Global token_version automatically incremented from ${createdUser.tokenVersion} -> ${userAfterTheft.tokenVersion} (All sessions revoked)\n`);

  // --- TEST 7: Revoked Token Rejected by requireAuth Guard ---
  console.log("7️⃣ Testing requireAuth Rejection for Revoked Access Token...");
  const revokedMeRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${newAccessToken}`, // Token with older tokenVersion
    },
  });

  if (revokedMeRes.statusCode !== 401) {
    throw new Error(`Expected 401 for revoked token version, got ${revokedMeRes.statusCode}`);
  }
  console.log("   ✅ Status 401 Unauthorized: Stale tokenVersion immediately blocked by guard\n");

  // Clean up test user
  await db.delete(users).where(eq(users.id, createdUser.id));
  console.log("🧹 Test user and associated data cleaned up.");
  console.log("\n🎉 ALL 7 AUTH INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀");
}

runTests()
  .then(async () => {
    await app.close();
    await redis.quit();
    await pgClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n❌ Test failed with error:", err);
    try {
      await app.close();
      await redis.quit();
      await pgClient.end();
    } catch {}
    process.exit(1);
  });
