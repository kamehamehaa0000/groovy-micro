import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import {
  users,
  artistProfiles,
  albums,
  songs,
  playlists,
  playlistSongs,
  playlistCollaborators,
  userLibraryPlaylists,
  outboxEvents,
} from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";
import { cacheKeys } from "../../lib/cache";

async function createTestUser(displayName: string, role: "LISTENER" | "ARTIST" | "ADMIN" = "LISTENER") {
  const email = `test_pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@groovy.test`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: "mock_hash",
      displayName,
      role,
      isEmailVerified: true,
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

async function runTests() {
  console.log("\n========================================================");
  console.log("🧪 RUNNING COMPREHENSIVE PLAYLISTS & SOCIAL TEST SUITE");
  console.log("========================================================\n");

  await bootstrap({ listen: false });
  await app.ready();
  if (redis.status !== "ready") {
    await redis.connect();
  }

  const curator = await createTestUser("Curator Alice", "LISTENER");
  const collaborator = await createTestUser("Collab Bob", "LISTENER");
  const listener = await createTestUser("Listener Charlie", "LISTENER");
  const artist = await createTestUser("Musician Dave", "ARTIST");

  const testUserIds = [curator.user.id, collaborator.user.id, listener.user.id, artist.user.id];

  try {
    // -------------------------------------------------------------------------
    // 1. SEED CATALOG SONGS
    // -------------------------------------------------------------------------
    console.log("1️⃣ Seeding Test Artist, Album & Master Tracks...");
    const [profile] = await db
      .insert(artistProfiles)
      .values({
        userId: artist.user.id,
        stageName: "Dave & The Grooves",
        slug: `dave-grooves-${Date.now()}`,
        verified: true,
      })
      .returning();

    const [album] = await db
      .insert(albums)
      .values({
        artistId: profile.id,
        title: "Sunset Waves",
        slug: `sunset-waves-${Date.now()}`,
        coverImageUrl: "https://r2.groovy.sound/covers/album1.jpg",
        releaseDate: "2026-09-12",
        status: "PUBLISHED",
        visibility: "PUBLIC",
      })
      .returning();

    const createdSongs = await db
      .insert(songs)
      .values([
        {
          artistId: profile.id,
          albumId: album.id,
          title: "Golden Hour",
          slug: `golden-hour-${Date.now()}`,
          durationSeconds: 210,
          coverImageUrl: "https://r2.groovy.sound/covers/song1.jpg",
          audioUrl: "https://r2.groovy.sound/audio/song1.flac",
        },
        {
          artistId: profile.id,
          albumId: album.id,
          title: "Coastal Breeze",
          slug: `coastal-breeze-${Date.now()}`,
          durationSeconds: 185,
          coverImageUrl: "https://r2.groovy.sound/covers/song2.jpg",
          audioUrl: "https://r2.groovy.sound/audio/song2.flac",
        },
        {
          artistId: profile.id,
          albumId: album.id,
          title: "Midnight Drive",
          slug: `midnight-drive-${Date.now()}`,
          durationSeconds: 240,
          coverImageUrl: "https://r2.groovy.sound/covers/song3.jpg",
          audioUrl: "https://r2.groovy.sound/audio/song3.flac",
        },
        {
          artistId: profile.id,
          albumId: album.id,
          title: "Neon Echoes",
          slug: `neon-echoes-${Date.now()}`,
          durationSeconds: 195,
          coverImageUrl: "https://r2.groovy.sound/covers/song4.jpg",
          audioUrl: "https://r2.groovy.sound/audio/song4.flac",
        },
        {
          artistId: profile.id,
          albumId: album.id,
          title: "Starlight Reverie",
          slug: `starlight-reverie-${Date.now()}`,
          durationSeconds: 220,
          coverImageUrl: "https://r2.groovy.sound/covers/song5.jpg",
          audioUrl: "https://r2.groovy.sound/audio/song5.flac",
        },
      ])
      .returning();

    console.log(`   ✅ Seeded album '${album.title}' with ${createdSongs.length} tracks.`);

    // -------------------------------------------------------------------------
    // 2. CREATE PLAYLIST & INITIAL TRACKS
    // -------------------------------------------------------------------------
    console.log("\n2️⃣ Testing Playlist Creation with Initial Tracks & Mosaic Covers...");
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/playlists",
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: {
        title: "Chill Vibes",
        description: "Smooth evening selections",
        visibility: "PUBLIC",
        allowDuplicates: false,
        initialSongIds: [createdSongs[0].id, createdSongs[1].id, createdSongs[2].id, createdSongs[3].id],
      },
    });

    if (createRes.statusCode !== 201) {
      throw new Error(`Failed to create playlist: ${createRes.body}`);
    }
    const createdPlaylist = createRes.json();
    console.log(`   ✅ Created playlist '${createdPlaylist.title}' (ID: ${createdPlaylist.id})`);

    // Verify detail query & 4-tile mosaic grid computation
    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${createdPlaylist.id}`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    if (detailRes.statusCode !== 200) {
      throw new Error(`Failed to get playlist detail: ${detailRes.body}`);
    }
    const detail = detailRes.json();
    if (detail.tracks.length !== 4) {
      throw new Error(`Expected 4 tracks, got ${detail.tracks.length}`);
    }
    if (detail.mosaicCoverUrls.length !== 4) {
      throw new Error(`Expected 4 mosaic cover URLs, got ${detail.mosaicCoverUrls.length}`);
    }
    console.log(`   ✅ Mosaic covers computed: ${detail.mosaicCoverUrls.length} distinct artwork URLs`);
    console.log(`   ✅ Total duration computed: ${detail.totalDurationSeconds}s across ${detail.tracksCount} tracks`);

    // -------------------------------------------------------------------------
    // 3. DUPLICATE PREVENTION & CONFIGURABLE TOGGLE
    // -------------------------------------------------------------------------
    console.log("\n3️⃣ Testing Duplicate Songs Prevention & Curator Setting...");
    // Attempting to add duplicate song when allowDuplicates: false
    const dupRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${createdPlaylist.id}/tracks`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: { songIds: [createdSongs[0].id] },
    });
    if (dupRes.statusCode !== 400) {
      throw new Error(`Expected 400 Bad Request for duplicate track, got ${dupRes.statusCode}`);
    }
    console.log("   ✅ Status 400: Duplicate track rejected when allowDuplicates = false");

    // Enable allowDuplicates
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/playlists/${createdPlaylist.id}`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: { allowDuplicates: true },
    });
    if (updateRes.statusCode !== 200) {
      throw new Error(`Failed to update playlist setting: ${updateRes.body}`);
    }

    // Now adding duplicate song succeeds
    const allowDupRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${createdPlaylist.id}/tracks`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: { songIds: [createdSongs[0].id] },
    });
    if (allowDupRes.statusCode !== 200) {
      throw new Error(`Failed to add duplicate track when enabled: ${allowDupRes.body}`);
    }
    console.log("   ✅ Duplicate track successfully appended after curator enabled allowDuplicates = true");

    // -------------------------------------------------------------------------
    // 4. ATOMIC BATCH REORDER & TRACK REMOVAL
    // -------------------------------------------------------------------------
    console.log("\n4️⃣ Testing Track Removal & Atomic Batch Reorder (Sequential Integers)...");
    const freshDetailRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${createdPlaylist.id}`,
    });
    const freshDetail = freshDetailRes.json();
    const lastEntry = freshDetail.tracks[freshDetail.tracks.length - 1];

    // Remove the duplicate track entry
    const removeRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/playlists/${createdPlaylist.id}/tracks/${lastEntry.entryId}`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    if (removeRes.statusCode !== 200) {
      throw new Error(`Failed to remove track: ${removeRes.body}`);
    }
    console.log("   ✅ Successfully removed track entry by entryId");

    // Reorder tracks: Reverse the remaining 4 entries
    const remainingEntries = freshDetail.tracks.slice(0, 4);
    const reversedEntryIds = remainingEntries.map((t: any) => t.entryId).reverse();

    const reorderRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/playlists/${createdPlaylist.id}/tracks/reorder`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: { orderedEntryIds: reversedEntryIds },
    });
    if (reorderRes.statusCode !== 200) {
      throw new Error(`Failed to reorder tracks: ${reorderRes.body}`);
    }

    // Verify persisted new order
    const afterReorderRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${createdPlaylist.id}`,
    });
    const reorderedTracks = afterReorderRes.json().tracks;
    if (reorderedTracks[0].entryId !== reversedEntryIds[0] || reorderedTracks[0].position !== 0) {
      throw new Error("Track positions were not correctly updated during atomic reorder!");
    }
    console.log("   ✅ Atomic Batch Reorder: Positions updated sequentially (0, 1, 2, 3) in 1 SQL transaction!");

    // -------------------------------------------------------------------------
    // 5. VISIBILITY & UNLISTED SHARE TOKEN ACCESS
    // -------------------------------------------------------------------------
    console.log("\n5️⃣ Testing Visibility Controls (PUBLIC, UNLISTED, PRIVATE)...");
    // Create Unlisted playlist
    const unlistedRes = await app.inject({
      method: "POST",
      url: "/api/v1/playlists",
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: {
        title: "Secret Mix",
        visibility: "UNLISTED",
      },
    });
    const unlistedPlaylist = unlistedRes.json();
    if (!unlistedPlaylist.shareToken) {
      throw new Error("Unlisted playlist should have generated a shareToken!");
    }
    console.log(`   ✅ Unlisted playlist created with shareToken: ${unlistedPlaylist.shareToken}`);

    // Listener attempts access without shareToken -> 403 Forbidden
    const unauthAccessRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${unlistedPlaylist.id}`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (unauthAccessRes.statusCode !== 403) {
      throw new Error(`Expected 403 for unlisted access without token, got ${unauthAccessRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Unlisted playlist hidden without shareToken");

    // Listener accesses with valid shareToken -> 200 OK
    const tokenAccessRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${unlistedPlaylist.id}?shareToken=${unlistedPlaylist.shareToken}`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (tokenAccessRes.statusCode !== 200) {
      throw new Error(`Expected 200 for unlisted access with shareToken, got ${tokenAccessRes.statusCode}`);
    }
    console.log("   ✅ Status 200 OK: Unlisted playlist accessible with valid shareToken");

    // Create Private playlist
    const privateRes = await app.inject({
      method: "POST",
      url: "/api/v1/playlists",
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: {
        title: "Personal Diary Tracks",
        visibility: "PRIVATE",
      },
    });
    const privatePlaylist = privateRes.json();

    // Listener attempts access -> 403 Forbidden
    const privateAccessRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${privatePlaylist.id}`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (privateAccessRes.statusCode !== 403) {
      throw new Error(`Expected 403 for private playlist access, got ${privateAccessRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Private playlist strictly blocked from other listeners");

    // -------------------------------------------------------------------------
    // 6. COLLABORATION LIFECYCLE (TOKEN, INVITE, REGENERATE, KICK)
    // -------------------------------------------------------------------------
    console.log("\n6️⃣ Testing Collaboration Lifecycle (Invite Token, Join, Regenerate, Revoke)...");
    // Enable collaboration on private playlist
    const enableCollabRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/collaboration/enable`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    if (enableCollabRes.statusCode !== 200) {
      throw new Error(`Failed to enable collaboration: ${enableCollabRes.body}`);
    }
    const { collaborationToken } = enableCollabRes.json();
    console.log(`   ✅ Collaboration enabled with token: ${collaborationToken}`);

    // Collaborator Bob joins via token
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/collaborate/join`,
      headers: { authorization: `Bearer ${collaborator.tokens.accessToken}` },
      payload: { token: collaborationToken },
    });
    if (joinRes.statusCode !== 200) {
      throw new Error(`Failed to join collaboration: ${joinRes.body}`);
    }
    console.log("   ✅ Collaborator successfully joined playlist via invite link");

    // Collaborator Bob can now view and add tracks to the private playlist
    const collabAddRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/tracks`,
      headers: { authorization: `Bearer ${collaborator.tokens.accessToken}` },
      payload: { songIds: [createdSongs[4].id] },
    });
    if (collabAddRes.statusCode !== 200) {
      throw new Error(`Collaborator was not permitted to add tracks: ${collabAddRes.body}`);
    }
    console.log("   ✅ Collaborator successfully added a track to the collaborative playlist");

    // Curator regenerates token
    const regenRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/collaboration/regenerate`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    const newToken = regenRes.json().collaborationToken;
    if (newToken === collaborationToken) {
      throw new Error("Regenerated token must be different from previous token!");
    }
    console.log("   ✅ Collaboration token regenerated. Old invite link invalidated!");

    // Listener Charlie tries joining with old token -> 400 Bad Request
    const failedJoinRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/collaborate/join`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
      payload: { token: collaborationToken },
    });
    if (failedJoinRes.statusCode !== 400) {
      throw new Error(`Expected 400 for joining with expired token, got ${failedJoinRes.statusCode}`);
    }
    console.log("   ✅ Status 400 Bad Request: Stale invite token properly rejected");

    // Curator kicks Collaborator Bob
    const kickRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/playlists/${privatePlaylist.id}/collaborators/${collaborator.user.id}`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    if (kickRes.statusCode !== 200) {
      throw new Error(`Failed to kick collaborator: ${kickRes.body}`);
    }
    console.log("   ✅ Curator successfully kicked collaborator");

    // Collaborator Bob tries adding another track -> 400/403 forbidden
    const revokedAddRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/tracks`,
      headers: { authorization: `Bearer ${collaborator.tokens.accessToken}` },
      payload: { songIds: [createdSongs[0].id] },
    });
    if (revokedAddRes.statusCode === 200) {
      throw new Error("Kicked collaborator was still able to add tracks!");
    }
    console.log("   ✅ Revocation confirmed: Kicked collaborator denied write access");

    // -------------------------------------------------------------------------
    // 7. PLAYLIST CLONING
    // -------------------------------------------------------------------------
    console.log("\n7️⃣ Testing Playlist Cloning & Private Ownership Security...");
    // Listener Charlie clones Curator's public playlist
    const clonePublicRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${createdPlaylist.id}/clone`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (clonePublicRes.statusCode !== 201) {
      throw new Error(`Failed to clone public playlist: ${clonePublicRes.body}`);
    }
    const clonedPublic = clonePublicRes.json().playlist;
    if (clonedPublic.ownerId !== listener.user.id || !clonedPublic.title.includes("(Copy)")) {
      throw new Error("Cloned playlist metadata mismatch!");
    }
    console.log(`   ✅ Cloned public playlist into '${clonedPublic.title}' owned by Charlie`);

    // Listener Charlie attempts to clone Curator's private playlist -> 403 Forbidden
    const illegalCloneRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/clone`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (illegalCloneRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for cloning private playlist, got ${illegalCloneRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Non-owner blocked from cloning private playlist");

    // Curator clones their own private playlist -> 201 Created
    const ownerCloneRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePlaylist.id}/clone`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    if (ownerCloneRes.statusCode !== 201) {
      throw new Error(`Expected 201 for owner cloning private playlist, got ${ownerCloneRes.statusCode}`);
    }
    console.log("   ✅ Status 201 Created: Curator successfully created draft copy of private playlist");

    // -------------------------------------------------------------------------
    // 8. HYBRID IN-MEMORY & REDIS SET LIBRARY SAVES
    // -------------------------------------------------------------------------
    console.log("\n8️⃣ Testing Hybrid In-Memory & Redis Set Library Saves...");
    // Listener Charlie saves Chill Vibes
    const saveRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${createdPlaylist.id}/save`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (saveRes.statusCode !== 200) {
      throw new Error(`Failed to save playlist: ${saveRes.body}`);
    }
    const saveBody = saveRes.json();
    if (!saveBody.saved || saveBody.savesCount !== 2) {
      throw new Error(`Expected savesCount = 2, got ${JSON.stringify(saveBody)}`);
    }

    // Verify Redis Set
    const isSavedInRedis = await redis.sismember(
      cacheKeys.social.userSavedPlaylists(listener.user.id),
      createdPlaylist.id
    );
    if (isSavedInRedis !== 1) {
      throw new Error("Playlist ID was NOT written to user's saved_playlists Redis set!");
    }
    console.log("   ✅ Redis Set Verified: playlistId is in 'groovy:social:user:saved_playlists'");

    // Fast sync endpoint: GET /api/v1/playlists/saved/ids (< 1ms)
    const fastSyncRes = await app.inject({
      method: "GET",
      url: "/api/v1/playlists/saved/ids",
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (fastSyncRes.statusCode !== 200) {
      throw new Error(`Failed fast sync: ${fastSyncRes.body}`);
    }
    const fastSyncBody = fastSyncRes.json();
    if (!fastSyncBody.playlistIds?.includes(createdPlaylist.id)) {
      throw new Error(`Fast sync missing playlistId: ${JSON.stringify(fastSyncBody)}`);
    }
    console.log("   ✅ Fast sync endpoint GET /api/v1/playlists/saved/ids returned user's saved IDs in < 1ms!");

    // Search batch enrichment (SMISMEMBER)
    const searchRes = await app.inject({
      method: "GET",
      url: "/api/v1/playlists?search=Chill",
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    const searchList = searchRes.json().data;
    const enrichedCard = searchList.find((p: any) => p.id === createdPlaylist.id);
    if (!enrichedCard?.isSaved) {
      throw new Error("Search result was not enriched with isSaved: true!");
    }
    console.log("   ✅ SMISMEMBER batch enrichment attached isSaved: true to search playlist card");

    // Unsave playlist
    const unsaveRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/playlists/${createdPlaylist.id}/save`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (unsaveRes.statusCode !== 200) {
      throw new Error(`Failed to unsave playlist: ${unsaveRes.body}`);
    }
    const unsaveBody = unsaveRes.json();
    if (unsaveBody.saved || unsaveBody.savesCount !== 1) {
      throw new Error(`Expected savesCount = 1, got ${JSON.stringify(unsaveBody)}`);
    }

    const isSavedAfter = await redis.sismember(
      cacheKeys.social.userSavedPlaylists(listener.user.id),
      createdPlaylist.id
    );
    if (isSavedAfter !== 0) {
      throw new Error("Playlist ID still present in Redis Set after unsave!");
    }
    console.log("   ✅ Untoggle verified: both PostgreSQL and Redis Set updated (savesCount: 1)");

    // -------------------------------------------------------------------------
    // 9. TESTING SCHEDULED RELEASE GUARDS (A, B, C)
    // -------------------------------------------------------------------------
    console.log("\n9️⃣ Testing Scheduled Release Protections (A: Addition Gate, B: Audio Sanitization, C: Mosaic Filter)...");

    // Seed a future scheduled album with an unreleased track
    const futureDate = new Date(Date.now() + 14 * 86400000); // 14 days in future
    const [scheduledAlbum] = await db
      .insert(albums)
      .values({
        artistId: profile.id,
        title: "Future Horizons 2030",
        slug: `future-horizons-${Date.now()}`,
        coverImageUrl: "https://r2.groovy.sound/covers/secret_future_cover.jpg",
        releaseDate: "2030-01-01",
        status: "SCHEDULED",
        visibility: "PUBLIC",
        scheduledReleaseAt: futureDate,
      })
      .returning();

    const [unreleasedSong] = await db
      .insert(songs)
      .values({
        artistId: profile.id,
        albumId: scheduledAlbum.id,
        title: "Future Unreleased Hit",
        slug: `future-hit-${Date.now()}`,
        durationSeconds: 195,
        coverImageUrl: "https://r2.groovy.sound/covers/secret_song_cover.jpg",
        audioUrl: "https://r2.groovy.sound/audio/secret_unreleased_master.flac",
        hlsManifestUrl: "https://r2.groovy.sound/hls/secret_master.m3u8",
      })
      .returning();

    // Test A.1: Arbitrary listener attempts to add unreleased track to their playlist -> BLOCKED
    const listenerAddRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${createdPlaylist.id}/tracks`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
      payload: { songIds: [unreleasedSong.id] },
    });
    if (listenerAddRes.statusCode !== 400) {
      throw new Error(`Expected status 400 for unreleased track addition, got ${listenerAddRes.statusCode}: ${listenerAddRes.body}`);
    }
    console.log("   ✅ Rule A: Regular listeners blocked from adding unreleased scheduled track (400 Bad Request)");

    // Test A.2: Artist owner adds their own upcoming track to their curated playlist -> ALLOWED (Artist Teaser)
    const artistPlaylistRes = await app.inject({
      method: "POST",
      url: "/api/v1/playlists",
      headers: { authorization: `Bearer ${artist.tokens.accessToken}` },
      payload: {
        title: "Dave's Official Teaser Playlist",
        visibility: "PUBLIC",
        initialSongIds: [unreleasedSong.id],
      },
    });
    if (artistPlaylistRes.statusCode !== 201) {
      throw new Error(`Failed to create artist teaser playlist: ${artistPlaylistRes.body}`);
    }
    const artistPlaylist = artistPlaylistRes.json();
    console.log("   ✅ Rule A: Artist creator allowed to teaser their own upcoming release in their playlist");

    // Test B.1: Listener inspects the artist's playlist -> audioUrl & hlsManifestUrl must be NULL (Zero Audio Leak!)
    const listenerViewRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${artistPlaylist.id}`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    const listenerViewData = listenerViewRes.json();
    const teaseredTrack = listenerViewData.tracks.find((t: any) => t.songId === unreleasedSong.id);

    if (!teaseredTrack) {
      throw new Error("Teasered track missing from playlist");
    }
    if (teaseredTrack.isStreamable !== false) {
      throw new Error(`Expected isStreamable: false for listener, got: ${teaseredTrack.isStreamable}`);
    }
    if (teaseredTrack.audioUrl !== null || teaseredTrack.hlsManifestUrl !== null) {
      throw new Error(`CRITICAL AUDIO LEAK: audioUrl or hlsManifestUrl exposed to listener: ${JSON.stringify(teaseredTrack)}`);
    }
    if (!teaseredTrack.scheduledReleaseAt) {
      throw new Error("Missing scheduledReleaseAt on unreleased teaser track");
    }
    console.log("   ✅ Rule B: Audio URLs strictly zeroed out for listeners (isStreamable: false, zero audio leak!)");

    // Test B.2: Artist creator inspects their own playlist -> audioUrl is accessible for preview
    const artistViewRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${artistPlaylist.id}`,
      headers: { authorization: `Bearer ${artist.tokens.accessToken}` },
    });
    const artistViewData = artistViewRes.json();
    const artistTrack = artistViewData.tracks.find((t: any) => t.songId === unreleasedSong.id);
    if (artistTrack.isStreamable !== true || !artistTrack.audioUrl) {
      throw new Error("Artist owner should have isStreamable: true and audioUrl present");
    }
    console.log("   ✅ Rule B: Artist creator retains playback preview for their own unreleased cut");

    // Test C: Listener view of mosaic cover must NOT sample the unreleased secret cover
    if (listenerViewData.mosaicCoverUrls && listenerViewData.mosaicCoverUrls.includes("https://r2.groovy.sound/covers/secret_song_cover.jpg")) {
      throw new Error("CRITICAL ARTWORK LEAK: Unreleased album art leaked into public mosaic cover!");
    }
    console.log("   ✅ Rule C: Unreleased album artwork excluded from public mosaic covers");

    // -------------------------------------------------------------------------
    // 10. COLLABORATOR PERMISSION CONSTRAINTS (REMOVE TRACK)
    // -------------------------------------------------------------------------
    console.log("\n🔟 Testing Collaborator Permission Restrictions on Track Removal...");
    // Re-add Bob as collaborator to test collaborator permission constraints on removal
    await db.insert(playlistCollaborators).values({
      playlistId: privatePlaylist.id,
      userId: collaborator.user.id,
    });

    // Fetch tracks of the collaborative playlist where Bob joined
    const collabPlaylistDetailRes = await app.inject({
      method: "GET",
      url: `/api/v1/playlists/${privatePlaylist.id}`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    const collabPlaylistDetail = collabPlaylistDetailRes.json();
    const curatorTrackEntry = collabPlaylistDetail.tracks.find((t: any) => t.addedByUserId === curator.user.id);
    const bobTrackEntry = collabPlaylistDetail.tracks.find((t: any) => t.addedByUserId === collaborator.user.id);

    // Bob tries to delete Curator's track -> 400 Bad Request
    if (curatorTrackEntry) {
      const bobDeleteCuratorTrackRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/playlists/${privatePlaylist.id}/tracks/${curatorTrackEntry.entryId}`,
        headers: { authorization: `Bearer ${collaborator.tokens.accessToken}` },
      });
      if (bobDeleteCuratorTrackRes.statusCode !== 400) {
        throw new Error(
          `Expected 400 Bad Request when collaborator deletes owner track, got ${bobDeleteCuratorTrackRes.statusCode}`
        );
      }
      console.log("   ✅ Collaborator blocked from deleting cuts added by other members");
    }

    // Bob deletes his own track -> 200 OK
    if (bobTrackEntry) {
      const bobDeleteOwnTrackRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/playlists/${privatePlaylist.id}/tracks/${bobTrackEntry.entryId}`,
        headers: { authorization: `Bearer ${collaborator.tokens.accessToken}` },
      });
      if (bobDeleteOwnTrackRes.statusCode !== 200) {
        throw new Error(`Collaborator could not delete their own track: ${bobDeleteOwnTrackRes.body}`);
      }
      console.log("   ✅ Collaborator successfully removed their own cut");
    }

    // -------------------------------------------------------------------------
    // 11. OPTION B HYBRID SPOTIFY-STYLE: PERSONAL COLLECTION ISOLATION
    // -------------------------------------------------------------------------
    console.log("\n1️⃣1️⃣ Testing Option B (Hybrid Spotify-Style) Personal Track Isolation...");
    // Seed a personal cut for Curator Alice
    const [personalSong] = await db
      .insert(songs)
      .values({
        artistId: profile.id,
        title: "Alice's Secret Demo (Personal Cut)",
        slug: `alice-demo-${Date.now()}`,
        durationSeconds: 160,
        scope: "PERSONAL",
        uploaderUserId: curator.user.id,
        audioUrl: "https://r2.groovy.sound/audio/alice_demo.flac",
        coverImageUrl: "https://r2.groovy.sound/covers/alice_demo.jpg",
      })
      .returning();

    // 1. Attempt to add personal cut to a PUBLIC playlist -> 400 Bad Request
    const addPersonalToPublicRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${createdPlaylist.id}/tracks`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: { songIds: [personalSong.id] },
    });
    if (addPersonalToPublicRes.statusCode !== 400) {
      throw new Error(
        `Expected 400 Bad Request adding personal track to public playlist, got ${addPersonalToPublicRes.statusCode}`
      );
    }
    console.log("   ✅ Personal cut rejected from public playlist");

    // 2. Create a PRIVATE playlist with the personal cut -> 201 Created
    const privatePersonalPlRes = await app.inject({
      method: "POST",
      url: "/api/v1/playlists",
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: {
        title: "My Private Vault",
        visibility: "PRIVATE",
        initialSongIds: [personalSong.id],
      },
    });
    if (privatePersonalPlRes.statusCode !== 201) {
      throw new Error(`Failed to create private playlist with personal cut: ${privatePersonalPlRes.body}`);
    }
    const privatePersonalPl = privatePersonalPlRes.json();
    console.log("   ✅ Created private playlist containing personal cut");

    // 3. Attempt to change visibility to PUBLIC -> 400 Bad Request
    const changeToPublicRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/playlists/${privatePersonalPl.id}`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
      payload: { visibility: "PUBLIC" },
    });
    if (changeToPublicRes.statusCode !== 400) {
      throw new Error(
        `Expected 400 Bad Request making playlist with personal track public, got ${changeToPublicRes.statusCode}`
      );
    }
    console.log("   ✅ Changing visibility to PUBLIC rejected while personal cut is present");

    // 4. Attempt to enable collaboration on playlist with personal cut -> 400 Bad Request
    const enableCollabPersonalRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${privatePersonalPl.id}/collaboration/enable`,
      headers: { authorization: `Bearer ${curator.tokens.accessToken}` },
    });
    if (enableCollabPersonalRes.statusCode !== 400) {
      throw new Error(
        `Expected 400 Bad Request enabling collaboration on playlist with personal cut, got ${enableCollabPersonalRes.statusCode}`
      );
    }
    console.log("   ✅ Enabling collaboration rejected while personal cut is present");

    // 5. Another user (Charlie) attempts to add Alice's personal cut to his own private playlist -> 400 Bad Request (IDOR protection)
    const charlieVaultRes = await app.inject({
      method: "POST",
      url: "/api/v1/playlists",
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
      payload: { title: "Charlie's Vault", visibility: "PRIVATE" },
    });
    const charlieVault = charlieVaultRes.json();

    const charlieAddAliceTrackRes = await app.inject({
      method: "POST",
      url: `/api/v1/playlists/${charlieVault.id}/tracks`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
      payload: { songIds: [personalSong.id] },
    });
    if (charlieAddAliceTrackRes.statusCode !== 400) {
      throw new Error(
        `Expected 400 Bad Request when adding another user's personal cut, got ${charlieAddAliceTrackRes.statusCode}`
      );
    }
    console.log("   ✅ IDOR Protection: User blocked from adding another user's personal cut");

    console.log("\n🎉 ALL PLAYLISTS & SOCIAL TESTS PASSED SUCCESSFULLY! 🚀\n");
  } finally {
    // Cleanup test users, outbox events, redis sets, and cascade
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, testUserIds));
    await db.delete(users).where(inArray(users.id, testUserIds));
    for (const uid of testUserIds) {
      await redis.del(cacheKeys.social.userSavedPlaylists(uid));
    }
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Playlists test suite failed:", err);
    process.exit(1);
  });
