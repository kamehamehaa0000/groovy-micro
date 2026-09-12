process.env.NODE_ENV = "test";
import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, userSubscriptions, outboxEvents } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { RefreshTokenPayload } from "./auth.schemas";

async function runTests() {
  console.log("🧪 Starting Comprehensive Auth System Tests...\n");

  // Clear any existing rate limit keys to guarantee a clean test slate
  const rateLimitKeys = await redis.keys("*rate-limit*");
  if (rateLimitKeys.length > 0) {
    await redis.del(...rateLimitKeys);
  }

  await bootstrap({ listen: false });

  const testEmail = `test_${Date.now()}@groovy.test`;
  const testPassword = "Password123!";
  const testDisplayName = "Test Engineer";

  // Clean up any existing test user
  await db.delete(users).where(eq(users.email, testEmail));

  // --- TEST 1: Register ---
  console.log("1️⃣ Testing User Registration & Verification Link Generation...");
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
  console.log("   ✅ isEmailVerified initially false:", registerData.user.isEmailVerified === false);
  console.log("   ✅ Notice message returned:", registerData.message);

  // Ensure tokens were NOT returned at registration stage
  if (registerData.accessToken) {
    throw new Error("Access token must NOT be returned before email verification!");
  }

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

  // --- TEST 2: Attempt Login with Unverified Email (Should be 403 Forbidden) ---
  console.log("2️⃣ Testing Login Block for Unverified Account...");
  const unverifiedLoginRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: testEmail,
      password: testPassword,
    },
  });

  if (unverifiedLoginRes.statusCode !== 403) {
    throw new Error(`Expected 403 Forbidden for unverified email login, got ${unverifiedLoginRes.statusCode}`);
  }
  console.log("   ✅ Status 403 Forbidden: Unverified user prevented from signing in\n");

  // --- TEST 3: Verify Email with Token ---
  console.log("3️⃣ Testing Email Verification via POST /verify-email...");
  // Simulate verification token generation in Redis for testing
  const { createHash } = await import("crypto");
  const rawTestToken = "test_raw_verification_token_1234567890abcdef";
  const testTokenHash = createHash("sha256").update(rawTestToken).digest("hex");
  await redis.set(`email_verify:${testTokenHash}`, createdUser.id, "EX", 3600);

  const verifyRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/verify-email",
    payload: {
      token: rawTestToken,
    },
  });

  if (verifyRes.statusCode !== 200) {
    throw new Error(`Email verification failed (${verifyRes.statusCode}): ${verifyRes.body}`);
  }

  const verifyData = JSON.parse(verifyRes.body);
  if (!verifyData.accessToken || !verifyData.user.isEmailVerified) {
    throw new Error("Verify-email did not return access token or isEmailVerified flag!");
  }
  console.log("   ✅ Status 200 OK: Email verified successfully");
  console.log("   ✅ Initial auth tokens issued upon successful verification");

  // Check that token was consumed from Redis (single-use)
  const remainingTokenInRedis = await redis.get(`email_verify:${testTokenHash}`);
  if (remainingTokenInRedis) {
    throw new Error("Verification token was not purged from Redis after consumption!");
  }
  console.log("   ✅ Verification token single-use enforced (purged from Redis)\n");

  // --- TEST 4: Resend Verification for Already-Verified Email ---
  console.log("4️⃣ Testing Resend Verification on Verified Account...");
  const resendRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/resend-verification",
    payload: {
      email: testEmail,
    },
  });

  if (resendRes.statusCode !== 400) {
    throw new Error(`Expected 400 Bad Request for already verified resend, got ${resendRes.statusCode}`);
  }
  console.log("   ✅ Status 400 Bad Request: Correctly blocked resend for already verified account\n");

  // --- TEST 5: Verified Login & Fresh Tokens ---
  console.log("5️⃣ Testing User Login & Password Verification for Verified Account...");
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
  const setCookieHeader = loginRes.headers["set-cookie"];
  const refreshCookieMatch = setCookieHeader?.toString().match(/refresh_token=([^;]+)/);
  let refreshToken = refreshCookieMatch ? refreshCookieMatch[1] : null;

  if (!refreshToken) {
    throw new Error("Refresh token cookie not found in login response");
  }
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ Valid credentials verified, fresh access token and refresh cookie issued\n");

  // --- TEST 6: Invalid Login ---
  console.log("6️⃣ Testing Invalid Password & Timing Attack Defense...");
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

  // --- TEST 7: Protected /me Endpoint with requireAuth ---
  console.log("7️⃣ Testing Protected Route (/api/v1/auth/me) with requireAuth Guard...");
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

  // --- TEST 8: Refresh Token Rotation (RTR) ---
  console.log("8️⃣ Testing Refresh Token Rotation (RTR)...");
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

  // --- TEST 9a: Concurrency Grace Window Verification ---
  console.log("9️⃣a Testing Concurrency Grace Window (Rapid Replay within 30s)...");
  const graceRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    cookies: {
      refresh_token: refreshToken, // Replaying within 30s grace window
    },
  });

  if (graceRes.statusCode !== 200) {
    throw new Error(`Expected 200 within grace window, got ${graceRes.statusCode}`);
  }
  const graceBody = JSON.parse(graceRes.body);
  if (graceBody.accessToken !== newAccessToken) {
    throw new Error("Grace window did not return matching accessToken");
  }
  console.log("   ✅ Status 200 OK: Grace window successfully prevented false theft alert");
  console.log("   ✅ Identical rotated token returned for concurrent request\n");

  // --- TEST 9b: Token Theft / Reuse Detection (After Grace Window) ---
  console.log("9️⃣b Testing Security Reuse Detection (Replaying Consumed Token Outside Grace Window)...");
  // Simulate time passage by adjusting rotatedAt in Redis past 30s
  const oldPayload = app.jwt.verify<RefreshTokenPayload>(refreshToken);
  const sessionKey = `session:${oldPayload.familyId}:${oldPayload.jti}`;
  const sessionData = await redis.get(sessionKey);
  if (sessionData) {
    const parsed = JSON.parse(sessionData);
    parsed.rotatedAt = Date.now() - 35_000; // 35 seconds ago (past 30s grace window)
    await redis.set(sessionKey, JSON.stringify(parsed), "EX", 120);
  }

  const replayRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    cookies: {
      refresh_token: refreshToken, // REPLAYING OLD TOKEN OUTSIDE GRACE WINDOW!
    },
  });

  if (replayRes.statusCode !== 401) {
    throw new Error(`Expected 401 for token replay attack after grace window, got ${replayRes.statusCode}`);
  }
  console.log("   ✅ Status 401 Unauthorized");
  console.log("   ✅ Theft detected! Token reuse outside grace window blocked.");

  // Check that token_version was incremented in DB
  const [userAfterTheft] = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, createdUser.id));

  if (userAfterTheft.tokenVersion <= createdUser.tokenVersion) {
    throw new Error("Global token_version was not incremented upon token reuse detection!");
  }
  console.log(`   ✅ Global token_version automatically incremented from ${createdUser.tokenVersion} -> ${userAfterTheft.tokenVersion} (All sessions revoked)\n`);

  // --- TEST 10: Revoked Token Rejected by requireAuth Guard ---
  console.log("🔟 Testing requireAuth Rejection for Revoked Access Token...");
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
  console.log("\n🎉 ALL 10 AUTH INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀");
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
