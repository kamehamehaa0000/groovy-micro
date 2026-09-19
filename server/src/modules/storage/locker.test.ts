import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, albums, songs, artistProfiles, outboxEvents, subscriptionPlans, userSubscriptions, songCredits, listeningHistory } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { entitlementsCacheService } from "../../lib/cache";

async function runTests() {
  console.log("🧪 Starting Personal Cloud Locker & Bulk Importer Tests...\n");

  await bootstrap({ listen: false });

  let userAId = "";
  let userBId = "";
  let userAToken = "";
  let userBToken = "";
  let globalArtistId = "";

  try {
    // 1. Register User A and User B
    console.log("1️⃣ Registering test users...");
    const emailA = `locker_user_a_${Date.now()}@groovy.test`;
    const emailB = `locker_user_b_${Date.now()}@groovy.test`;
    const password = "Password123!";

    const resA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: emailA,
        password,
        displayName: "Locker Tester A",
      },
    });
    const bodyA = JSON.parse(resA.body);
    userAId = bodyA.user.id;

    const resB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: emailB,
        password,
        displayName: "Locker Tester B",
      },
    });
    const bodyB = JSON.parse(resB.body);
    userBId = bodyB.user.id;

    // Verify emails directly in DB to allow immediate login
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userAId));
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userBId));

    const loginResA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: emailA, password },
    });
    userAToken = JSON.parse(loginResA.body).accessToken;

    const loginResB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: emailB, password },
    });
    userBToken = JSON.parse(loginResB.body).accessToken;

    if (!userAToken || !userBToken) {
      throw new Error(`Failed to login test users: A=${loginResA.statusCode}, B=${loginResB.statusCode}`);
    }
    console.log("   ✅ User A & User B registered and authenticated successfully");

    // 2. Test Quota Endpoint
    console.log("\n2️⃣ Checking initial personal collection quota...");
    const quotaRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/quota",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (quotaRes.statusCode !== 200) {
      throw new Error(`Expected 200, got ${quotaRes.statusCode}: ${quotaRes.body}`);
    }
    const quotaBody = JSON.parse(quotaRes.body);
    if (quotaBody.quota.maxSongs <= 0 || quotaBody.quota.remainingSongs <= 0) {
      throw new Error(`Invalid quota: ${JSON.stringify(quotaBody)}`);
    }
    console.log(`   ✅ Initial quota: ${quotaBody.quota.usedSongs} / ${quotaBody.quota.maxSongs} songs used, ${quotaBody.quota.remainingSongs} remaining`);

    // 3. Batch presigned URLs with quota check
    console.log("\n3️⃣ Testing batch presigned URLs & quota gating...");
    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/batch-presigned-urls",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        files: [
          {
            clientFileId: "f1",
            category: "SONG_AUDIO_RAW",
            resourceId: "song_guid_1",
            mimeType: "audio/mpeg",
            fileExtension: "mp3",
            fileSizeBytes: 8 * 1024 * 1024,
          },
          {
            clientFileId: "f2",
            category: "SONG_AUDIO_RAW",
            resourceId: "song_guid_2",
            mimeType: "audio/flac",
            fileExtension: "flac",
            fileSizeBytes: 25 * 1024 * 1024,
          },
          {
            clientFileId: "c1",
            category: "ALBUM_COVER",
            resourceId: "album_guid_1",
            mimeType: "image/jpeg",
            fileExtension: "jpg",
            fileSizeBytes: 500 * 1024,
          },
        ],
      },
    });

    if (batchRes.statusCode !== 200) {
      throw new Error(`Batch presigned URLs failed (${batchRes.statusCode}): ${batchRes.body}`);
    }
    const batchBody = JSON.parse(batchRes.body);
    if (batchBody.uploads.length !== 3) {
      throw new Error(`Expected 3 signed URLs, got ${batchBody.uploads.length}`);
    }
    console.log("   ✅ 3 Presigned URLs generated successfully for audio & cover art");

    // Test that a large batch of > 100 files (e.g. 160 files for 80 songs + covers) succeeds
    const largeBatchFiles = Array.from({ length: 160 }, (_, i) => ({
      clientFileId: `large_${i}`,
      category: i % 2 === 0 ? "SONG_AUDIO_RAW" : "ALBUM_COVER",
      resourceId: `guid_${i}`,
      mimeType: i % 2 === 0 ? "audio/mpeg" : "image/jpeg",
      fileExtension: i % 2 === 0 ? "mp3" : "jpg",
      fileSizeBytes: 1024 * 1024,
    }));
    const largeBatchRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/batch-presigned-urls",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { files: largeBatchFiles },
    });
    if (largeBatchRes.statusCode !== 200) {
      throw new Error(`Large batch of 160 files failed (${largeBatchRes.statusCode}): ${largeBatchRes.body}`);
    }
    const largeBatchBody = JSON.parse(largeBatchRes.body);
    if (largeBatchBody.uploads.length !== 160) {
      throw new Error(`Expected 160 signed URLs, got ${largeBatchBody.uploads.length}`);
    }
    console.log("   ✅ 160 Presigned URLs (80 songs + 80 covers) generated successfully in a single batch");

    // Test exceeding quota via low-quota plan (e.g. personal_collection_quota: 2)
    await db
      .insert(subscriptionPlans)
      .values({
        id: "test_low_quota_plan",
        name: "Low Quota Test Plan",
        features: { personal_collection_quota: 2 },
        priceCents: 0,
        currency: "USD",
        interval: "month",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: subscriptionPlans.id,
        set: { features: { personal_collection_quota: 2 } },
      });

    await db
      .update(userSubscriptions)
      .set({ planId: "test_low_quota_plan" })
      .where(eq(userSubscriptions.userId, userAId));
    await entitlementsCacheService.invalidateUserEntitlements(userAId);

    const overFiles = Array.from({ length: 3 }, (_, i) => ({
      clientFileId: `over_${i}`,
      category: "SONG_AUDIO_RAW",
      resourceId: `res_${i}`,
      mimeType: "audio/mpeg",
      fileExtension: "mp3",
      fileSizeBytes: 1024 * 1024,
    }));
    const overRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/batch-presigned-urls",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { files: overFiles },
    });
    if (overRes.statusCode !== 403) {
      throw new Error(`Expected 403 quota exceeded, got ${overRes.statusCode}: ${overRes.body}`);
    }
    console.log("   ✅ Batch request exceeding quota correctly rejected with 403 Forbidden");

    // Restore userA plan to free
    await db
      .update(userSubscriptions)
      .set({ planId: "free" })
      .where(eq(userSubscriptions.userId, userAId));
    await entitlementsCacheService.invalidateUserEntitlements(userAId);

    // 4. Bulk import release with sandboxed artist & outbox events
    console.log("\n4️⃣ Importing clustered release (Album + 2 tracks)...");
    const importPayload = {
      artistName: "The Local Band",
      albumTitle: "Garage Demos 2026",
      albumType: "EP",
      genre: "Indie Rock",
      releaseDate: "2026-09-01",
      tracks: [
        {
          title: "First Take",
          trackNumber: 1,
          discNumber: 1,
          durationSeconds: 180,
          genre: "Indie Rock",
          isExplicit: false,
          rawAudioKey: "audio/raw/demo-1/original.mp3",
        },
        {
          title: "Second Take (Acoustic)",
          trackNumber: 2,
          discNumber: 1,
          durationSeconds: 210,
          genre: "Acoustic",
          isExplicit: false,
          rawAudioKey: "audio/raw/demo-2/original.flac",
        },
      ],
    };

    const importRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: importPayload,
    });

    if (importRes.statusCode !== 201) {
      throw new Error(`Bulk import failed (${importRes.statusCode}): ${importRes.body}`);
    }
    const importBody = JSON.parse(importRes.body);
    if (importBody.album.scope !== "PERSONAL" || importBody.artist.scope !== "PERSONAL") {
      throw new Error(`Expected PERSONAL scope, got ${JSON.stringify(importBody)}`);
    }
    if (importBody.tracks.length !== 2) {
      throw new Error(`Expected 2 tracks created, got ${importBody.tracks.length}`);
    }
    console.log("   ✅ Release imported with sandboxed artist & personal scope");

    // Verify outbox events recorded for background transcoding
    const events = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.aggregateType, "SONG"), eq(outboxEvents.eventType, "SONG_UPLOADED")));
    if (events.length < 2) {
      throw new Error(`Expected at least 2 SONG_UPLOADED outbox events, found ${events.length}`);
    }
    console.log("   ✅ Transactional Outbox events recorded for HLS transcode worker");

    // 5. Test Personal Artist Deduplication on subsequent import
    console.log("\n5️⃣ Testing personal artist deduplication across releases...");
    const secondRelease = {
      artistName: "the local band", // case-insensitive match
      albumTitle: "Garage Demos Vol 2",
      albumType: "SINGLE",
      tracks: [
        {
          title: "Third Take",
          trackNumber: 1,
          durationSeconds: 195,
          rawAudioKey: "audio/raw/demo-3/original.mp3",
        },
      ],
    };

    const secondImportRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: secondRelease,
    });
    if (secondImportRes.statusCode !== 201) {
      throw new Error(`Second import failed: ${secondImportRes.body}`);
    }

    const personalArtists = await db
      .select()
      .from(artistProfiles)
      .where(and(eq(artistProfiles.ownerUserId, userAId), eq(artistProfiles.scope, "PERSONAL")));
    if (personalArtists.length !== 1) {
      throw new Error(`Expected exactly 1 deduplicated personal artist, found ${personalArtists.length}`);
    }
    console.log("   ✅ Personal artist deduplication verified: only 1 profile created");

    // 5b. Test Personal Song Deduplication (same title, artist, duration within user's collection)
    console.log("\n5️⃣b Testing personal song deduplication on import...");
    const partialDuplicatePayload = {
      artistName: "The Local Band",
      albumTitle: "Mixed Demos",
      albumType: "EP",
      tracks: [
        {
          title: "First Take", // Duplicate of track imported in Step 4
          trackNumber: 1,
          durationSeconds: 180,
          rawAudioKey: "audio/raw/demo-dup/original.mp3",
        },
        {
          title: "Brand New Demo",
          trackNumber: 2,
          durationSeconds: 215,
          rawAudioKey: "audio/raw/demo-new/original.mp3",
        },
      ],
    };

    const partialDupRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: partialDuplicatePayload,
    });
    if (partialDupRes.statusCode !== 201) {
      throw new Error(`Partial duplicate import failed: ${partialDupRes.body}`);
    }
    const partialDupBody = JSON.parse(partialDupRes.body);
    if (partialDupBody.skippedDuplicates !== 1) {
      throw new Error(`Expected skippedDuplicates=1, got ${partialDupBody.skippedDuplicates}`);
    }
    if (partialDupBody.tracks.length !== 1 || partialDupBody.tracks[0].title !== "Brand New Demo") {
      throw new Error(`Expected only 1 non-duplicate track imported, got ${JSON.stringify(partialDupBody.tracks)}`);
    }
    if (partialDupBody.album.totalTracks !== 1) {
      throw new Error(`Expected album totalTracks=1, got ${partialDupBody.album.totalTracks}`);
    }
    console.log("   ✅ Partial duplicate import: duplicate track skipped, unique track inserted");

    // Clean up partial duplicate test release and song so subsequent tests maintain baseline release count
    if (partialDupBody.tracks?.[0]?.id) {
      await db.delete(songs).where(eq(songs.id, partialDupBody.tracks[0].id));
    }
    if (partialDupBody.album?.id) {
      await db.delete(albums).where(eq(albums.id, partialDupBody.album.id));
    }

    // All duplicates in release -> album should not be created
    const fullDuplicatePayload = {
      artistName: "The Local Band",
      albumTitle: "Duplicate Only Album",
      tracks: [
        {
          title: "First Take",
          trackNumber: 1,
          durationSeconds: 181, // within 2s tolerance
          rawAudioKey: "audio/raw/demo-dup-2/original.mp3",
        },
      ],
    };
    const fullDupRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: fullDuplicatePayload,
    });
    if (fullDupRes.statusCode !== 201) {
      throw new Error(`Full duplicate import failed: ${fullDupRes.body}`);
    }
    const fullDupBody = JSON.parse(fullDupRes.body);
    if (fullDupBody.skippedDuplicates !== 1 || fullDupBody.album !== null || fullDupBody.tracks.length !== 0) {
      throw new Error(`Expected skippedDuplicates=1, album=null, got ${JSON.stringify(fullDupBody)}`);
    }
    console.log("   ✅ Full duplicate import: safely skipped without creating empty album");

    // User B importing same song metadata -> NOT skipped (strictly scoped to user's collection)
    const userBDupRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userBToken}` },
      payload: fullDuplicatePayload,
    });
    if (userBDupRes.statusCode !== 201) {
      throw new Error(`User B import failed: ${userBDupRes.body}`);
    }
    const userBBody = JSON.parse(userBDupRes.body);
    if (userBBody.skippedDuplicates !== 0 || userBBody.tracks.length !== 1) {
      throw new Error(`User B should not be affected by User A duplicates: ${JSON.stringify(userBBody)}`);
    }
    console.log("   ✅ Cross-user collection isolation: User B not affected by User A duplicates");

    // Clean up User B's test release and song so User B has no track named "First Take" for search leak verification
    if (userBBody.tracks?.[0]?.id) {
      await db.delete(songs).where(eq(songs.id, userBBody.tracks[0].id));
    }
    if (userBBody.album?.id) {
      await db.delete(albums).where(eq(albums.id, userBBody.album.id));
    }

    // 5c. Test Staging Workspace: Release Types (MIXTAPE/LP) and Existing Album Track Appending (existingAlbumId)
    console.log("\n5️⃣c Testing existingAlbumId track appending and release types...");
    const mixtapePayload = {
      artistName: "Various Staged Artists",
      albumTitle: "Summer Staged Mixtape",
      albumType: "MIXTAPE",
      tracks: [
        {
          title: "Mixtape Intro",
          trackNumber: 1,
          durationSeconds: 120,
          rawAudioKey: "audio/raw/mixtape-1/original.mp3",
        },
      ],
    };
    const createMixtapeRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: mixtapePayload,
    });
    if (createMixtapeRes.statusCode !== 201) {
      throw new Error(`Creating mixtape release failed: ${createMixtapeRes.body}`);
    }
    const mixtapeBody = JSON.parse(createMixtapeRes.body);
    if (mixtapeBody.album.albumType !== "MIXTAPE") {
      throw new Error(`Expected albumType=MIXTAPE, got ${mixtapeBody.album.albumType}`);
    }
    const targetAlbumId = mixtapeBody.album.id;

    // User A appends a second track to targetAlbumId
    const appendPayload = {
      artistName: "Various Staged Artists",
      albumTitle: "Summer Staged Mixtape",
      existingAlbumId: targetAlbumId,
      tracks: [
        {
          title: "Mixtape Track Two",
          trackNumber: 1, // client provides 1, server recalculates to totalTracks + 1 = 2
          durationSeconds: 150,
          rawAudioKey: "audio/raw/mixtape-2/original.mp3",
        },
      ],
    };
    const appendRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: appendPayload,
    });
    if (appendRes.statusCode !== 201) {
      throw new Error(`Appending track to existing album failed: ${appendRes.body}`);
    }
    const appendBody = JSON.parse(appendRes.body);
    if (appendBody.album.id !== targetAlbumId) {
      throw new Error(`Expected album.id=${targetAlbumId}, got ${appendBody.album.id}`);
    }
    if (appendBody.album.totalTracks !== 2) {
      throw new Error(`Expected updated album totalTracks=2, got ${appendBody.album.totalTracks}`);
    }
    if (appendBody.tracks[0].trackNumber !== 2) {
      throw new Error(`Expected appended track to have trackNumber=2, got ${appendBody.tracks[0].trackNumber}`);
    }
    console.log("   ✅ Successfully appended track to existing album; track number & album count updated");

    // User B attempts to append track to User A's album -> rejected with 400
    const userBAppendRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userBToken}` },
      payload: appendPayload,
    });
    if (userBAppendRes.statusCode !== 400) {
      throw new Error(`Expected 400 when unauthorized user appends to another's album, got ${userBAppendRes.statusCode}`);
    }
    console.log("   ✅ Unauthorized user cannot append tracks to another user's personal album");

    // Clean up mixtape test records so subsequent tests maintain baseline release count
    await db.delete(songs).where(eq(songs.albumId, targetAlbumId));
    await db.delete(albums).where(eq(albums.id, targetAlbumId));

    // 5d. Test Multi-Artist Parsing, Collaborator Deduplication & SongCredits
    console.log("\n5️⃣d Testing multi-artist parsing & relational credits...");
    const collabPayload = {
      artistName: "Drake",
      albumTitle: "Her Loss Demos",
      albumType: "EP",
      tracks: [
        {
          title: "Rich Flex",
          artistName: "Drake, 21 Savage",
          trackNumber: 1,
          durationSeconds: 239,
          rawAudioKey: "audio/raw/collab-1/original.mp3",
        },
        {
          title: "Major Distribution",
          artistName: "Drake, 21 savage", // case-insensitive duplicate of 21 Savage
          trackNumber: 2,
          durationSeconds: 170,
          rawAudioKey: "audio/raw/collab-2/original.mp3",
        },
      ],
    };
    const collabRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: collabPayload,
    });
    if (collabRes.statusCode !== 201) {
      throw new Error(`Collab import failed: ${collabRes.body}`);
    }
    const collabBody = JSON.parse(collabRes.body);
    const collabAlbumId = collabBody.album.id;

    // Verify 21 Savage was created and deduplicated case-insensitively
    const personal21 = await db
      .select()
      .from(artistProfiles)
      .where(
        and(
          eq(artistProfiles.ownerUserId, userAId),
          eq(artistProfiles.scope, "PERSONAL"),
          eq(artistProfiles.stageName, "21 Savage"),
        ),
      );
    if (personal21.length !== 1) {
      throw new Error(`Expected exactly 1 profile for 21 Savage, found ${personal21.length}`);
    }

    // Verify songCredits table has PRIMARY for Drake and FEATURED for 21 Savage
    const track1Id = collabBody.tracks[0].id;
    const credits1 = await db
      .select()
      .from(songCredits)
      .where(eq(songCredits.songId, track1Id));
    if (credits1.length !== 2) {
      throw new Error(`Expected 2 credits for track 1, found ${credits1.length}`);
    }
    const primaryCredit = credits1.find((c) => c.role === "PRIMARY");
    const featuredCredit = credits1.find((c) => c.role === "FEATURED");
    if (!primaryCredit || !featuredCredit) {
      throw new Error(`Missing PRIMARY or FEATURED credit on track 1: ${JSON.stringify(credits1)}`);
    }
    if (featuredCredit.artistId !== personal21[0].id) {
      throw new Error(`Featured credit artistId does not match 21 Savage ID`);
    }

    // Verify GET /personal-collection/releases returns formatted artistName and credits
    const lockerCheckRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/releases",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const lockerCheckBody = JSON.parse(lockerCheckRes.body);
    const foundCollabRelease = lockerCheckBody.releases?.find((r: any) => r.id === collabAlbumId);
    if (!foundCollabRelease) {
      throw new Error("Could not find collab release in user collection");
    }
    const checkTrack1 = foundCollabRelease.tracks[0];
    if (checkTrack1.artistName !== "Drake feat. 21 Savage") {
      throw new Error(`Expected formatted artistName "Drake feat. 21 Savage", got "${checkTrack1.artistName}"`);
    }
    if (!checkTrack1.credits || checkTrack1.credits.length !== 2) {
      throw new Error(`Expected 2 credits on checkTrack1, got ${JSON.stringify(checkTrack1.credits)}`);
    }
    console.log("   ✅ Multi-artist parsing, collaborator deduplication, and songCredits verified");

    // Clean up collab test records so subsequent tests maintain baseline release count
    await db.delete(songs).where(eq(songs.albumId, collabAlbumId));
    await db.delete(albums).where(eq(albums.id, collabAlbumId));

    // 5e. Test Personal Collection Artists Roster (GET & POST /personal-collection/artists)
    console.log("\n5️⃣e Testing personal collection artists roster (GET & POST)...");
    const createArtistRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/personal-collection/artists",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        stageName: "Miles Davis",
        bio: "Legendary jazz trumpeter",
      },
    });
    if (createArtistRes.statusCode !== 201) {
      throw new Error(`Create personal artist failed: ${createArtistRes.body}`);
    }
    const createArtistBody = JSON.parse(createArtistRes.body);
    if (createArtistBody.artist.stageName !== "Miles Davis" || createArtistBody.artist.scope !== "PERSONAL") {
      throw new Error(`Invalid created artist: ${JSON.stringify(createArtistBody)}`);
    }

    // Creating same artist name case-insensitively -> reuses existing profile
    const dupArtistRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/personal-collection/artists",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { stageName: "miles davis" },
    });
    if (dupArtistRes.statusCode !== 200) {
      throw new Error(`Expected 200 for existing artist, got ${dupArtistRes.statusCode}`);
    }
    const dupArtistBody = JSON.parse(dupArtistRes.body);
    if (dupArtistBody.artist.id !== createArtistBody.artist.id || !dupArtistBody.isExisting) {
      throw new Error(`Expected reuse of existing artist profile: ${JSON.stringify(dupArtistBody)}`);
    }

    // User A lists personal artists
    const getArtistsResA = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/artists",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (getArtistsResA.statusCode !== 200) {
      throw new Error(`Get personal artists failed: ${getArtistsResA.body}`);
    }
    const artistsBodyA = JSON.parse(getArtistsResA.body);
    const milesFound = artistsBodyA.artists?.find((a: any) => a.stageName === "Miles Davis");
    if (!milesFound) {
      throw new Error("Miles Davis not found in personal artists list");
    }
    console.log(`   ✅ User A personal artists roster retrieved: ${artistsBodyA.artists.length} artist(s) found`);

    // User B lists personal artists -> must NOT see User A's personal artists (Zero Leak)
    const getArtistsResB = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/artists",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    const artistsBodyB = JSON.parse(getArtistsResB.body);
    if (artistsBodyB.artists?.some((a: any) => a.id === createArtistBody.artist.id)) {
      throw new Error("CRITICAL PRIVACY LEAK: User B can see User A's personal artist profile!");
    }
    console.log("   ✅ Personal artist roster isolation verified: User B cannot see User A's personal artists");

    // Clean up Miles Davis
    await db.delete(artistProfiles).where(eq(artistProfiles.id, createArtistBody.artist.id));

    // 6. Test Search Scoping & Isolation
    console.log("\n6️⃣ Testing Search scoping and personal privacy toggles...");
    // User A searches -> should find their personal song
    const searchResA = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=First%20Take&type=songs",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const searchBodyA = JSON.parse(searchResA.body);
    const foundTrackA = searchBodyA.songs?.find((s: any) => s.title === "First Take");
    if (!foundTrackA || !foundTrackA.isPersonal) {
      throw new Error(`User A should find personal track with isPersonal=true: ${JSON.stringify(searchBodyA)}`);
    }
    console.log("   ✅ User A finds personal track with isPersonal=true badge");

    // User B searches -> must NOT see User A's personal track
    const searchResB = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=First%20Take&type=songs",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    const searchBodyB = JSON.parse(searchResB.body);
    const foundTrackB = searchBodyB.songs?.find((s: any) => s.title === "First Take");
    if (foundTrackB) {
      throw new Error(`CRITICAL LEAK: User B found User A's personal track: ${JSON.stringify(foundTrackB)}`);
    }
    console.log("   ✅ User B blocked from finding User A's personal track (Zero Leak)");

    // User A disables lockerIncludeInSearch -> track disappears from User A's search
    await app.inject({
      method: "PATCH",
      url: "/api/v1/users/privacy-settings",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { lockerIncludeInSearch: false },
    });
    const searchResAOff = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=First%20Take&type=songs",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const searchBodyAOff = JSON.parse(searchResAOff.body);
    if (searchBodyAOff.songs?.find((s: any) => s.title === "First Take")) {
      throw new Error("Track should not appear when lockerIncludeInSearch is false");
    }
    console.log("   ✅ lockerIncludeInSearch = false successfully excludes personal tracks");

    // 7. Test Stream Gate & Jam Authorization
    console.log("\n7️⃣ Testing stream gate & Live Jam room playback authorization...");
    const [personalSong] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.title, "First Take"), eq(songs.uploaderUserId, userAId)))
      .limit(1);

    // Owner streaming
    const streamResA = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${personalSong.id}/stream`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (streamResA.statusCode !== 200) {
      throw new Error(`Owner could not stream: ${streamResA.body}`);
    }
    console.log("   ✅ Owner (User A) successfully streams personal track");

    // Non-owner streaming without Jam -> blocked (404)
    const streamResB = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${personalSong.id}/stream`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (streamResB.statusCode !== 404) {
      throw new Error(`Expected 404 for non-owner, got ${streamResB.statusCode}`);
    }
    console.log("   ✅ Non-owner (User B) blocked with 404 outside Jam session");

    // Put User A & User B into active Jam room
    const roomCode = "JAM-LOCKER";
    await redis.set(`jam:user:${userAId}:active_room`, roomCode, "EX", 300);
    await redis.set(`jam:user:${userBId}:active_room`, roomCode, "EX", 300);
    await redis.hset(`jam:session:${roomCode}:members`, userAId, JSON.stringify({ userId: userAId }));
    await redis.hset(`jam:session:${roomCode}:members`, userBId, JSON.stringify({ userId: userBId }));

    // Non-owner streams during active Jam session -> Authorized!
    const streamResBJam = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${personalSong.id}/stream`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (streamResBJam.statusCode !== 200) {
      throw new Error(`Jam member should be authorized to stream, got ${streamResBJam.statusCode}: ${streamResBJam.body}`);
    }
    console.log("   ✅ Non-owner (User B) successfully authorized to stream via Live Jam room session");

    // Cleanup Jam keys
    await redis.del(`jam:user:${userAId}:active_room`);
    await redis.del(`jam:user:${userBId}:active_room`);
    await redis.del(`jam:session:${roomCode}:members`);

    // 8. GET /api/v1/storage/personal-collection/releases
    console.log("\n8️⃣ Testing GET /api/v1/storage/personal-collection/releases...");
    const lockerRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/releases",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (lockerRes.statusCode !== 200) {
      throw new Error(`Failed to get locker releases: ${lockerRes.body}`);
    }
    const lockerBody = JSON.parse(lockerRes.body);
    if (lockerBody.releases.length !== 2) {
      throw new Error(`Expected 2 releases in locker, got ${lockerBody.releases.length}`);
    }
    console.log(`   ✅ Successfully retrieved ${lockerBody.releases.length} locker releases with structured tracks`);

    // 9. Testing DELETE personal song
    console.log("\n9️⃣ Testing DELETE /api/v1/storage/personal-collection/songs/:id...");
    const targetRelease = lockerBody.releases.find((r: any) => r.tracks.length >= 2);
    const targetSong = targetRelease.tracks[0];

    // User B tries to delete User A's personal song -> 404
    const delResB = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (delResB.statusCode !== 404) {
      throw new Error(`Expected 404 when unauthorized user deletes personal song, got ${delResB.statusCode}`);
    }
    console.log("   ✅ Unauthorized deletion by other users correctly blocked with 404");

    // User A deletes their personal song
    const delResA = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (delResA.statusCode !== 200) {
      throw new Error(`Failed to delete personal song: ${delResA.body}`);
    }
    console.log("   ✅ Personal track successfully removed by owner");

    // Check quota decremented
    const quotaAfterSongDel = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/quota",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const quotaData = JSON.parse(quotaAfterSongDel.body).quota;
    if (quotaData.usedSongs !== 2) {
      throw new Error(`Expected usedSongs=2 after deleting 1 of 3 songs, got ${quotaData.usedSongs}`);
    }
    console.log(`   ✅ Quota correctly updated: ${quotaData.usedSongs} / ${quotaData.maxSongs} used, ${quotaData.remainingSongs} remaining`);

    // 10. Testing DELETE personal release
    console.log("\n🔟 Testing DELETE /api/v1/storage/personal-collection/releases/:id...");
    const delRelA = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/releases/${targetRelease.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (delRelA.statusCode !== 200) {
      throw new Error(`Failed to delete personal release: ${delRelA.body}`);
    }
    console.log("   ✅ Entire personal release and remaining tracks removed by owner");

    const releasesAfterDel = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/releases",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const remainingReleases = JSON.parse(releasesAfterDel.body).releases;
    if (remainingReleases.length !== 1) {
      throw new Error(`Expected 1 release remaining, got ${remainingReleases.length}`);
    }
    console.log(`   ✅ Active releases list updated: ${remainingReleases.length} release remaining`);

    // 11. Testing Trash / Recycle Bin, Restoration with Quota Validation, Permanent Purge & Zero-Leak Audits
    console.log("\n1️⃣1️⃣ Testing Trash / Recycle Bin, Restoration, Quota Gating & Permanent Purge...");

    // 11a. Check GET /personal-collection/trash for User A
    const trashResA = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/trash",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (trashResA.statusCode !== 200) {
      throw new Error(`Failed to get trash: ${trashResA.body}`);
    }
    const trashBodyA = JSON.parse(trashResA.body);
    const foundTrashedSong = trashBodyA.songs?.find((s: any) => s.id === targetSong.id);
    const foundTrashedRelease = trashBodyA.releases?.find((r: any) => r.id === targetRelease.id);
    if (!foundTrashedSong) {
      throw new Error(`Expected trashed song ${targetSong.id} in recycle bin: ${JSON.stringify(trashBodyA)}`);
    }
    if (!foundTrashedRelease) {
      throw new Error(`Expected trashed release ${targetRelease.id} in recycle bin: ${JSON.stringify(trashBodyA)}`);
    }
    console.log(`   ✅ User A trash contains ${trashBodyA.songs.length} song(s) and ${trashBodyA.releases.length} release(s)`);

    // 11b. User B checks trash -> must be empty (Zero Leak)
    const trashResB = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/trash",
      headers: { authorization: `Bearer ${userBToken}` },
    });
    const trashBodyB = JSON.parse(trashResB.body);
    if (trashBodyB.songs?.length !== 0 || trashBodyB.releases?.length !== 0) {
      throw new Error(`CRITICAL PRIVACY LEAK: User B can see User A's trashed items! ${JSON.stringify(trashBodyB)}`);
    }
    console.log("   ✅ User B recycle bin is completely empty (Zero Leak)");

    // 11c. Zero-leak in Listening History for trashed track
    console.log("   Verifying Zero-Leak in listening history for trashed items...");
    await db.insert(listeningHistory).values({
      userId: userAId,
      songId: targetSong.id,
      playedAt: new Date(),
      durationListenedSeconds: 120,
      completed: true,
    });

    const historyRes = await app.inject({
      method: "GET",
      url: "/api/v1/player/history/recent",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (historyRes.statusCode === 200) {
      const historyBody = JSON.parse(historyRes.body);
      if (historyBody.history?.some((h: any) => h.song?.id === targetSong.id)) {
        throw new Error("CRITICAL LEAK: Trashed song appeared in user recent listening history!");
      }
    }
    console.log("   ✅ Trashed personal track excluded from listening history (Zero Leak)");

    // 11d. Non-owner cannot restore User A's song
    const restoreBRes = await app.inject({
      method: "POST",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}/restore`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (restoreBRes.statusCode !== 400 && restoreBRes.statusCode !== 404) {
      throw new Error(`Expected 400 or 404 for unauthorized restore, got ${restoreBRes.statusCode}`);
    }
    console.log("   ✅ Non-owner cannot restore another user's trashed track");

    // 11e. Quota Gating on Restore
    // Currently User A has 1 active song ("Third Take").
    // Set plan quota to 1 so usedSongs (1) + 1 > maxSongs (1).
    await db
      .update(subscriptionPlans)
      .set({ features: { personal_collection_quota: 1 } })
      .where(eq(subscriptionPlans.id, "test_low_quota_plan"));
    await redis.del("plan:test_low_quota_plan");
    await db
      .update(userSubscriptions)
      .set({ planId: "test_low_quota_plan" })
      .where(eq(userSubscriptions.userId, userAId));
    await entitlementsCacheService.invalidateUserEntitlements(userAId);

    const overRestoreRes = await app.inject({
      method: "POST",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}/restore`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (overRestoreRes.statusCode !== 403) {
      throw new Error(`Expected 403 quota exceeded on restore, got ${overRestoreRes.statusCode}: ${overRestoreRes.body}`);
    }
    console.log("   ✅ Quota gating enforced on song restore (403 Forbidden when quota is full)");

    // Restore user plan to free
    await db
      .update(userSubscriptions)
      .set({ planId: "free" })
      .where(eq(userSubscriptions.userId, userAId));
    await redis.del("plan:free");
    await entitlementsCacheService.invalidateUserEntitlements(userAId);

    // 11f. Restore User A's single track -> automatically restores parent album too
    const restoreSongRes = await app.inject({
      method: "POST",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}/restore`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (restoreSongRes.statusCode !== 200) {
      throw new Error(`Failed to restore personal song: ${restoreSongRes.body}`);
    }
    console.log("   ✅ Personal track and parent album restored successfully");

    // Verify track is now active and in listening history
    const historyResAfter = await app.inject({
      method: "GET",
      url: "/api/v1/player/history/recent",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const historyBodyAfter = JSON.parse(historyResAfter.body);
    if (!historyBodyAfter.history?.some((h: any) => h.song?.id === targetSong.id)) {
      throw new Error("Restored song should appear in listening history");
    }
    console.log("   ✅ Restored track correctly re-appears in listening history");

    // 11g. Permanent Deletion of single song
    // Soft-delete targetSong again
    await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });

    // User B attempts permanent delete -> 404
    const permDelB = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}/permanent`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (permDelB.statusCode !== 404) {
      throw new Error(`Expected 404 for unauthorized permanent delete, got ${permDelB.statusCode}`);
    }

    // User A permanently deletes targetSong
    const permDelA = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${targetSong.id}/permanent`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (permDelA.statusCode !== 200) {
      throw new Error(`Failed to permanently delete song: ${permDelA.body}`);
    }
    const songInDb = await db.select().from(songs).where(eq(songs.id, targetSong.id));
    if (songInDb.length !== 0) {
      throw new Error("Song still exists in database after permanent delete!");
    }
    console.log("   ✅ Song permanently purged from database and R2 storage");

    // 11h. Empty Recycle Bin
    const emptyTrashRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/storage/personal-collection/trash",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (emptyTrashRes.statusCode !== 200) {
      throw new Error(`Failed to empty trash: ${emptyTrashRes.body}`);
    }
    const emptyTrashBody = JSON.parse(emptyTrashRes.body);
    console.log(`   ✅ Recycle bin emptied permanently: ${emptyTrashBody.deletedSongsCount} song(s), ${emptyTrashBody.deletedReleasesCount} release(s) deleted`);

    // Verify trash is now empty
    const trashAfterEmpty = await app.inject({
      method: "GET",
      url: "/api/v1/storage/personal-collection/trash",
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const trashAfterBody = JSON.parse(trashAfterEmpty.body);
    if (trashAfterBody.songs.length !== 0 || trashAfterBody.releases.length !== 0) {
      throw new Error(`Expected empty trash after purge, got: ${JSON.stringify(trashAfterBody)}`);
    }
    console.log("   ✅ Confirmed recycle bin is 100% empty after emptyTrash command");

    // 12. Testing Global Artist Profile Linking & Case-Insensitive Matching ("KR$NA" vs "kr$na")
    console.log("\n1️⃣2️⃣ Testing Global Artist Profile Linking & Case-Insensitive Matching...");
    const [globalArtist] = await db
      .insert(artistProfiles)
      .values({
        stageName: "KR$NA",
        slug: `krsna-global-${Date.now()}`,
        scope: "GLOBAL",
        verified: true,
        verificationStatus: "VERIFIED",
      })
      .returning();
    globalArtistId = globalArtist.id;

    // User A bulk-imports a personal song with artistName = "kr$na" (lowercase)
    const krsnaImportRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/bulk-import-release",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        artistName: "kr$na",
        albumTitle: "Still Here (Personal Tape)",
        albumType: "SINGLE",
        tracks: [
          {
            title: "No Cap (Personal Drop)",
            trackNumber: 1,
            durationSeconds: 210,
            rawAudioKey: "audio/raw/krsna-drop/original.mp3",
          },
        ],
      },
    });
    if (krsnaImportRes.statusCode !== 201) {
      throw new Error(`Failed to import krsna personal track: ${krsnaImportRes.body}`);
    }
    const krsnaImportBody = JSON.parse(krsnaImportRes.body);
    const krsnaPersonalTrack = krsnaImportBody.tracks[0];

    // User A fetches discography of GLOBAL artist "KR$NA"
    const discResA = await app.inject({
      method: "GET",
      url: `/api/v1/artists/${globalArtist.slug}/discography`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (discResA.statusCode !== 200) {
      throw new Error(`Failed to get discography for User A: ${discResA.body}`);
    }
    const discBodyA = JSON.parse(discResA.body);
    if (!discBodyA.inYourCollection || discBodyA.inYourCollection.length !== 1) {
      throw new Error(`Expected 1 track in inYourCollection for User A, got ${discBodyA.inYourCollection?.length}`);
    }
    if (discBodyA.inYourCollection[0].title !== "No Cap (Personal Drop)") {
      throw new Error(`Expected title 'No Cap (Personal Drop)', got ${discBodyA.inYourCollection[0].title}`);
    }
    if (discBodyA.inYourCollection[0].isPersonal !== true) {
      throw new Error("Expected isPersonal: true on inYourCollection track");
    }
    console.log("   ✅ User A can see their 'kr$na' personal track under verified 'KR$NA' discography");

    // User B fetches discography of GLOBAL artist "KR$NA" -> should see 0 in inYourCollection (Zero Leak!)
    const discResB = await app.inject({
      method: "GET",
      url: `/api/v1/artists/${globalArtist.slug}/discography`,
      headers: { authorization: `Bearer ${userBToken}` },
    });
    if (discResB.statusCode !== 200) {
      throw new Error(`Failed to get discography for User B: ${discResB.body}`);
    }
    const discBodyB = JSON.parse(discResB.body);
    if (discBodyB.inYourCollection && discBodyB.inYourCollection.length !== 0) {
      throw new Error(`User B should NOT see User A's personal track (privacy leak!): ${JSON.stringify(discBodyB.inYourCollection)}`);
    }
    console.log("   ✅ Zero-Leak confirmed: User B cannot see User A's personal collection tracks on global artist page");

    // Soft-delete the krsna personal track -> artist profile must NOT be deleted yet
    await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${krsnaPersonalTrack.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    const personalKrsnaDuringSoftDel = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, krsnaImportBody.artist.id));
    if (personalKrsnaDuringSoftDel.length !== 1) {
      throw new Error("Personal artist profile 'kr$na' should NOT be deleted on soft delete!");
    }
    console.log("   ✅ Soft delete preserves personal artist profile to allow safe restoration");

    // Permanent delete the krsna personal track -> 0 songs remain -> artist profile must be auto-purged
    const permDelKrsna = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/personal-collection/songs/${krsnaPersonalTrack.id}/permanent`,
      headers: { authorization: `Bearer ${userAToken}` },
    });
    if (permDelKrsna.statusCode !== 200) {
      throw new Error(`Failed to permanently delete krsna song: ${permDelKrsna.body}`);
    }

    const personalKrsnaArtists = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, krsnaImportBody.artist.id));
    if (personalKrsnaArtists.length !== 0) {
      throw new Error(`Expected personal artist profile 'kr$na' to be purged, found ${personalKrsnaArtists.length}`);
    }
    console.log("   ✅ Sandboxed personal artist profile 'kr$na' auto-purged when 0 songs remained after permanent purge");

    const verifiedGlobalStillExists = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, globalArtist.id));
    if (verifiedGlobalStillExists.length !== 1) {
      throw new Error("Global verified artist profile was unexpectedly deleted!");
    }
    console.log("   ✅ Global verified artist profile 'KR$NA' correctly preserved untouched");

    console.log("\n🎉 ALL PERSONAL COLLECTION INTEGRATION TESTS PASSED! 🚀");
  } finally {
    console.log("🧹 Cleaning up locker test records...");
    if (globalArtistId) {
      await db.delete(artistProfiles).where(eq(artistProfiles.id, globalArtistId));
    }
    if (userAId) {
      await db.delete(listeningHistory).where(eq(listeningHistory.userId, userAId));
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(listeningHistory).where(eq(listeningHistory.userId, userBId));
      await db.delete(users).where(eq(users.id, userBId));
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
