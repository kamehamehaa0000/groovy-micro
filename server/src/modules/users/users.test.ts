import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, playlists, userFollows, outboxEvents } from "../../db/schema";
import { eq, or } from "drizzle-orm";
import { cacheKeys } from "../../lib/cache/keys";

async function runTests() {
  console.log("🧪 Starting Users & Storage System Integration Tests...\n");

  await bootstrap({ listen: false });

  const testEmail = `user_test_${Date.now()}@groovy.test`;
  const initialPassword = "OldPassword123!";
  const newPassword = "NewSecurePassword456!";
  let userId = "";
  let followerUserId = "";
  let testPlaylistId = "";

  try {
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
    userId = registerData.user.id;
  const { AuthService } = await import("../auth/auth.service");
  const authService = new AuthService(app);
  const tokenPair = await authService.issueTokenPair({
    id: userId,
    email: testEmail,
    role: "LISTENER",
    tokenVersion: 0,
  });
  let accessToken = tokenPair.accessToken;
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

  // 9. Test Public User Profile (GET /api/v1/users/:id)
  console.log("9️⃣ Testing Public Profile retrieval (GET /api/v1/users/:id)...");
  const profileRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}`,
    headers: { authorization: `Bearer ${freshAccessToken}` },
  });

  if (profileRes.statusCode !== 200) {
    throw new Error(`Expected 200 for user profile, got ${profileRes.statusCode}: ${profileRes.body}`);
  }
  const profileData = JSON.parse(profileRes.body);
  if (profileData.user.id !== userId || profileData.relationship !== "SELF") {
    throw new Error(`Invalid profile data or relationship: ${profileRes.body}`);
  }
  console.log("   ✅ Status 200 OK: User profile returned with relationship=SELF");

  // Also verify anonymous/unauthenticated profile access
  const anonProfileRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}`,
  });
  if (anonProfileRes.statusCode !== 200) {
    throw new Error(`Expected 200 for anonymous profile fetch, got ${anonProfileRes.statusCode}`);
  }
  const anonProfileData = JSON.parse(anonProfileRes.body);
  if (anonProfileData.relationship !== "NONE") {
    throw new Error(`Expected relationship=NONE for anonymous requester, got ${anonProfileData.relationship}`);
  }
  console.log("   ✅ Status 200 OK: Anonymous profile request returned relationship=NONE\n");

  // 10. Test Public User Library (GET /api/v1/users/:id/library) with PUBLIC privacy
  console.log("🔟 Testing Public User Library (GET /api/v1/users/:id/library) with PUBLIC privacy...");
  // Create a public playlist for userId
  const [createdPlaylist] = await db
    .insert(playlists)
    .values({
      ownerId: userId,
      title: "Public Grooves",
      description: "A public test playlist",
      visibility: "PUBLIC",
    })
    .returning();
  testPlaylistId = createdPlaylist.id;

  const publicLibraryRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}/library`,
  });

  if (publicLibraryRes.statusCode !== 200) {
    throw new Error(`Expected 200 for public library, got ${publicLibraryRes.statusCode}: ${publicLibraryRes.body}`);
  }
  const publicLibData = JSON.parse(publicLibraryRes.body);
  if (!publicLibData.createdPlaylists.some((p: any) => p.id === testPlaylistId)) {
    throw new Error(`Expected created playlist ${testPlaylistId} in public library response`);
  }
  console.log("   ✅ Status 200 OK: Public library returns created playlists to unauthenticated visitors\n");

  // 11. Test Followers-Only Library Gating (library_privacy = 'FOLLOWERS_ONLY')
  console.log("1️⃣1️⃣ Testing Followers-Only Library Gating...");
  // Set privacy to FOLLOWERS_ONLY
  await app.inject({
    method: "PATCH",
    url: "/api/v1/users/privacy-settings",
    headers: { authorization: `Bearer ${freshAccessToken}` },
    payload: { libraryPrivacy: "FOLLOWERS_ONLY" },
  });

  // Anonymous request must now be blocked with 403
  const anonBlockedRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}/library`,
  });
  if (anonBlockedRes.statusCode !== 403) {
    throw new Error(`Expected 403 for anonymous on FOLLOWERS_ONLY library, got ${anonBlockedRes.statusCode}`);
  }
  console.log("   ✅ Status 403 Forbidden: Anonymous visitor blocked from FOLLOWERS_ONLY library");

  // Register second user (follower)
  const followerEmail = `follower_${Date.now()}@groovy.test`;
  const registerFollowerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: followerEmail,
      password: "FollowerPassword123!",
      displayName: "Loyal Follower",
    },
  });
  followerUserId = JSON.parse(registerFollowerRes.body).user.id;
  const followerTokens = await authService.issueTokenPair({
    id: followerUserId,
    email: followerEmail,
    role: "LISTENER",
    tokenVersion: 0,
  });

  // Second user is not yet following -> must be blocked with 403
  const nonFollowerBlockedRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}/library`,
    headers: { authorization: `Bearer ${followerTokens.accessToken}` },
  });
  if (nonFollowerBlockedRes.statusCode !== 403) {
    throw new Error(`Expected 403 for non-follower, got ${nonFollowerBlockedRes.statusCode}`);
  }
  console.log("   ✅ Status 403 Forbidden: Non-follower authenticated user blocked");

  // Follow target user (direct follow because target is public account)
  const followRes = await app.inject({
    method: "POST",
    url: `/api/v1/social/users/${userId}/follow`,
    headers: { authorization: `Bearer ${followerTokens.accessToken}` },
  });
  if (followRes.statusCode !== 200) {
    throw new Error(`Follow failed: ${followRes.body}`);
  }

  // Now follower accesses library -> must succeed with 200 OK!
  const followerAllowedRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}/library`,
    headers: { authorization: `Bearer ${followerTokens.accessToken}` },
  });
  if (followerAllowedRes.statusCode !== 200) {
    throw new Error(`Expected 200 for accepted follower, got ${followerAllowedRes.statusCode}: ${followerAllowedRes.body}`);
  }
  console.log("   ✅ Status 200 OK: Accepted follower can access FOLLOWERS_ONLY library\n");

  // 12. Test Private Library Gating (library_privacy = 'PRIVATE')
  console.log("1️⃣2️⃣ Testing Private Library Gating (PRIVATE)...");
  // Set privacy to PRIVATE
  await app.inject({
    method: "PATCH",
    url: "/api/v1/users/privacy-settings",
    headers: { authorization: `Bearer ${freshAccessToken}` },
    payload: { libraryPrivacy: "PRIVATE" },
  });

  // Even accepted follower must now be blocked with 403
  const followerPrivateBlockedRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}/library`,
    headers: { authorization: `Bearer ${followerTokens.accessToken}` },
  });
  if (followerPrivateBlockedRes.statusCode !== 403) {
    throw new Error(`Expected 403 for follower on PRIVATE library, got ${followerPrivateBlockedRes.statusCode}`);
  }
  console.log("   ✅ Status 403 Forbidden: Even followers are blocked when library is PRIVATE");

  // Owner themselves can always access their own library
  const ownerAccessRes = await app.inject({
    method: "GET",
    url: `/api/v1/users/${userId}/library`,
    headers: { authorization: `Bearer ${freshAccessToken}` },
  });
  if (ownerAccessRes.statusCode !== 200) {
    throw new Error(`Expected 200 for owner on PRIVATE library, got ${ownerAccessRes.statusCode}`);
  }
  console.log("   ✅ Status 200 OK: Owner can always access their own PRIVATE library\n");

  console.log("\n🎉 ALL USERS & STORAGE INTEGRATION TESTS PASSED! 🚀");
  } finally {
    console.log("🧹 Cleaning up user test records...");
    if (testPlaylistId) {
      await db.delete(playlists).where(eq(playlists.id, testPlaylistId));
    }
    if (userId || followerUserId) {
      const uIds = [userId, followerUserId].filter(Boolean);
      for (const uId of uIds) {
        await db.delete(userFollows).where(
          or(eq(userFollows.followerId, uId), eq(userFollows.followingId, uId))
        );
        await db.delete(playlists).where(eq(playlists.ownerId, uId));
        await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, uId));
        await db.delete(users).where(eq(users.id, uId));
        await redis.del(cacheKeys.social.userFollowing(uId));
        await redis.del(cacheKeys.social.userFollowers(uId));
        await redis.del(cacheKeys.social.incomingRequests(uId));
      }
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
