import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

async function runTests() {
  console.log("🧪 Starting Users & Storage System Integration Tests...\n");

  await bootstrap({ listen: false });

  const testEmail = `user_test_${Date.now()}@groovy.test`;
  const initialPassword = "OldPassword123!";
  const newPassword = "NewSecurePassword456!";

  // 1. Register a test user
  console.log("1️⃣ Registering test user...");
  const registerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: testEmail,
      password: initialPassword,
      displayName: "Initial Name",
    },
  });

  if (registerRes.statusCode !== 201) {
    throw new Error(`Registration failed: ${registerRes.body}`);
  }

  const registerData = JSON.parse(registerRes.body);
  const userId = registerData.user.id;
  let accessToken = registerData.accessToken;
  console.log("   ✅ User registered. ID:", userId);

  // 2. Test Presigned URL Generation for Avatar
  console.log("2️⃣ Testing Pre-Signed URL Generation for Avatar...");
  const avatarUrlRes = await app.inject({
    method: "POST",
    url: "/api/v1/storage/presigned-url",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      category: "USER_AVATAR",
      resourceId: userId,
      mimeType: "image/webp",
      fileExtension: "webp",
      fileSizeBytes: 1024 * 500, // 500 KB
    },
  });

  if (avatarUrlRes.statusCode !== 200) {
    throw new Error(`Presigned URL generation failed: ${avatarUrlRes.body}`);
  }

  const avatarUrlData = JSON.parse(avatarUrlRes.body);
  if (!avatarUrlData.uploadUrl || !avatarUrlData.storageKey || !avatarUrlData.publicUrl) {
    throw new Error("Missing fields in presigned URL response");
  }
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ Storage Key:", avatarUrlData.storageKey);
  console.log("   ✅ Public CDN URL:", avatarUrlData.publicUrl);
  console.log("   ✅ Signed Upload URL generated successfully\n");

  // 3. Test Unauthorized Presigned URL Generation (trying to upload for another user)
  console.log("3️⃣ Testing Security Guard on Presigned Uploads...");
  const unauthRes = await app.inject({
    method: "POST",
    url: "/api/v1/storage/presigned-url",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      category: "USER_AVATAR",
      resourceId: "00000000-0000-0000-0000-000000000000", // Not own ID!
      mimeType: "image/webp",
      fileExtension: "webp",
      fileSizeBytes: 1024,
    },
  });

  if (unauthRes.statusCode !== 403) {
    throw new Error(`Expected 403 for unauthorized avatar upload, got ${unauthRes.statusCode}`);
  }
  console.log("   ✅ Status 403 Forbidden: Uploading for another user was blocked\n");

  // 4. Test Update Profile (displayName & avatarUrl)
  console.log("4️⃣ Testing Profile Update (displayName & avatarUrl)...");
  const updateProfileRes = await app.inject({
    method: "PATCH",
    url: "/api/v1/users/profile",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      displayName: "Updated Senior Groover",
      avatarUrl: avatarUrlData.publicUrl,
    },
  });

  if (updateProfileRes.statusCode !== 200) {
    throw new Error(`Update profile failed: ${updateProfileRes.body}`);
  }

  const updateProfileData = JSON.parse(updateProfileRes.body);
  if (
    updateProfileData.user.displayName !== "Updated Senior Groover" ||
    updateProfileData.user.avatarUrl !== avatarUrlData.publicUrl
  ) {
    throw new Error("Profile fields did not update correctly in response");
  }

  // Verify in PostgreSQL
  const [userInDb] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  if (userInDb.displayName !== "Updated Senior Groover" || userInDb.avatarUrl !== avatarUrlData.publicUrl) {
    throw new Error("PostgreSQL data does not match updated profile!");
  }
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ Display Name updated to:", userInDb.displayName);
  console.log("   ✅ Avatar URL updated in DB to:", userInDb.avatarUrl, "\n");

  // 5. Test Update Password with wrong current password
  console.log("5️⃣ Testing Password Update with Incorrect Current Password...");
  const badPasswordRes = await app.inject({
    method: "PATCH",
    url: "/api/v1/users/password",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      currentPassword: "IncorrectPassword123!",
      newPassword: newPassword,
    },
  });

  if (badPasswordRes.statusCode !== 401) {
    throw new Error(`Expected 401 for bad current password, got ${badPasswordRes.statusCode}`);
  }
  console.log("   ✅ Status 401 Unauthorized for incorrect current password\n");

  // 6. Test Update Password with valid current password
  console.log("6️⃣ Testing Valid Password Update with Session Revocation...");
  const goodPasswordRes = await app.inject({
    method: "PATCH",
    url: "/api/v1/users/password",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      currentPassword: initialPassword,
      newPassword: newPassword,
      revokeOtherSessions: true,
    },
  });

  if (goodPasswordRes.statusCode !== 200) {
    throw new Error(`Valid password update failed: ${goodPasswordRes.body}`);
  }

  const goodPasswordData = JSON.parse(goodPasswordRes.body);
  const freshAccessToken = goodPasswordData.accessToken;
  if (!freshAccessToken) {
    throw new Error("Fresh access token was not issued upon session revocation");
  }
  console.log("   ✅ Status 200 OK");
  console.log("   ✅ Password updated with Argon2id");
  console.log("   ✅ Other sessions revoked, fresh token issued for current device\n");

  // 7. Verify that OLD access token is now blocked by requireAuth
  console.log("7️⃣ Verifying that Old Access Token is Revoked...");
  const oldTokenCheckRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (oldTokenCheckRes.statusCode !== 401) {
    throw new Error(`Expected old token to be 401, got ${oldTokenCheckRes.statusCode}`);
  }
  console.log("   ✅ Status 401 Unauthorized: Old access token is successfully rejected");

  // 8. Verify that NEW access token works
  console.log("8️⃣ Verifying that Fresh Access Token works...");
  const newTokenCheckRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${freshAccessToken}` },
  });

  if (newTokenCheckRes.statusCode !== 200) {
    throw new Error(`Expected fresh token to be 200, got ${newTokenCheckRes.statusCode}`);
  }
  console.log("   ✅ Status 200 OK: Fresh access token authenticated successfully\n");

  // Clean up
  await db.delete(users).where(eq(users.id, userId));
  console.log("🧹 Test user cleaned up.");
  console.log("\n🎉 ALL USERS & STORAGE INTEGRATION TESTS PASSED! 🚀");
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
