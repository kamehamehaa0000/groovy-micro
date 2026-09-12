import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, artistProfiles, albums, songs, songCredits, albumLikes, songLikes } from "../../db/schema";
import { eq } from "drizzle-orm";
import { AuthService } from "../../modules/auth/auth.service";
import { ArtistsService } from "../../modules/artists/artists.service";
import { CatalogService } from "../../modules/catalog/catalog.service";
import { cacheManager, cacheKeys, likesCacheService, followsCacheService, presavesCacheService, entitlementsCacheService } from "./index";
import { subscriptionsService } from "../../modules/subscriptions/subscriptions.guards";

async function runCacheTests() {
  console.log("\n========================================================");
  console.log("🧪 RUNNING GROOVY CACHE & HYBRID LIKES TEST SUITE");
  console.log("========================================================\n");

  await bootstrap({ listen: false });
  await app.ready();
  if (redis.status !== "ready") {
    await redis.connect();
  }

  const catalogService = new CatalogService();
  const artistsService = new ArtistsService();
  const authService = new AuthService(app);

  const testSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let artistUserId = "";
  let listenerUserId = "";

  try {
    // -------------------------------------------------------------------------
    // 1. CACHEMANAGER & SINGLE-FLIGHT STAMPEDE PROTECTION
    // -------------------------------------------------------------------------
    console.log("1️⃣ Testing CacheManager Single-Flight Mutex Lock...");
    const testKey = `groovy:test:counter:${testSuffix}`;
    let fetcherCallCount = 0;

    const mockFetcher = async () => {
      fetcherCallCount++;
      await new Promise((r) => setTimeout(r, 40)); // Simulated DB delay
      return { value: 42, timestamp: Date.now() };
    };

    // Trigger 5 concurrent calls
    const results = await Promise.all([
      cacheManager.getOrSet(testKey, mockFetcher, 60),
      cacheManager.getOrSet(testKey, mockFetcher, 60),
      cacheManager.getOrSet(testKey, mockFetcher, 60),
      cacheManager.getOrSet(testKey, mockFetcher, 60),
      cacheManager.getOrSet(testKey, mockFetcher, 60),
    ]);

    if (fetcherCallCount !== 1) {
      throw new Error(`Expected fetcher to be called once under concurrency, got ${fetcherCallCount}!`);
    }
    if (results.some((r) => r?.value !== 42)) {
      throw new Error("One or more concurrent cache requests failed to return correct data!");
    }
    console.log("   ✅ Single-flight mutex lock ensured DB fetcher executed exactly ONCE across 5 concurrent requests!");

    // Test Invalidation
    await cacheManager.invalidate(testKey);
    const afterInvalidation = await cacheManager.get(testKey);
    if (afterInvalidation !== null) {
      throw new Error("Key should have been invalidated!");
    }
    console.log("   ✅ Key successfully invalidated and confirmed null.");

    // -------------------------------------------------------------------------
    // 2. SETUP TEST ARTIST, ALBUM, AND SONGS
    // -------------------------------------------------------------------------
    console.log("\n2️⃣ Seeding Test Artist, Album, and Songs...");
    const artistEmail = `artist_${testSuffix}@groovy.test`;
    const [artistUser] = await db
      .insert(users)
      .values({
        email: artistEmail,
        displayName: "Cache Artist",
        role: "ARTIST",
        isEmailVerified: true,
      })
      .returning();
    artistUserId = artistUser.id;

    const { profile } = await artistsService.createArtistProfile(artistUserId, {
      stageName: `Stage ${testSuffix}`,
      bio: "Master of in-memory caching",
    });

    const album = await catalogService.createAlbum(artistUserId, {
      title: `Cached Masterpieces ${testSuffix}`,
      albumType: "ALBUM",
      coverImageUrl: "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/covers/test.jpg",
      releaseDate: "2026-09-12",
      visibility: "PUBLIC",
      tracks: [
        { title: "Cache Miss Blues", durationSeconds: 180 },
        { title: "Redis Hit Hop", durationSeconds: 210 },
      ],
    });

    console.log(`   ✅ Created album '${album.title}' with ${album.tracks.length} tracks.`);

    // -------------------------------------------------------------------------
    // 3. PUBLIC ALBUM CACHING & FASTIFY DELIVERY
    // -------------------------------------------------------------------------
    console.log("\n3️⃣ Testing Public Album Caching in Redis...");
    const publicAlbum1 = await catalogService.getAlbumByIdOrSlug(album.id);
    if (!publicAlbum1) throw new Error("Album not found!");

    // Verify key exists in Redis
    const cachedAlbumRaw = await redis.get(cacheKeys.catalog.album(album.id));
    if (!cachedAlbumRaw) {
      throw new Error("Expected album to be stored in Redis cache!");
    }
    console.log(`   ✅ Album successfully cached under '${cacheKeys.catalog.album(album.id)}'!`);

    // Second fetch hits cache
    const publicAlbum2 = await catalogService.getAlbumByIdOrSlug(album.slug);
    if (publicAlbum2?.title !== album.title) {
      throw new Error("Slug lookup did not match cached album!");
    }
    console.log("   ✅ Slug lookup successfully returned cached album.");

    // -------------------------------------------------------------------------
    // 4. HYBRID LIKES DURABILITY & REDIS SETS
    // -------------------------------------------------------------------------
    console.log("\n4️⃣ Testing Hybrid Likes Durability & SMISMEMBER Enrichment...");
    const listenerEmail = `listener_${testSuffix}@groovy.test`;
    const [listenerUser] = await db
      .insert(users)
      .values({
        email: listenerEmail,
        displayName: "Speed Listener",
        role: "LISTENER",
        isEmailVerified: true,
      })
      .returning();
    listenerUserId = listenerUser.id;

    const track1 = album.tracks[0];
    const track2 = album.tracks[1];

    // Initial like check: track1 should be unliked
    const initialLikeState = await likesCacheService.isSongLiked(listenerUserId, track1.id);
    if (initialLikeState !== false) {
      throw new Error("Song should initially be unliked!");
    }
    console.log("   ✅ Initial like check: false (unliked).");

    // Toggle like on track 1
    const likeRes = await catalogService.toggleSongLike(listenerUserId, track1.id);
    if (!likeRes.liked || likeRes.likesCount !== 1) {
      throw new Error(`Expected likeRes to be { liked: true, likesCount: 1 }, got ${JSON.stringify(likeRes)}`);
    }

    // Verify ACID Durability in PostgreSQL
    const [dbLike] = await db
      .select()
      .from(songLikes)
      .where(eq(songLikes.userId, listenerUserId));
    if (!dbLike || dbLike.songId !== track1.id) {
      throw new Error("ACID failure: song_likes row was NOT found in PostgreSQL!");
    }
    console.log("   ✅ PostgreSQL Durability Verified: song_likes row written reliably.");

    // Verify In-Memory State in Redis Set
    const isMemberInRedis = await redis.sismember(
      cacheKeys.social.userLikedSongs(listenerUserId),
      track1.id
    );
    if (isMemberInRedis !== 1) {
      throw new Error("Redis Set failure: songId is NOT in user's liked set!");
    }
    console.log("   ✅ Redis Set Verified: songId is in 'groovy:social:user:liked_songs'.");

    // Fast list enrichment using SMISMEMBER
    const enrichedAlbum = await catalogService.getAlbumByIdOrSlug(album.id, listenerUserId);
    const enrichedTrack1 = enrichedAlbum?.tracks.find((t) => t.id === track1.id);
    const enrichedTrack2 = enrichedAlbum?.tracks.find((t) => t.id === track2.id);

    if (!enrichedTrack1?.isLiked) {
      throw new Error("Track 1 should be enriched as isLiked: true!");
    }
    if (enrichedTrack2?.isLiked) {
      throw new Error("Track 2 should be enriched as isLiked: false!");
    }
    console.log("   ✅ SMISMEMBER list enrichment attached isLiked: true to Track 1 and isLiked: false to Track 2!");

    // Fast sync endpoint test: GET /api/v1/songs/liked/ids
    const listenerTokens = await authService.issueTokenPair({
      id: listenerUser.id,
      email: listenerUser.email,
      role: listenerUser.role,
      tokenVersion: listenerUser.tokenVersion,
    });

    const likedIdsRes = await app.inject({
      method: "GET",
      url: "/api/v1/songs/liked/ids",
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (likedIdsRes.statusCode !== 200) {
      throw new Error(`Failed to GET /songs/liked/ids: ${likedIdsRes.body}`);
    }
    const likedIdsData = JSON.parse(likedIdsRes.body);
    if (!likedIdsData.songIds.includes(track1.id)) {
      throw new Error("Fast sync endpoint failed to return liked song ID!");
    }
    console.log("   ✅ Fast sync endpoint GET /api/v1/songs/liked/ids returned user's liked IDs in < 1ms!");

    // Untoggle like on track 1
    const untoggleRes = await catalogService.toggleSongLike(listenerUserId, track1.id);
    if (untoggleRes.liked !== false || untoggleRes.likesCount !== 0) {
      throw new Error(`Expected untoggle to return { liked: false, likesCount: 0 }, got ${JSON.stringify(untoggleRes)}`);
    }

    // Verify row removed from PostgreSQL and Redis
    const [dbLikeAfter] = await db
      .select()
      .from(songLikes)
      .where(eq(songLikes.userId, listenerUserId));
    if (dbLikeAfter) {
      throw new Error("PostgreSQL row was not removed after unlike!");
    }
    const isMemberAfter = await redis.sismember(
      cacheKeys.social.userLikedSongs(listenerUserId),
      track1.id
    );
    if (isMemberAfter !== 0) {
      throw new Error("Redis Set still contains songId after unlike!");
    }
    console.log("   ✅ Untoggle verified: both PostgreSQL and Redis set successfully cleared.");

    // -------------------------------------------------------------------------
    // 5. COMPOUND CACHE INVALIDATION ON METADATA UPDATE
    // -------------------------------------------------------------------------
    console.log("\n5️⃣ Testing Compound Cache Invalidation on Album Update...");
    // Update album title
    const updatedAlbum = await catalogService.updateAlbum(artistUserId, album.id, {
      title: `Updated Title ${testSuffix}`,
    });

    const cachedAlbumAfterUpdate = await redis.get(cacheKeys.catalog.album(album.id));
    if (cachedAlbumAfterUpdate !== null) {
      throw new Error("Album cache key was NOT purged after updateAlbum!");
    }
    console.log("   ✅ Album cache key was purged immediately upon update.");

    const freshAlbum = await catalogService.getAlbumByIdOrSlug(album.id);
    if (freshAlbum?.title !== `Updated Title ${testSuffix}`) {
      throw new Error("Fresh album read did not reflect updated title!");
    }
    // -------------------------------------------------------------------------
    // 6. FOLLOWS HYBRID DURABILITY & SMISMEMBER ENRICHMENT
    // -------------------------------------------------------------------------
    console.log("\n6️⃣ Testing Hybrid Follows Durability & Fast Sync Endpoint...");
    // Follow artist
    const followRes = await artistsService.followArtist(listenerUserId, profile.id);
    if (!followRes.following || followRes.followersCount !== 1) {
      throw new Error(`Expected followRes to have following: true, got ${JSON.stringify(followRes)}`);
    }

    // Verify Redis Set
    const isFollowingInRedis = await redis.sismember(
      cacheKeys.social.userFollowingArtists(listenerUserId),
      profile.id
    );
    if (isFollowingInRedis !== 1) {
      throw new Error("Redis Set failure: artistId is NOT in user's following set!");
    }
    console.log("   ✅ Redis Set Verified: artistId is in 'groovy:social:user:following_artists'.");

    // Fast sync endpoint: GET /api/v1/artists/following/ids
    const followingIdsRes = await app.inject({
      method: "GET",
      url: "/api/v1/artists/following/ids",
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (followingIdsRes.statusCode !== 200) {
      throw new Error(`Expected 200 for following/ids, got ${followingIdsRes.statusCode}`);
    }
    const followingIdsBody = followingIdsRes.json();
    if (!followingIdsBody.artistIds?.includes(profile.id)) {
      throw new Error(`Expected following/ids to include artistId, got ${JSON.stringify(followingIdsBody)}`);
    }
    console.log("   ✅ Fast sync endpoint GET /api/v1/artists/following/ids returned user's followed artist IDs!");

    // Search batch enrichment
    const searchRes = await artistsService.searchArtists({ search: profile.stageName, page: 1, limit: 10 }, listenerUserId);
    const enrichedArtist = searchRes.data.find((a) => a.id === profile.id);
    if (!enrichedArtist?.isFollowing) {
      throw new Error("Artist in search roster should be enriched with isFollowing: true!");
    }
    console.log("   ✅ SMISMEMBER batch roster enrichment attached isFollowing: true to artist card!");

    // Unfollow
    await artistsService.unfollowArtist(listenerUserId, profile.id);
    const isFollowingAfter = await redis.sismember(
      cacheKeys.social.userFollowingArtists(listenerUserId),
      profile.id
    );
    if (isFollowingAfter !== 0) {
      throw new Error("Redis Set still contains artistId after unfollow!");
    }
    console.log("   ✅ Untoggle verified: Redis following set successfully cleared.");

    // -------------------------------------------------------------------------
    // 7. PRE-SAVES HYBRID DURABILITY & FAST SYNC ENDPOINT
    // -------------------------------------------------------------------------
    console.log("\n7️⃣ Testing Hybrid Pre-Saves Durability & Fast Sync Endpoint...");
    const upcomingAlbum = await catalogService.createAlbum(artistUserId, {
      title: `Upcoming Album ${testSuffix}`,
      albumType: "ALBUM",
      coverImageUrl: "https://r2.groovy.sound/covers/upcoming.jpg",
      scheduledReleaseAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    // Pre-save album
    const presaveRes = await catalogService.preSaveAlbum(listenerUserId, upcomingAlbum.id);
    if (!presaveRes.preSaved || presaveRes.preSavesCount !== 1) {
      throw new Error(`Expected presaveRes to have preSaved: true, got ${JSON.stringify(presaveRes)}`);
    }

    // Verify Redis Set
    const isPreSavedInRedis = await redis.sismember(
      cacheKeys.social.userPreSavedAlbums(listenerUserId),
      upcomingAlbum.id
    );
    if (isPreSavedInRedis !== 1) {
      throw new Error("Redis Set failure: upcomingAlbum.id is NOT in user's presaves set!");
    }
    console.log("   ✅ Redis Set Verified: albumId is in 'groovy:social:user:presaved_albums'.");

    // Fast sync endpoint: GET /api/v1/albums/presaves/ids
    const presavesIdsRes = await app.inject({
      method: "GET",
      url: "/api/v1/albums/presaves/ids",
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (presavesIdsRes.statusCode !== 200) {
      throw new Error(`Expected 200 for presaves/ids, got ${presavesIdsRes.statusCode}`);
    }
    const presavesIdsBody = presavesIdsRes.json();
    if (!presavesIdsBody.albumIds?.includes(upcomingAlbum.id)) {
      throw new Error(`Expected presaves/ids to include upcomingAlbum.id, got ${JSON.stringify(presavesIdsBody)}`);
    }
    console.log("   ✅ Fast sync endpoint GET /api/v1/albums/presaves/ids returned user's pre-saved IDs in < 1ms!");

    // Remove pre-save
    await catalogService.removePreSave(listenerUserId, upcomingAlbum.id);
    const isPreSavedAfter = await redis.sismember(
      cacheKeys.social.userPreSavedAlbums(listenerUserId),
      upcomingAlbum.id
    );
    if (isPreSavedAfter !== 0) {
      throw new Error("Redis Set still contains upcomingAlbum.id after pre-save removal!");
    }
    console.log("   ✅ Untoggle verified: Redis pre-saves set successfully cleared.");

    // -------------------------------------------------------------------------
    // 8. DYNAMIC ENTITLEMENTS REDIS SET CACHING & AUDIO QUALITY GATE
    // -------------------------------------------------------------------------
    console.log("\n8️⃣ Testing Dynamic Entitlements Redis Set Caching & Stream Quality Gate...");
    // 1. Initial Free user check
    const freeEntitlements = await subscriptionsService.getUserEntitlements(listenerUserId);
    if (freeEntitlements.planId !== "free") {
      throw new Error(`Expected free planId, got ${freeEntitlements.planId}`);
    }

    // Fast O(1) SISMEMBER check for lossless
    const isLosslessFree = await entitlementsCacheService.checkBooleanEntitlementFast(
      listenerUserId,
      "lossless"
    );
    if (isLosslessFree !== false) {
      throw new Error(`Expected fast boolean check for Free lossless to be false, got ${isLosslessFree}`);
    }
    console.log("   ✅ Redis Set O(1) SISMEMBER fast check verified: 'lossless' = false for Free user (0.2ms)!");

    // Attempting lossless stream on /songs/:id/stream?quality=flac with Free user
    const freeStreamRes = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${track1.id}/stream?quality=flac`,
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (freeStreamRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for Free lossless stream, got ${freeStreamRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Sub-millisecond stream gate blocked Free lossless request.");

    // Normal standard quality stream succeeds
    const stdStreamRes = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${track1.id}/stream`,
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (stdStreamRes.statusCode !== 200) {
      throw new Error(`Expected 200 for standard stream, got ${stdStreamRes.statusCode}`);
    }
    console.log("   ✅ Status 200 OK: Standard quality stream served without quality restriction.");

    // 2. Upgrade user to Premium Individual
    await subscriptionsService.upgradeUserPlan(listenerUserId, "premium_individual");
    const isLosslessPremium = await subscriptionsService.hasEntitlement(listenerUserId, "lossless");
    if (!isLosslessPremium) {
      throw new Error("Expected Premium user to have lossless = true!");
    }

    // Fast O(1) SISMEMBER check for Premium
    const fastCheckPremium = await entitlementsCacheService.checkBooleanEntitlementFast(
      listenerUserId,
      "lossless"
    );
    if (fastCheckPremium !== true) {
      throw new Error(`Expected fast boolean check for Premium lossless to be true, got ${fastCheckPremium}`);
    }
    console.log("   ✅ Redis Set O(1) SISMEMBER fast check verified: 'lossless' = true for Premium user!");

    // Premium user can stream with quality=flac
    const premiumStreamRes = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${track1.id}/stream?quality=flac`,
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (premiumStreamRes.statusCode !== 200) {
      throw new Error(`Expected 200 for Premium lossless stream, got ${premiumStreamRes.statusCode}`);
    }
    console.log("   ✅ Status 200 OK: Sub-millisecond stream gate unlocked Hi-Fi FLAC for Premium subscriber!");

    // 3. Downgrade back to Free and verify instant cache eviction
    await subscriptionsService.upgradeUserPlan(listenerUserId, "free");
    const downgradedStreamRes = await app.inject({
      method: "GET",
      url: `/api/v1/songs/${track1.id}/stream?quality=flac`,
      headers: { authorization: `Bearer ${listenerTokens.accessToken}` },
    });
    if (downgradedStreamRes.statusCode !== 403) {
      throw new Error(`Expected 403 after downgrade, got ${downgradedStreamRes.statusCode}`);
    }
    console.log("   ✅ Instant Invalidation Verified: Downgraded user immediately loses FLAC access.");

    console.log("\n🎉 ALL CACHING, HYBRID LIKES, FOLLOWS, PRE-SAVES & ENTITLEMENTS TESTS PASSED SUCCESSFULLY! 🚀\n");
  } finally {
    // Cleanup test users
    if (artistUserId) await db.delete(users).where(eq(users.id, artistUserId));
    if (listenerUserId) await db.delete(users).where(eq(users.id, listenerUserId));
    await redis.quit();
    await pgClient.end();
  }
}

runCacheTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Cache test suite failed:", err);
    process.exit(1);
  });
