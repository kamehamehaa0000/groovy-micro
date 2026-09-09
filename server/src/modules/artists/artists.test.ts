import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, artistProfiles, artistFollowers } from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";

async function createTestUser(
  role: "LISTENER" | "ARTIST" | "ADMIN" = "LISTENER",
  name = "Test User"
) {
  const email = `artist_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@groovy.test`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      displayName: name,
      isEmailVerified: true,
      role,
      isActive: true,
      tokenVersion: 0,
    })
    .returning();

  const authService = new AuthService(app);
  const tokens = await authService.issueTokenPair({
    id: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  return { user, tokens };
}

async function runArtistTests() {
  console.log("🎨 Starting Artist Profile & Verification System Integration Tests...\n");

  await bootstrap({ listen: false });

  const createdUserIds: string[] = [];

  try {
    // 1. Setup test users
    console.log("1️⃣ Provisioning test users (Listener 1, Listener 2, Listener 3, Admin)...");
    const listener1 = await createTestUser("LISTENER", "Listener One");
    const listener2 = await createTestUser("LISTENER", "Listener Two");
    const listener3 = await createTestUser("LISTENER", "Listener Three");
    const admin = await createTestUser("ADMIN", "System Admin");

    createdUserIds.push(
      listener1.user.id,
      listener2.user.id,
      listener3.user.id,
      admin.user.id
    );
    console.log("   ✅ Test users created with valid auth tokens\n");

    // 2. Test Instant Upgrade: Listener 1 -> Artist
    console.log("2️⃣ Testing Instant Upgrade (POST /api/v1/artists)...");
    const upgradeRes1 = await app.inject({
      method: "POST",
      url: "/api/v1/artists",
      headers: { authorization: `Bearer ${listener1.tokens.accessToken}` },
      payload: {
        stageName: "Hélène Vane",
        slug: "helene-vane",
        bio: "French impressionist pianist and neoclassical composer.",
        socialLinks: {
          instagram: "https://instagram.com/helenevane",
          website: "https://helenevane.com",
        },
      },
    });

    if (upgradeRes1.statusCode !== 201) {
      throw new Error(`Expected 201 Created, got ${upgradeRes1.statusCode}: ${upgradeRes1.body}`);
    }

    const upgradeData1 = JSON.parse(upgradeRes1.body);
    const artist1Id = upgradeData1.profile.id;
    const freshArtist1Token = upgradeData1.accessToken;

    if (!artist1Id || upgradeData1.profile.slug !== "helene-vane") {
      throw new Error("Profile creation failed or returned invalid slug");
    }
    if (upgradeData1.user.role !== "ARTIST" || !freshArtist1Token) {
      throw new Error("User role not promoted or fresh access token missing");
    }

    // Verify DB user role updated
    const [dbUser1] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, listener1.user.id));
    if (dbUser1?.role !== "ARTIST") {
      throw new Error("User role in DB was not updated to ARTIST");
    }

    console.log("   ✅ Status 201 Created: Instant upgrade successful");
    console.log("   ✅ Profile ID:", artist1Id, "Slug:", upgradeData1.profile.slug);
    console.log("   ✅ User role promoted to ARTIST in DB & fresh token returned\n");

    // Duplicate profile attempt should be rejected with 409
    console.log("2️⃣b Testing Duplicate Profile Prevention (409 Conflict)...");
    const dupRes = await app.inject({
      method: "POST",
      url: "/api/v1/artists",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
      payload: {
        stageName: "Duplicate Vane",
      },
    });

    if (dupRes.statusCode !== 409) {
      throw new Error(`Expected 409 Conflict for duplicate profile, got ${dupRes.statusCode}`);
    }
    console.log("   ✅ Status 409 Conflict: Prevented duplicate profile creation for same user\n");

    // Auto slug generation and collision handling
    console.log("2️⃣c Testing Slug Auto-Generation & Collision Handling...");
    // Listener 2 creates profile with stageName "Miles Echo" (no slug specified)
    const upgradeRes2 = await app.inject({
      method: "POST",
      url: "/api/v1/artists",
      headers: { authorization: `Bearer ${listener2.tokens.accessToken}` },
      payload: {
        stageName: "Miles Echo",
      },
    });
    const upgradeData2 = JSON.parse(upgradeRes2.body);
    if (upgradeData2.profile.slug !== "miles-echo") {
      throw new Error(`Expected slug 'miles-echo', got '${upgradeData2.profile.slug}'`);
    }
    console.log("   ✅ Auto-generated slug from stageName:", upgradeData2.profile.slug);

    // Listener 3 creates profile with SAME stageName "Miles Echo" -> should resolve to "miles-echo-2"
    const upgradeRes3 = await app.inject({
      method: "POST",
      url: "/api/v1/artists",
      headers: { authorization: `Bearer ${listener3.tokens.accessToken}` },
      payload: {
        stageName: "Miles Echo",
      },
    });
    const upgradeData3 = JSON.parse(upgradeRes3.body);
    if (upgradeData3.profile.slug !== "miles-echo-2") {
      throw new Error(`Expected slug collision resolution 'miles-echo-2', got '${upgradeData3.profile.slug}'`);
    }
    console.log("   ✅ Slug collision successfully resolved to:", upgradeData3.profile.slug, "\n");

    // 3. Studio Profile Access & Update (GET /me, PATCH /me)
    console.log("3️⃣ Testing Studio Profile Endpoints (GET /me, PATCH /me)...");
    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/me",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
    });

    if (meRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK from GET /me, got ${meRes.statusCode}: ${meRes.body}`);
    }
    const meData = JSON.parse(meRes.body);
    if (meData.id !== artist1Id || meData.followersCount !== 0) {
      throw new Error("GET /me returned invalid profile or follower count");
    }
    console.log("   ✅ GET /me returned correct artist studio profile with followersCount = 0");

    // Update profile
    const updateRes = await app.inject({
      method: "PATCH",
      url: "/api/v1/artists/me",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
      payload: {
        bio: "Updated Parisian concert pianist bio.",
        bannerUrl: "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/artists/banner.webp",
      },
    });

    if (updateRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK from PATCH /me, got ${updateRes.statusCode}: ${updateRes.body}`);
    }
    const updateData = JSON.parse(updateRes.body);
    if (
      updateData.profile.bio !== "Updated Parisian concert pianist bio." ||
      updateData.profile.bannerUrl !== "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/artists/banner.webp"
    ) {
      throw new Error("Profile fields not updated properly");
    }
    console.log("   ✅ PATCH /me successfully updated bio and bannerUrl\n");

    // 4. Public Profile & Dual Lookup (GET /:idOrSlug)
    console.log("4️⃣ Testing Public Dual-Lookup Architecture (GET /:idOrSlug)...");
    // Lookup by UUID
    const uuidLookupRes = await app.inject({
      method: "GET",
      url: `/api/v1/artists/${artist1Id}`,
    });
    if (uuidLookupRes.statusCode !== 200) {
      throw new Error(`Lookup by UUID failed with status ${uuidLookupRes.statusCode}`);
    }
    const uuidData = JSON.parse(uuidLookupRes.body);
    if (uuidData.slug !== "helene-vane") {
      throw new Error("UUID lookup returned mismatched record");
    }
    console.log("   ✅ Successfully retrieved artist by UUID");

    // Lookup by Slug
    const slugLookupRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/helene-vane",
    });
    if (slugLookupRes.statusCode !== 200) {
      throw new Error(`Lookup by Slug failed with status ${slugLookupRes.statusCode}`);
    }
    const slugData = JSON.parse(slugLookupRes.body);
    if (slugData.id !== artist1Id) {
      throw new Error("Slug lookup returned mismatched record");
    }
    console.log("   ✅ Successfully retrieved artist by Slug ('helene-vane')");

    // Anonymous visitor state
    if (slugData.isFollowing !== false) {
      throw new Error("Anonymous visitor isFollowing should be false");
    }
    console.log("   ✅ Anonymous request correctly received isFollowing = false");

    // Nonexistent lookup
    const missingLookupRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/non-existent-musician-slug",
    });
    if (missingLookupRes.statusCode !== 404) {
      throw new Error(`Expected 404 for nonexistent artist, got ${missingLookupRes.statusCode}`);
    }
    console.log("   ✅ Status 404 Not Found for nonexistent artist\n");

    // 5. Search / Browse Artists
    console.log("5️⃣ Testing Search & Pagination (GET /api/v1/artists)...");
    const searchRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists?search=Helene&page=1&limit=10",
    });
    if (searchRes.statusCode !== 200) {
      throw new Error(`Search failed: ${searchRes.body}`);
    }
    const searchData = JSON.parse(searchRes.body);
    if (
      !Array.isArray(searchData.data) ||
      searchData.data.length === 0 ||
      searchData.data[0].slug !== "helene-vane"
    ) {
      throw new Error("Search did not find the expected artist");
    }
    console.log("   ✅ Search returned matching artist:", searchData.data[0].stageName);
    console.log("   ✅ Pagination meta: total =", searchData.pagination.total, "\n");

    // 6. Follow / Unfollow System
    console.log("6️⃣ Testing Follow & Unfollow Mechanics...");
    // Prevent self-follow
    const selfFollowRes = await app.inject({
      method: "POST",
      url: `/api/v1/artists/${artist1Id}/follow`,
      headers: { authorization: `Bearer ${freshArtist1Token}` },
    });
    if (selfFollowRes.statusCode !== 400) {
      throw new Error(`Expected 400 Bad Request for self-follow, got ${selfFollowRes.statusCode}`);
    }
    console.log("   ✅ Status 400 Bad Request: Self-follow prevented");

    // Listener 2 follows Artist 1
    const followRes = await app.inject({
      method: "POST",
      url: `/api/v1/artists/${artist1Id}/follow`,
      headers: { authorization: `Bearer ${upgradeRes2.headers["authorization"] || listener2.tokens.accessToken}` },
    });
    if (followRes.statusCode !== 200) {
      throw new Error(`Follow failed (${followRes.statusCode}): ${followRes.body}`);
    }
    const followData = JSON.parse(followRes.body);
    if (!followData.following || followData.followersCount !== 1) {
      throw new Error(`Follow response invalid: ${followRes.body}`);
    }
    console.log("   ✅ Listener successfully followed artist (followersCount: 1)");

    // Check following status endpoint
    const checkFollowRes = await app.inject({
      method: "GET",
      url: `/api/v1/artists/${artist1Id}/following`,
      headers: { authorization: `Bearer ${listener2.tokens.accessToken}` },
    });
    const checkFollowData = JSON.parse(checkFollowRes.body);
    if (checkFollowData.isFollowing !== true) {
      throw new Error("GET /:id/following should return isFollowing: true");
    }
    console.log("   ✅ GET /:id/following confirmed: isFollowing = true");

    // Public lookup by follower should reflect isFollowing = true
    const followerProfileRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/helene-vane",
      headers: { authorization: `Bearer ${listener2.tokens.accessToken}` },
    });
    const followerProfileData = JSON.parse(followerProfileRes.body);
    if (followerProfileData.isFollowing !== true || followerProfileData.followersCount !== 1) {
      throw new Error("Public lookup did not reflect follower identity");
    }
    console.log("   ✅ Public profile lookup dynamically enriched with isFollowing = true for active listener");

    // Listener 2 unfollows Artist 1
    const unfollowRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/artists/${artist1Id}/follow`,
      headers: { authorization: `Bearer ${listener2.tokens.accessToken}` },
    });
    if (unfollowRes.statusCode !== 200) {
      throw new Error(`Unfollow failed (${unfollowRes.statusCode}): ${unfollowRes.body}`);
    }
    const unfollowData = JSON.parse(unfollowRes.body);
    if (unfollowData.following !== false || unfollowData.followersCount !== 0) {
      throw new Error(`Unfollow response invalid: ${unfollowRes.body}`);
    }
    console.log("   ✅ Listener successfully unfollowed artist (followersCount: 0)\n");

    // 7. Artist Verification Application Flow
    console.log("7️⃣ Testing Artist Verification Submission (POST /me/request-verification)...");
    const verifyReqRes = await app.inject({
      method: "POST",
      url: "/api/v1/artists/me/request-verification",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
      payload: {
        message: "Independent neoclassical composer touring European venues.",
        contactEmail: "booking@helenevane.com",
        contactPhone: "+33 6 12 34 56 78",
        links: [
          "https://instagram.com/helenevane",
          "https://helenevane.com",
        ],
      },
    });

    if (verifyReqRes.statusCode !== 200) {
      throw new Error(`Verification submission failed (${verifyReqRes.statusCode}): ${verifyReqRes.body}`);
    }
    const verifyReqData = JSON.parse(verifyReqRes.body);
    if (verifyReqData.profile.verificationStatus !== "PENDING") {
      throw new Error("verificationStatus was not set to PENDING");
    }
    console.log("   ✅ Verification application submitted: status is PENDING");

    // Prevent re-submission while PENDING
    const dupVerifyRes = await app.inject({
      method: "POST",
      url: "/api/v1/artists/me/request-verification",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
      payload: {
        message: "Attempting to submit again immediately.",
        links: ["https://instagram.com/helenevane"],
      },
    });
    if (dupVerifyRes.statusCode !== 400) {
      throw new Error(`Expected 400 Bad Request for duplicate submission, got ${dupVerifyRes.statusCode}`);
    }
    console.log("   ✅ Status 400 Bad Request: Duplicate submission prevented while PENDING\n");

    // 8. Admin Verification Desk: List, Reject, Resubmit, Approve
    console.log("8️⃣ Testing Admin Verification Desk (RBAC, Review, Approval)...");
    // Non-admin forbidden
    const nonAdminDeskRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/artists",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
    });
    if (nonAdminDeskRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for non-admin, got ${nonAdminDeskRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Non-admin blocked from admin desk");

    // Admin lists pending verification requests
    const adminListRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/artists?status=PENDING",
      headers: { authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    if (adminListRes.statusCode !== 200) {
      throw new Error(`Admin list failed: ${adminListRes.body}`);
    }
    const adminListData = JSON.parse(adminListRes.body);
    const targetApplication = adminListData.data.find(
      (a: any) => a.id === artist1Id
    );
    if (!targetApplication) {
      throw new Error("Pending application not found in admin list");
    }
    if (!targetApplication.verificationDetails?.message) {
      throw new Error("Admin did not receive verificationDetails");
    }
    console.log("   ✅ Admin successfully listed pending applications with details");

    // Admin rejects without reason -> validation error (400)
    const rejectNoReasonRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/artists/${artist1Id}/verify`,
      headers: { authorization: `Bearer ${admin.tokens.accessToken}` },
      payload: {
        status: "REJECTED",
      },
    });
    if (rejectNoReasonRes.statusCode !== 400) {
      throw new Error(`Expected 400 for rejection without reason, got ${rejectNoReasonRes.statusCode}`);
    }
    console.log("   ✅ Status 400 Bad Request: Rejection requires explanatory reason");

    // Admin rejects with valid reason
    const rejectRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/artists/${artist1Id}/verify`,
      headers: { authorization: `Bearer ${admin.tokens.accessToken}` },
      payload: {
        status: "REJECTED",
        reason: "Please provide a link to your official verified Spotify or Apple Music profile.",
      },
    });
    if (rejectRes.statusCode !== 200) {
      throw new Error(`Rejection failed: ${rejectRes.body}`);
    }
    const rejectData = JSON.parse(rejectRes.body);
    if (
      rejectData.verificationStatus !== "REJECTED" ||
      rejectData.verified !== false ||
      !rejectData.rejectionReason
    ) {
      throw new Error("Rejection state mismatch");
    }
    console.log("   ✅ Admin successfully rejected application with feedback reason");

    // Artist views studio profile to see rejection reason
    const artistReviewRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/me",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
    });
    const artistReviewData = JSON.parse(artistReviewRes.body);
    if (
      artistReviewData.verificationStatus !== "REJECTED" ||
      !artistReviewData.rejectionReason
    ) {
      throw new Error("Artist did not see rejection reason in GET /me");
    }
    console.log("   ✅ Artist studio accurately displays rejection feedback to creator");

    // Artist resubmits with updated proof
    const resubmitRes = await app.inject({
      method: "POST",
      url: "/api/v1/artists/me/request-verification",
      headers: { authorization: `Bearer ${freshArtist1Token}` },
      payload: {
        message: "Updated links with official Spotify verified artist page.",
        contactEmail: "booking@helenevane.com",
        links: [
          "https://instagram.com/helenevane",
          "https://open.spotify.com/artist/helenevane",
        ],
      },
    });
    if (resubmitRes.statusCode !== 200) {
      throw new Error(`Resubmission failed: ${resubmitRes.body}`);
    }
    console.log("   ✅ Artist successfully resubmitted updated verification application");

    // Admin approves verification application
    const approveRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/artists/${artist1Id}/verify`,
      headers: { authorization: `Bearer ${admin.tokens.accessToken}` },
      payload: {
        status: "VERIFIED",
      },
    });
    if (approveRes.statusCode !== 200) {
      throw new Error(`Approval failed: ${approveRes.body}`);
    }
    const approveData = JSON.parse(approveRes.body);
    if (
      approveData.verified !== true ||
      approveData.verificationStatus !== "VERIFIED" ||
      approveData.rejectionReason !== null
    ) {
      throw new Error("Approval state mismatch");
    }
    console.log("   ✅ Admin approved application: verified = true, verificationStatus = VERIFIED");

    // Public view reflects verified badge
    const finalPublicRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/helene-vane",
    });
    const finalPublicData = JSON.parse(finalPublicRes.body);
    if (finalPublicData.verified !== true) {
      throw new Error("Public profile did not reflect verified badge");
    }
    console.log("   ✅ Public artist profile now proudly reflects verified badge: true\n");

    console.log("🎉 ALL ARTIST PROFILE & VERIFICATION DESK TESTS PASSED! 🚀\n");
  } finally {
    // Cleanup created users and cascaded profiles / followers
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
      console.log(`🧹 Cleaned up ${createdUserIds.length} test users & associated artist data.`);
    }
  }
}

runArtistTests()
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
