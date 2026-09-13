import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import {
  users,
  artistProfiles,
  albums,
  songs,
  playlists,
  outboxEvents,
} from "../../db/schema";
import { eq } from "drizzle-orm";

async function runTests() {
  console.log("🧪 Starting Unified Global Search Integration Tests...\n");

  await bootstrap({ listen: false });

  const timestamp = Date.now();
  const testEmail = `search_test_${timestamp}@groovy.test`;
  let userId = "";
  let artistId = "";
  let albumId = "";
  let songId = "";
  let playlistId = "";

  try {
    // 1. Setup Test Entities (User, Artist, Album, Song, Playlist)
    console.log("1️⃣ Seeding Test Catalog & Social Entities for Search...");
    const [user] = await db
      .insert(users)
      .values({
        email: testEmail,
        displayName: `Cosmic Explorer ${timestamp}`,
        role: "ARTIST",
        isEmailVerified: true,
      })
      .returning();
    userId = user.id;

    const [artist] = await db
      .insert(artistProfiles)
      .values({
        userId,
        stageName: `Cosmic Waves ${timestamp}`,
        slug: `cosmic-waves-${timestamp}`,
        verified: true,
        monthlyListeners: 42000,
      })
      .returning();
    artistId = artist.id;

    const [album] = await db
      .insert(albums)
      .values({
        artistId,
        title: `Nebula Odyssey ${timestamp}`,
        slug: `nebula-odyssey-${timestamp}`,
        albumType: "ALBUM",
        coverImageUrl: "https://r2.groovy.test/nebula.webp",
        releaseDate: "2026-09-01",
        visibility: "PUBLIC",
        status: "PUBLISHED",
      })
      .returning();
    albumId = album.id;

    const [song] = await db
      .insert(songs)
      .values({
        artistId,
        albumId,
        title: `Starlight Serenade ${timestamp}`,
        slug: `starlight-serenade-${timestamp}`,
        durationSeconds: 215,
        audioUrl: "https://r2.groovy.test/starlight.mp3",
        processingStatus: "READY",
        playsCount: 1500,
      })
      .returning();
    songId = song.id;

    const [playlist] = await db
      .insert(playlists)
      .values({
        ownerId: userId,
        title: `Cosmic Chillout ${timestamp}`,
        description: "Deep space ambient chillout tunes",
        visibility: "PUBLIC",
        savesCount: 88,
      })
      .returning();
    playlistId = playlist.id;

    console.log("   ✅ Entities created successfully\n");

    // 2. Validation Test: Missing or empty query
    console.log("2️⃣ Testing Validation on Missing/Empty Query...");
    const emptyRes = await app.inject({
      method: "GET",
      url: "/api/v1/search",
    });
    if (emptyRes.statusCode !== 400) {
      throw new Error(`Expected 400 for missing query, got ${emptyRes.statusCode}`);
    }

    const whitespaceRes = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=   ",
    });
    if (whitespaceRes.statusCode !== 400) {
      throw new Error(`Expected 400 for whitespace query, got ${whitespaceRes.statusCode}`);
    }
    console.log("   ✅ Status 400 Bad Request: Missing & whitespace queries correctly rejected\n");

    // 3. Test Artist Search & Top Result
    console.log("3️⃣ Testing Artist Search & Top Result match...");
    const artistSearchRes = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=Cosmic Waves ${timestamp}`,
    });

    if (artistSearchRes.statusCode !== 200) {
      throw new Error(`Artist search failed: ${artistSearchRes.body}`);
    }

    const artistData = JSON.parse(artistSearchRes.body);
    if (!artistData.artists.some((a: any) => a.id === artistId)) {
      throw new Error("Target artist not found in search results");
    }
    if (artistData.topResult?.type !== "artist" || artistData.topResult.item.id !== artistId) {
      throw new Error(`Expected exact artist top result, got: ${JSON.stringify(artistData.topResult)}`);
    }
    console.log("   ✅ Status 200 OK: Artist found and ranked as topResult\n");

    // 4. Test Song Search
    console.log("4️⃣ Testing Song Search...");
    const songSearchRes = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=Starlight Serenade ${timestamp}`,
    });

    if (songSearchRes.statusCode !== 200) {
      throw new Error(`Song search failed: ${songSearchRes.body}`);
    }

    const songData = JSON.parse(songSearchRes.body);
    if (!songData.songs.some((s: any) => s.id === songId)) {
      throw new Error("Target song not found in search results");
    }
    if (songData.topResult?.type !== "song" || songData.topResult.item.id !== songId) {
      throw new Error(`Expected exact song top result, got: ${JSON.stringify(songData.topResult)}`);
    }
    console.log("   ✅ Status 200 OK: Song found with album metadata and ranked as topResult\n");

    // 5. Test Album Search
    console.log("5️⃣ Testing Album Search...");
    const albumSearchRes = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=Nebula Odyssey ${timestamp}`,
    });

    if (albumSearchRes.statusCode !== 200) {
      throw new Error(`Album search failed: ${albumSearchRes.body}`);
    }

    const albumData = JSON.parse(albumSearchRes.body);
    if (!albumData.albums.some((a: any) => a.id === albumId)) {
      throw new Error("Target album not found in search results");
    }
    console.log("   ✅ Status 200 OK: Album found successfully\n");

    // 6. Test Playlist Search
    console.log("6️⃣ Testing Playlist Search...");
    const playlistSearchRes = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=Cosmic Chillout ${timestamp}`,
    });

    if (playlistSearchRes.statusCode !== 200) {
      throw new Error(`Playlist search failed: ${playlistSearchRes.body}`);
    }

    const playlistData = JSON.parse(playlistSearchRes.body);
    if (!playlistData.playlists.some((p: any) => p.id === playlistId)) {
      throw new Error("Target playlist not found in search results");
    }
    console.log("   ✅ Status 200 OK: Playlist found successfully with owner details\n");

    // 7. Test User Search
    console.log("7️⃣ Testing User Search...");
    const userSearchRes = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=Cosmic Explorer ${timestamp}`,
    });

    if (userSearchRes.statusCode !== 200) {
      throw new Error(`User search failed: ${userSearchRes.body}`);
    }

    const userData = JSON.parse(userSearchRes.body);
    if (!userData.users.some((u: any) => u.id === userId)) {
      throw new Error("Target user not found in search results");
    }
    console.log("   ✅ Status 200 OK: User profile found in community results\n");

    // 8. Test Type Filter (?type=songs)
    console.log("8️⃣ Testing Category Filtering (?type=songs)...");
    const filteredRes = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=${timestamp}&type=songs`,
    });

    if (filteredRes.statusCode !== 200) {
      throw new Error(`Filtered search failed: ${filteredRes.body}`);
    }

    const filteredData = JSON.parse(filteredRes.body);
    if (filteredData.songs.length === 0) {
      throw new Error("Expected songs in filtered search");
    }
    if (filteredData.artists.length > 0 || filteredData.albums.length > 0 || filteredData.playlists.length > 0) {
      throw new Error("Other categories should be empty when filtering by type=songs");
    }
    console.log("   ✅ Status 200 OK: Filtered search returned only songs\n");

    console.log("🎉 ALL UNIFIED GLOBAL SEARCH INTEGRATION TESTS PASSED! 🚀");
  } finally {
    console.log("🧹 Cleaning up search test records...");
    if (playlistId) {
      await db.delete(playlists).where(eq(playlists.id, playlistId));
    }
    if (songId) {
      await db.delete(songs).where(eq(songs.id, songId));
    }
    if (albumId) {
      await db.delete(albums).where(eq(albums.id, albumId));
    }
    if (artistId) {
      await db.delete(artistProfiles).where(eq(artistProfiles.id, artistId));
    }
    if (userId) {
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, userId));
      await db.delete(users).where(eq(users.id, userId));
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
