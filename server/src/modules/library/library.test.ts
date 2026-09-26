import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import {
  users,
  playlists,
  userLibraryPins,
} from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";

async function createTestUser(name = "Library Test User") {
  const email = `library_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@groovy.test`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      displayName: name,
      isEmailVerified: true,
      role: "LISTENER",
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

async function runLibraryTests() {
  console.log("📚 Starting Library & Pinning Integration Tests...\n");

  await bootstrap({ listen: false });

  const createdUserIds: string[] = [];

  try {
    const { user, tokens } = await createTestUser("Alice Library");
    createdUserIds.push(user.id);

    // 1. Create a playlist for user
    const [playlist] = await db
      .insert(playlists)
      .values({
        ownerId: user.id,
        title: "Alice's Favorites",
        visibility: "PUBLIC",
      })
      .returning();

    // 2. Test GET /api/v1/library/me
    console.log("1️⃣ Testing GET /api/v1/library/me...");
    const libraryRes = await app.inject({
      method: "GET",
      url: "/api/v1/library/me",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    if (libraryRes.statusCode !== 200) {
      throw new Error(`GET /library/me failed with status ${libraryRes.statusCode}: ${libraryRes.body}`);
    }

    const libraryData = JSON.parse(libraryRes.body);
    if (!libraryData.playlists || libraryData.playlists.length !== 1) {
      throw new Error(`Expected 1 playlist, got ${libraryData.playlists?.length}`);
    }
    if (libraryData.playlists[0].id !== playlist.id) {
      throw new Error(`Playlist ID mismatch: expected ${playlist.id}, got ${libraryData.playlists[0].id}`);
    }
    if (!libraryData.likedSongs || typeof libraryData.likedSongs.totalTracks !== "number") {
      throw new Error("Invalid likedSongs summary structure");
    }
    if (!libraryData.personalCollection || typeof libraryData.personalCollection.totalReleases !== "number") {
      throw new Error("Invalid personalCollection summary structure");
    }
    console.log("   ✅ GET /api/v1/library/me returned correct payload structure with playlist:", libraryData.playlists[0].title);

    // 3. Test POST /api/v1/library/pins (Pin Liked Songs & Playlist)
    console.log("2️⃣ Testing POST /api/v1/library/pins...");
    const pinLikedRes = await app.inject({
      method: "POST",
      url: "/api/v1/library/pins",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemType: "LIKED_SONGS",
        itemId: "LIKED_SONGS",
      }),
    });

    if (pinLikedRes.statusCode !== 200) {
      throw new Error(`Failed to pin Liked Songs (${pinLikedRes.statusCode}): ${pinLikedRes.body}`);
    }
    console.log("   ✅ Liked Songs successfully pinned");

    const pinPlaylistRes = await app.inject({
      method: "POST",
      url: "/api/v1/library/pins",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemType: "PLAYLIST",
        itemId: playlist.id,
      }),
    });

    if (pinPlaylistRes.statusCode !== 200) {
      throw new Error(`Failed to pin playlist (${pinPlaylistRes.statusCode}): ${pinPlaylistRes.body}`);
    }
    console.log("   ✅ Playlist successfully pinned");

    // 4. Verify pins reflected in GET /api/v1/library/me
    console.log("3️⃣ Verifying pins in GET /api/v1/library/me...");
    const libraryRes2 = await app.inject({
      method: "GET",
      url: "/api/v1/library/me",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    const libraryData2 = JSON.parse(libraryRes2.body);
    if (libraryData2.pins.length !== 2) {
      throw new Error(`Expected 2 pins, got ${libraryData2.pins.length}`);
    }
    console.log("   ✅ GET /api/v1/library/me returned 2 active pins:", libraryData2.pins.map((p: any) => p.itemType));

    // 5. Test DELETE /api/v1/library/pins/:itemType/:itemId
    console.log("4️⃣ Testing DELETE /api/v1/library/pins/:itemType/:itemId...");
    const unpinRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/library/pins/PLAYLIST/${playlist.id}`,
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    if (unpinRes.statusCode !== 200) {
      throw new Error(`Failed to unpin playlist (${unpinRes.statusCode}): ${unpinRes.body}`);
    }

    const libraryRes3 = await app.inject({
      method: "GET",
      url: "/api/v1/library/me",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    const libraryData3 = JSON.parse(libraryRes3.body);
    if (libraryData3.pins.length !== 1 || libraryData3.pins[0].itemType !== "LIKED_SONGS") {
      throw new Error(`Unpin failed, remaining pins: ${JSON.stringify(libraryData3.pins)}`);
    }
    console.log("   ✅ Unpin successful, only Liked Songs remains pinned\n");

    console.log("🎉 ALL LIBRARY TESTS PASSED SUCCESSFULLY!\n");
  } finally {
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    const { stopOutboxRelay } = await import("../../lib/queue/outbox.relay");
    stopOutboxRelay();
    await redis.quit();
    await pgClient.end();
    process.exit(0);
  }
}

runLibraryTests().catch((err) => {
  console.error("❌ Library Test Suite Failed:", err);
  process.exit(1);
});
