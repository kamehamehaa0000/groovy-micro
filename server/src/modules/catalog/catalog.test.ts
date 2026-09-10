import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, artistProfiles, albums, songs, songCredits, albumLikes, songLikes } from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";
import { ArtistsService } from "../artists/artists.service";

async function createTestArtistUser(name: string, stageName: string) {
  const email = `cat_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@groovy.test`;
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

  const artistsService = new ArtistsService();
  const upgradeResult = await artistsService.createArtistProfile(user.id, {
    stageName,
  });

  const authService = new AuthService(app);
  const tokens = await authService.issueTokenPair({
    id: user.id,
    email: user.email,
    role: "ARTIST",
    tokenVersion: user.tokenVersion,
  });

  return { user, profile: upgradeResult.profile, tokens };
}

async function createTestListenerUser(name: string) {
  const email = `listener_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@groovy.test`;
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
    role: "LISTENER",
    tokenVersion: user.tokenVersion,
  });

  return { user, tokens };
}

async function runCatalogTests() {
  console.log("🎵 Starting Comprehensive Catalog (Albums, Songs, Credits, Soft-Delete & Likes) Integration Tests...\n");

  await bootstrap({ listen: false });

  const createdUserIds: string[] = [];

  try {
    // 1. Provision Test Artists & Listener
    console.log("1️⃣ Provisioning Test Artists & Listener...");
    const artistA = await createTestArtistUser("Miles User", "Miles Davis");
    const artistB = await createTestArtistUser("John User", "John Coltrane");
    const listener = await createTestListenerUser("Jazz Fanatic");

    createdUserIds.push(artistA.user.id, artistB.user.id, listener.user.id);
    console.log("   ✅ Artist A:", artistA.profile.stageName, `(@${artistA.profile.slug})`);
    console.log("   ✅ Artist B:", artistB.profile.stageName, `(@${artistB.profile.slug})`);
    console.log("   ✅ Listener:", listener.user.displayName, "\n");

    // 2. Create Album with Initial Tracks and Credits
    console.log("2️⃣ Testing Album Creation with Initial Tracks & Multi-Artist Credits (POST /api/v1/albums)...");
    const createAlbumRes = await app.inject({
      method: "POST",
      url: "/api/v1/albums",
      headers: { authorization: `Bearer ${artistA.tokens.accessToken}` },
      payload: {
        title: "Kind of Blue",
        albumType: "ALBUM",
        coverImageUrl: "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/albums/kind-of-blue/cover.webp",
        description: "The definitive modal jazz album recorded in 30th Street Studio, NYC.",
        releaseDate: "1959-08-17",
        tracks: [
          {
            title: "So What",
            genre: "Modal Jazz",
            durationSeconds: 562,
            isExplicit: false,
            audioUrl: "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/audio/raw/so-what.flac",
            credits: [
              {
                artistId: artistB.profile.id,
                role: "FEATURED",
              },
            ],
          },
          {
            title: "Freddie Freeloader",
            genre: "Modal Jazz",
            durationSeconds: 589,
            isExplicit: false,
          },
        ],
      },
    });

    if (createAlbumRes.statusCode !== 201) {
      throw new Error(`Expected 201 Created for album, got ${createAlbumRes.statusCode}: ${createAlbumRes.body}`);
    }

    const albumData = JSON.parse(createAlbumRes.body);
    const albumId = albumData.id;

    if (albumData.slug !== "kind-of-blue" || albumData.totalTracks !== 2 || albumData.totalDurationSeconds !== 1151) {
      throw new Error(`Album metadata mismatch: ${createAlbumRes.body}`);
    }
    console.log("   ✅ Album Created: ID:", albumId, "Slug:", albumData.slug);
    console.log("   ✅ Total Tracks:", albumData.totalTracks, "Total Duration:", albumData.totalDurationSeconds, "sec");

    const track1 = albumData.tracks[0];
    const track2 = albumData.tracks[1];
    if (track1.slug !== "so-what" || track1.processingStatus !== "READY") {
      throw new Error(`Track 1 status mismatch: ${JSON.stringify(track1)}`);
    }
    if (track2.slug !== "freddie-freeloader" || track2.processingStatus !== "PENDING") {
      throw new Error(`Track 2 status mismatch: ${JSON.stringify(track2)}`);
    }
    console.log("   ✅ Track 1 audioUrl provided -> processingStatus set to READY");
    console.log("   ✅ Track 2 pending audio -> processingStatus set to PENDING\n");

    // 3. Public Dual-Lookup for Album
    console.log("3️⃣ Testing Public Album Dual-Lookup (GET /api/v1/albums/:idOrSlug)...");
    const slugLookupRes = await app.inject({
      method: "GET",
      url: "/api/v1/albums/kind-of-blue",
    });

    if (slugLookupRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK from slug lookup, got ${slugLookupRes.statusCode}: ${slugLookupRes.body}`);
    }

    const slugAlbum = JSON.parse(slugLookupRes.body);
    if (slugAlbum.id !== albumId || slugAlbum.tracks.length !== 2) {
      throw new Error("Album tracklist mismatch on slug lookup");
    }

    // Verify credits on Track 1
    const t1Credits = slugAlbum.tracks[0].credits;
    const featuredColtrane = t1Credits.find(
      (c: any) => c.artistId === artistB.profile.id && c.role === "FEATURED"
    );
    if (!featuredColtrane) {
      throw new Error("Track 1 missing featured credit for Artist B");
    }
    console.log("   ✅ Status 200 OK: Album retrieved by slug 'kind-of-blue'");
    console.log("   ✅ Multi-artist credit verified on track 1: Featured Artist =", featuredColtrane.stageName);

    // Lookup by UUID
    const uuidLookupRes = await app.inject({
      method: "GET",
      url: `/api/v1/albums/${albumId}`,
    });
    if (uuidLookupRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK from UUID lookup, got ${uuidLookupRes.statusCode}`);
    }
    console.log("   ✅ Status 200 OK: Album retrieved by UUID\n");

    // 4. Append a Song to the Album
    console.log("4️⃣ Testing Appending a Song to an Album (POST /api/v1/songs)...");
    const appendSongRes = await app.inject({
      method: "POST",
      url: "/api/v1/songs",
      headers: { authorization: `Bearer ${artistA.tokens.accessToken}` },
      payload: {
        title: "Blue in Green",
        albumId: albumId,
        genre: "Modal Jazz",
        durationSeconds: 337,
        audioUrl: "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/audio/raw/blue-in-green.flac",
      },
    });

    if (appendSongRes.statusCode !== 201) {
      throw new Error(`Failed to append song: ${appendSongRes.body}`);
    }

    const track3 = JSON.parse(appendSongRes.body);
    if (track3.trackNumber !== 3 || track3.slug !== "blue-in-green") {
      throw new Error(`Track 3 trackNumber or slug mismatch: ${appendSongRes.body}`);
    }
    console.log("   ✅ Track 3 appended: ID:", track3.id, "Track Number:", track3.trackNumber);

    // Check that album totalTracks and totalDurationSeconds updated
    const updatedAlbumRes = await app.inject({
      method: "GET",
      url: `/api/v1/albums/${albumId}`,
    });
    const updatedAlbumData = JSON.parse(updatedAlbumRes.body);
    if (updatedAlbumData.totalTracks !== 3 || updatedAlbumData.totalDurationSeconds !== 1488) {
      throw new Error(`Album totalTracks did not increment: ${updatedAlbumRes.body}`);
    }
    console.log("   ✅ Album aggregates dynamically incremented: totalTracks = 3, duration = 1488s\n");

    // 5. Detach / Remove a Song from an Album (Make it a Standalone Single)
    console.log("5️⃣ Testing Detaching Song from Album (PATCH /api/v1/songs/:id with albumId = null)...");
    const detachRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/songs/${track3.id}`,
      headers: { authorization: `Bearer ${artistA.tokens.accessToken}` },
      payload: {
        albumId: null,
        trackNumber: null,
      },
    });

    if (detachRes.statusCode !== 200) {
      throw new Error(`Failed to detach song: ${detachRes.body}`);
    }

    const detachedSong = JSON.parse(detachRes.body);
    if (detachedSong.albumId !== null) {
      throw new Error("albumId was not set to null");
    }
    console.log("   ✅ Song successfully detached from album (now a standalone track)");

    // Verify album totals decremented
    const albumAfterDetachRes = await app.inject({
      method: "GET",
      url: `/api/v1/albums/${albumId}`,
    });
    const albumAfterDetach = JSON.parse(albumAfterDetachRes.body);
    if (albumAfterDetach.totalTracks !== 2 || albumAfterDetach.totalDurationSeconds !== 1151) {
      throw new Error(`Album totals did not decrement after song detach: ${albumAfterDetachRes.body}`);
    }
    console.log("   ✅ Album aggregates updated after song removal: totalTracks = 2, duration = 1151s\n");

    // 6. Discography & Appears-On Collaborations
    console.log("6️⃣ Testing Discography & Collaborations / Appears-On Endpoint...");
    // Artist A discography
    const artistADiscoRes = await app.inject({
      method: "GET",
      url: `/api/v1/artists/${artistA.profile.slug}/discography`,
    });
    if (artistADiscoRes.statusCode !== 200) {
      throw new Error(`Failed to get Artist A discography: ${artistADiscoRes.body}`);
    }
    const artistADisco = JSON.parse(artistADiscoRes.body);
    if (artistADisco.albums.length !== 1 || artistADisco.albums[0].slug !== "kind-of-blue") {
      throw new Error("Artist A missing album in discography");
    }
    console.log("   ✅ Artist A discography returns primary album 'Kind of Blue'");

    // Artist B discography (checking "Appears On")
    const artistBDiscoRes = await app.inject({
      method: "GET",
      url: `/api/v1/artists/${artistB.profile.slug}/discography`,
    });
    const artistBDisco = JSON.parse(artistBDiscoRes.body);
    const appearsOnTrack = artistBDisco.appearsOn.find((t: any) => t.songTitle === "So What");
    if (!appearsOnTrack) {
      throw new Error("Artist B 'appearsOn' discography does not contain featured track 'So What'");
    }
    console.log("   ✅ Artist B 'Appears On' automatically includes 'So What' by", appearsOnTrack.primaryArtistName, "\n");

    // 7. Social Likes System (Songs & Albums)
    console.log("7️⃣ Testing Social Likes System (Toggle Like/Unlike)...");
    // Listener likes "So What"
    const likeSongRes1 = await app.inject({
      method: "POST",
      url: `/api/v1/songs/${track1.id}/like`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    if (likeSongRes1.statusCode !== 200) {
      throw new Error(`Failed to like song: ${likeSongRes1.body}`);
    }
    const likeSongData1 = JSON.parse(likeSongRes1.body);
    if (likeSongData1.liked !== true || likeSongData1.likesCount !== 1) {
      throw new Error(`Like response mismatch: ${likeSongRes1.body}`);
    }
    console.log("   ✅ Song liked: liked = true, likesCount = 1");

    // Check user's Liked Songs library
    const likedLibraryRes = await app.inject({
      method: "GET",
      url: "/api/v1/songs/liked",
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    const likedLibrary = JSON.parse(likedLibraryRes.body);
    if (likedLibrary.data.length !== 1 || likedLibrary.data[0].id !== track1.id) {
      throw new Error("Song not present in GET /api/v1/songs/liked");
    }
    console.log("   ✅ GET /api/v1/songs/liked returns saved track:", likedLibrary.data[0].title);

    // Unlike song
    const unlikeSongRes = await app.inject({
      method: "POST",
      url: `/api/v1/songs/${track1.id}/like`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    const unlikeSongData = JSON.parse(unlikeSongRes.body);
    if (unlikeSongData.liked !== false || unlikeSongData.likesCount !== 0) {
      throw new Error(`Unlike response mismatch: ${unlikeSongRes.body}`);
    }
    console.log("   ✅ Song unliked: liked = false, likesCount = 0");

    // Like Album
    const likeAlbumRes = await app.inject({
      method: "POST",
      url: `/api/v1/albums/${albumId}/like`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    const likeAlbumData = JSON.parse(likeAlbumRes.body);
    if (likeAlbumData.liked !== true || likeAlbumData.likesCount !== 1) {
      throw new Error(`Album like failed: ${likeAlbumRes.body}`);
    }
    console.log("   ✅ Album liked: liked = true, likesCount = 1");

    // Public lookup with listener token reflects isLiked = true
    const albumWithUserLikeRes = await app.inject({
      method: "GET",
      url: `/api/v1/albums/${albumId}`,
      headers: { authorization: `Bearer ${listener.tokens.accessToken}` },
    });
    const albumWithUserLike = JSON.parse(albumWithUserLikeRes.body);
    if (albumWithUserLike.isLiked !== true) {
      throw new Error("Album lookup did not reflect isLiked = true");
    }
    console.log("   ✅ Album lookup dynamically enriched with isLiked = true for authenticated user\n");

    // 8. Soft Delete & 30-Day Restore for Album
    console.log("8️⃣ Testing Soft Delete & 30-Day Restore for Albums...");
    // Soft delete album
    const deleteAlbumRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/albums/${albumId}`,
      headers: { authorization: `Bearer ${artistA.tokens.accessToken}` },
    });
    if (deleteAlbumRes.statusCode !== 200) {
      throw new Error(`Failed to soft-delete album: ${deleteAlbumRes.body}`);
    }
    console.log("   ✅ Status 200 OK: Album soft-deleted (deletedAt set to timestamp)");

    // Public lookup should now return 404
    const publicAfterDeleteRes = await app.inject({
      method: "GET",
      url: `/api/v1/albums/${albumId}`,
    });
    if (publicAfterDeleteRes.statusCode !== 404) {
      throw new Error(`Expected 404 for soft-deleted album, got ${publicAfterDeleteRes.statusCode}`);
    }
    console.log("   ✅ Status 404 Not Found: Soft-deleted album is invisible to public catalog");

    // Check Studio trash view
    const studioTrashRes = await app.inject({
      method: "GET",
      url: "/api/v1/studio?trash=true",
      headers: { authorization: `Bearer ${artistA.tokens.accessToken}` },
    });
    const studioTrashData = JSON.parse(studioTrashRes.body);
    const trashedAlbum = studioTrashData.albums.find((a: any) => a.id === albumId);
    if (!trashedAlbum || !trashedAlbum.deletedAt) {
      throw new Error("Deleted album not found in studio trash list");
    }
    console.log("   ✅ Studio trash list displays archived album with restore eligibility");

    // Restore album
    const restoreAlbumRes = await app.inject({
      method: "POST",
      url: `/api/v1/albums/${albumId}/restore`,
      headers: { authorization: `Bearer ${artistA.tokens.accessToken}` },
    });
    if (restoreAlbumRes.statusCode !== 200) {
      throw new Error(`Failed to restore album: ${restoreAlbumRes.body}`);
    }
    console.log("   ✅ Status 200 OK: Album successfully restored");

    // Public lookup is now accessible again
    const publicAfterRestoreRes = await app.inject({
      method: "GET",
      url: `/api/v1/albums/${albumId}`,
    });
    if (publicAfterRestoreRes.statusCode !== 200) {
      throw new Error(`Expected 200 OK after restore, got ${publicAfterRestoreRes.statusCode}`);
    }
    console.log("   ✅ Public catalog instantly reflects restored album and tracks!\n");

    console.log("🎉 ALL CATALOG (ALBUMS, SONGS, CREDITS, SOFT-DELETE & LIKES) TESTS PASSED! 🚀\n");
  } finally {
    // Cleanup created users and cascaded profiles / catalog
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
      console.log(`🧹 Cleaned up ${createdUserIds.length} test users & associated catalog data.`);
    }
  }
}

runCatalogTests()
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
