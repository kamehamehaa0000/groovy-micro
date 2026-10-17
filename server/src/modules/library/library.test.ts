import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import {
  users,
  playlists,
  userLibraryPins,
  artistProfiles,
  albums,
} from "../../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";
import { MAX_LIBRARY_PINS } from "./library.service";
import { PlaylistsService } from "../playlists/playlists.service";
import {
  playlistsCacheService,
  followsCacheService,
  likesCacheService,
} from "../../lib/cache";

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

    // 6. Backend must advertise the same limit the client enforces
    console.log("5️⃣ Verifying the backend advertises the pin limit...");
    if (libraryData3.maxPins !== MAX_LIBRARY_PINS) {
      throw new Error(
        `Expected maxPins=${MAX_LIBRARY_PINS}, got ${libraryData3.maxPins}`
      );
    }
    console.log(`   ✅ Backend advertises maxPins = ${libraryData3.maxPins}\n`);

    // 7. Stale pins (target removed) must not count against the limit
    console.log("6️⃣ Verifying stale pins are pruned on library read...");
    await app.inject({
      method: "POST",
      url: "/api/v1/library/pins",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ itemType: "PLAYLIST", itemId: playlist.id }),
    });

    // Delete the pinned playlist out from under the pin
    await db.delete(playlists).where(eq(playlists.id, playlist.id));

    const afterDeleteRes = await app.inject({
      method: "GET",
      url: "/api/v1/library/me",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const afterDelete = JSON.parse(afterDeleteRes.body);

    if (
      afterDelete.pins.some(
        (p: any) => p.itemType === "PLAYLIST" && p.itemId === playlist.id
      )
    ) {
      throw new Error(
        "Stale PLAYLIST pin was returned after its playlist was deleted"
      );
    }

    // The prune delete is best-effort/async — give it a beat to settle
    await new Promise((r) => setTimeout(r, 200));
    const remainingPinRows = await db
      .select({
        id: userLibraryPins.id,
        itemType: userLibraryPins.itemType,
        itemId: userLibraryPins.itemId,
      })
      .from(userLibraryPins)
      .where(eq(userLibraryPins.userId, user.id));

    if (
      remainingPinRows.some(
        (p) => p.itemType === "PLAYLIST" && p.itemId === playlist.id
      )
    ) {
      throw new Error("Stale PLAYLIST pin row was not cleaned up from the DB");
    }
    console.log(
      "   ✅ Stale pin was excluded from the payload and deleted from the DB\n"
    );

    // 8. The limit must be enforced exactly at MAX_LIBRARY_PINS
    console.log("7️⃣ Verifying the pin limit is enforced...");
    // LIKED_SONGS is still pinned (1). Fill the remaining slots.
    for (let i = 0; i < MAX_LIBRARY_PINS - 1; i++) {
      const [fillPlaylist] = await db
        .insert(playlists)
        .values({
          ownerId: user.id,
          title: `Pin Fill ${i}`,
          visibility: "PUBLIC",
        })
        .returning();

      const fillRes = await app.inject({
        method: "POST",
        url: "/api/v1/library/pins",
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ itemType: "PLAYLIST", itemId: fillPlaylist.id }),
      });
      if (fillRes.statusCode !== 200) {
        throw new Error(
          `Failed to pin fill playlist ${i} (${fillRes.statusCode}): ${fillRes.body}`
        );
      }
    }

    const [overflowPlaylist] = await db
      .insert(playlists)
      .values({ ownerId: user.id, title: "Overflow Pin", visibility: "PUBLIC" })
      .returning();

    const overflowRes = await app.inject({
      method: "POST",
      url: "/api/v1/library/pins",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemType: "PLAYLIST",
        itemId: overflowPlaylist.id,
      }),
    });

    if (overflowRes.statusCode !== 400) {
      throw new Error(
        `Expected 400 when exceeding the pin limit, got ${overflowRes.statusCode}: ${overflowRes.body}`
      );
    }
    const overflowBody = JSON.parse(overflowRes.body);
    if (!overflowBody.message?.includes(String(MAX_LIBRARY_PINS))) {
      throw new Error(
        `Limit message did not mention ${MAX_LIBRARY_PINS}: ${overflowBody.message}`
      );
    }
    console.log(
      `   ✅ Limit enforced at ${MAX_LIBRARY_PINS}; overflow rejected with: "${overflowBody.message}"\n`
    );

    // 9. Event-driven cleanup — removing the target must drop its pin
    console.log("8️⃣ Verifying pins are cleaned up when their target is removed...");

    const pinRowCount = async (itemType: string, itemId: string) => {
      const rows = await db
        .select({ id: userLibraryPins.id })
        .from(userLibraryPins)
        .where(
          and(
            eq(userLibraryPins.itemType, itemType),
            eq(userLibraryPins.itemId, itemId)
          )
        );
      return rows.length;
    };

    // 9a. Unsaving a playlist drops the user's pin
    const [unsavePinPlaylist] = await db
      .insert(playlists)
      .values({ ownerId: user.id, title: "Unsave Pin", visibility: "PUBLIC" })
      .returning();
    await playlistsCacheService.savePlaylist(user.id, unsavePinPlaylist.id);
    await db
      .insert(userLibraryPins)
      .values({ userId: user.id, itemType: "PLAYLIST", itemId: unsavePinPlaylist.id });
    await playlistsCacheService.unsavePlaylist(user.id, unsavePinPlaylist.id);
    if ((await pinRowCount("PLAYLIST", unsavePinPlaylist.id)) !== 0) {
      throw new Error("Pin survived when its playlist was unsaved");
    }
    console.log("   ✅ Unsaving a playlist removed its pin");

    // 9b. Deleting a playlist drops pins for every user
    const { user: bob } = await createTestUser("Bob Library");
    createdUserIds.push(bob.id);
    const [deletePinPlaylist] = await db
      .insert(playlists)
      .values({ ownerId: user.id, title: "Delete Pin", visibility: "PUBLIC" })
      .returning();
    await db.insert(userLibraryPins).values([
      { userId: user.id, itemType: "PLAYLIST", itemId: deletePinPlaylist.id },
      { userId: bob.id, itemType: "PLAYLIST", itemId: deletePinPlaylist.id },
    ]);
    await new PlaylistsService().deletePlaylist(user.id, deletePinPlaylist.id);
    if ((await pinRowCount("PLAYLIST", deletePinPlaylist.id)) !== 0) {
      throw new Error("Pins survived when their playlist was deleted");
    }
    console.log("   ✅ Deleting a playlist removed pins for every user");

    // 9c. Unfollowing an artist drops the user's pin
    const [pinArtist] = await db
      .insert(artistProfiles)
      .values({
        stageName: "Pin Test Artist",
        slug: `pin-artist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        scope: "PERSONAL",
        ownerUserId: user.id,
      })
      .returning();
    await followsCacheService.followArtist(user.id, pinArtist.id);
    await db
      .insert(userLibraryPins)
      .values({ userId: user.id, itemType: "ARTIST", itemId: pinArtist.id });
    await followsCacheService.unfollowArtist(user.id, pinArtist.id);
    if ((await pinRowCount("ARTIST", pinArtist.id)) !== 0) {
      throw new Error("Pin survived when its artist was unfollowed");
    }
    console.log("   ✅ Unfollowing an artist removed their pin");

    // 9d. Unliking an album drops the user's pin
    const [pinAlbum] = await db
      .insert(albums)
      .values({
        artistId: pinArtist.id,
        title: "Pin Test Album",
        slug: `pin-album-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        releaseDate: "2024-01-01",
      })
      .returning();
    await likesCacheService.toggleAlbumLike(user.id, pinAlbum.id); // like
    await db
      .insert(userLibraryPins)
      .values({ userId: user.id, itemType: "ALBUM", itemId: pinAlbum.id });
    await likesCacheService.toggleAlbumLike(user.id, pinAlbum.id); // unlike
    if ((await pinRowCount("ALBUM", pinAlbum.id)) !== 0) {
      throw new Error("Pin survived when its album was unliked");
    }
    console.log("   ✅ Unliking an album removed its pin\n");

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
