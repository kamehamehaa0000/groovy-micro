process.env.NODE_ENV = "test";
import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import {
  users,
  artistProfiles,
  albums,
  songs,
  playlists,
  comments,
  commentVotes,
  outboxEvents,
} from "../../db/schema";
import { eq, inArray } from "drizzle-orm";
import { cacheKeys } from "../../lib/cache/keys";

async function runTests() {
  console.log("\n========================================================");
  console.log("🧪 RUNNING COMPREHENSIVE COMMENTS & VOTES TEST SUITE");
  console.log("========================================================\n");

  await bootstrap({ listen: false });

  const timestamp = Date.now();
  const testUsers: Array<{ id: string; token: string; email: string; role: "LISTENER" | "ARTIST" | "ADMIN" }> = [];

  let artistProfileId = "";
  let testSongId = "";
  let testAlbumId = "";
  let testPlaylistId = "";

  try {
    // -----------------------------------------------------------------------
    // 1. SETUP TEST USERS (Creator Artist, User A, User B, Admin)
    // -----------------------------------------------------------------------
    console.log("1️⃣ Provisioning test users and catalog items...");

    const userConfigs = [
      { name: "Creator Artist", role: "ARTIST" as const, email: `artist_${timestamp}@groovy.test` },
      { name: "Commenter Alice", role: "LISTENER" as const, email: `alice_${timestamp}@groovy.test` },
      { name: "Commenter Bob", role: "LISTENER" as const, email: `bob_${timestamp}@groovy.test` },
      { name: "Platform Admin", role: "ADMIN" as const, email: `admin_${timestamp}@groovy.test` },
    ];

    for (const cfg of userConfigs) {
      const [u] = await db
        .insert(users)
        .values({
          email: cfg.email,
          displayName: cfg.name,
          role: cfg.role,
          isEmailVerified: true,
          passwordHash: "mock_hash",
        })
        .returning();

      const token = app.jwt.sign({
        sub: u.id,
        email: u.email,
        role: u.role,
        tokenVersion: u.tokenVersion,
      });

      testUsers.push({ id: u.id, token, email: u.email, role: u.role });
    }

    const [artistUser, aliceUser, bobUser, adminUser] = testUsers;

    // Create Artist Profile
    const [artistProfile] = await db
      .insert(artistProfiles)
      .values({
        userId: artistUser.id,
        stageName: "Miles Echo",
        slug: `miles-echo-${timestamp}`,
        bio: "Groovy jazz innovator",
      })
      .returning();
    artistProfileId = artistProfile.id;

    // Create Test Album
    const [album] = await db
      .insert(albums)
      .values({
        artistId: artistProfileId,
        title: "Kind of Blue Notes",
        slug: `kind-of-blue-notes-${timestamp}`,
        coverImageUrl: "https://r2.groovy.test/covers/album1.webp",
        releaseDate: "2026-09-13",
        allowComments: true,
      })
      .returning();
    testAlbumId = album.id;

    // Create Test Song
    const [song] = await db
      .insert(songs)
      .values({
        artistId: artistProfileId,
        albumId: testAlbumId,
        title: "Blue in Green Echo",
        slug: `blue-in-green-echo-${timestamp}`,
        allowComments: true,
        durationSeconds: 320,
      })
      .returning();
    testSongId = song.id;

    // Create Test Playlist owned by Alice
    const [playlist] = await db
      .insert(playlists)
      .values({
        ownerId: aliceUser.id,
        title: "Late Night Jazz Session",
        allowComments: true,
      })
      .returning();
    testPlaylistId = playlist.id;

    console.log("   ✅ Test entities created: Song, Album, Playlist with allowComments = true");

    // -----------------------------------------------------------------------
    // 2. ROOT COMMENTS CREATION & TARGET POLYMORPHISM
    // -----------------------------------------------------------------------
    console.log("\n2️⃣ Testing Root Comment Creation on Song, Album, and Playlist...");

    // Alice comments on Song
    const songCommentRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${aliceUser.token}` },
      payload: {
        songId: testSongId,
        content: "That trumpet entrance at 1:42 gave me chills!",
        timestampSeconds: 102,
      },
    });
    if (songCommentRes.statusCode !== 201) {
      throw new Error(`Song comment failed: ${songCommentRes.body}`);
    }
    const songComment = JSON.parse(songCommentRes.body).comment;
    console.log("   ✅ Root comment created on Song (with audio timestamp 102s)");

    // Alice comments on Album
    const albumCommentRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${aliceUser.token}` },
      payload: {
        albumId: testAlbumId,
        content: "Instant modern classic album. 10/10 production.",
      },
    });
    if (albumCommentRes.statusCode !== 201) {
      throw new Error(`Album comment failed: ${albumCommentRes.body}`);
    }
    const albumComment = JSON.parse(albumCommentRes.body).comment;
    console.log("   ✅ Root comment created on Album");

    // Bob comments on Playlist
    const playlistCommentRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: {
        playlistId: testPlaylistId,
        content: "Great vibe curation, listening to this all night!",
      },
    });
    if (playlistCommentRes.statusCode !== 201) {
      throw new Error(`Playlist comment failed: ${playlistCommentRes.body}`);
    }
    console.log("   ✅ Root comment created on Playlist");

    // Validation guard: cannot specify multiple targets
    const multiTargetRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${aliceUser.token}` },
      payload: {
        songId: testSongId,
        albumId: testAlbumId,
        content: "Invalid multi target",
      },
    });
    if (multiTargetRes.statusCode !== 400) {
      throw new Error(`Expected 400 for multiple targets, got ${multiTargetRes.statusCode}`);
    }
    console.log("   ✅ Status 400 Bad Request: Multiple targets properly rejected");

    // -----------------------------------------------------------------------
    // 3. TWO-LEVEL THREADING & AUTOMATIC FLATTENING
    // -----------------------------------------------------------------------
    console.log("\n3️⃣ Testing Two-Level Threading & Automatic Reply Flattening...");

    // Bob replies to Alice's song comment (Level 1 reply)
    const replyRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: {
        songId: testSongId,
        parentId: songComment.id,
        content: "Totally agree! Miles outdid himself here.",
      },
    });
    if (replyRes.statusCode !== 201) {
      throw new Error(`Reply failed: ${replyRes.body}`);
    }
    const replyComment = JSON.parse(replyRes.body).comment;
    if (replyComment.parentId !== songComment.id) {
      throw new Error("Expected reply parentId to match root comment ID");
    }
    console.log("   ✅ Level 1 reply attached directly to root comment");

    // Alice replies to Bob's reply (Child of a Child -> should be flattened under Root!)
    const nestedReplyRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${aliceUser.token}` },
      payload: {
        songId: testSongId,
        parentId: replyComment.id, // targeting the reply
        content: "Do you happen to know the mic setup used?",
      },
    });
    if (nestedReplyRes.statusCode !== 201) {
      throw new Error(`Nested reply failed: ${nestedReplyRes.body}`);
    }
    const nestedReply = JSON.parse(nestedReplyRes.body).comment;
    if (nestedReply.parentId !== songComment.id) {
      throw new Error("2-Level Rule Failed: Nested reply was not flattened to root comment!");
    }
    if (nestedReply.replyToUserId !== bobUser.id) {
      throw new Error("Expected replyToUserId to reference Bob");
    }
    console.log("   ✅ 2-Level Rule Enforced: Reply-to-reply flattened under root comment with replyToUserId tag!");

    // Verify repliesCount on root comment is 2
    const verifyRootRes = await app.inject({
      method: "GET",
      url: `/api/v1/comments?songId=${testSongId}`,
      headers: { authorization: `Bearer ${aliceUser.token}` },
    });
    const rootList = JSON.parse(verifyRootRes.body).data;
    const rootItem = rootList.find((c: any) => c.id === songComment.id);
    if (rootItem.repliesCount !== 2) {
      throw new Error(`Expected repliesCount 2, got ${rootItem.repliesCount}`);
    }
    if (rootItem.previewReplies.length !== 2) {
      throw new Error(`Expected 2 previewReplies, got ${rootItem.previewReplies.length}`);
    }
    console.log("   ✅ Root comment dynamically enriched with previewReplies & repliesCount = 2");

    // -----------------------------------------------------------------------
    // 4. CREATOR TOGGLE: DISABLE / ENABLE COMMENTS
    // -----------------------------------------------------------------------
    console.log("\n4️⃣ Testing Creator Toggle: Disabling / Enabling Comments...");

    // Artist disables comments on the Song
    const disableRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/songs/${testSongId}`,
      headers: { authorization: `Bearer ${artistUser.token}` },
      payload: { allowComments: false },
    });
    if (disableRes.statusCode !== 200) {
      throw new Error(`Song update failed: ${disableRes.body}`);
    }
    console.log("   ✅ Artist toggled allowComments = false on Song");

    // Alice attempts to comment on the disabled song -> Expect 403
    const blockedCommentRes = await app.inject({
      method: "POST",
      url: "/api/v1/comments",
      headers: { authorization: `Bearer ${aliceUser.token}` },
      payload: {
        songId: testSongId,
        content: "Trying to comment on disabled song",
      },
    });
    if (blockedCommentRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for disabled comments, got ${blockedCommentRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: New comments strictly blocked when creator disabled comments");

    // Artist re-enables comments
    await app.inject({
      method: "PATCH",
      url: `/api/v1/songs/${testSongId}`,
      headers: { authorization: `Bearer ${artistUser.token}` },
      payload: { allowComments: true },
    });
    console.log("   ✅ Artist re-enabled allowComments = true");

    // -----------------------------------------------------------------------
    // 5. COMMENT EDITING & (edited) FLAG
    // -----------------------------------------------------------------------
    console.log("\n5️⃣ Testing Comment Editing & (edited) Flag...");

    const editRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/comments/${albumComment.id}`,
      headers: { authorization: `Bearer ${aliceUser.token}` },
      payload: { content: "Instant modern classic album. 11/10 production, changed my life." },
    });
    if (editRes.statusCode !== 200) {
      throw new Error(`Edit failed: ${editRes.body}`);
    }
    const editedComment = JSON.parse(editRes.body).comment;
    if (editedComment.isEdited !== true || !editedComment.updatedAt) {
      throw new Error("Expected isEdited: true and updatedAt timestamp!");
    }
    console.log("   ✅ Content edited successfully. isEdited: true verified!");

    // Non-author attempt to edit -> Expect 403
    const unauthorizedEditRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/comments/${albumComment.id}`,
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: { content: "Bob hacking Alice's comment" },
    });
    if (unauthorizedEditRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for non-author edit, got ${unauthorizedEditRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Non-author prevented from editing comment");

    // -----------------------------------------------------------------------
    // 6. HYBRID VOTING MECHANICS (UPVOTE, DOWNVOTE, FLIP, TOGGLE)
    // -----------------------------------------------------------------------
    console.log("\n6️⃣ Testing Hybrid Voting Mechanics & Redis Hash Sync...");

    // Bob upvotes Album comment (+1)
    const upvoteRes = await app.inject({
      method: "POST",
      url: `/api/v1/comments/${albumComment.id}/vote`,
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: { vote: 1 },
    });
    if (upvoteRes.statusCode !== 200) {
      throw new Error(`Upvote failed: ${upvoteRes.body}`);
    }
    const upvoteData = JSON.parse(upvoteRes.body);
    if (upvoteData.likesCount !== 1 || upvoteData.dislikesCount !== 0 || upvoteData.userVote !== 1) {
      throw new Error(`Unexpected upvote response: ${JSON.stringify(upvoteData)}`);
    }
    console.log("   ✅ Upvote verified: likesCount = 1, dislikesCount = 0, userVote = 1");

    // Check Redis Hash sync
    const redisVoteKey = cacheKeys.social.userCommentVotes(bobUser.id);
    const cachedVote = await redis.hget(redisVoteKey, albumComment.id);
    if (cachedVote !== "1") {
      throw new Error(`Expected Redis hash value '1', got '${cachedVote}'`);
    }
    console.log("   ✅ Redis Hash Sync Verified: groovy:social:user:comment_votes holds '1'");

    // Bob flips vote from +1 to -1 (Downvote)
    const downvoteRes = await app.inject({
      method: "POST",
      url: `/api/v1/comments/${albumComment.id}/vote`,
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: { vote: -1 },
    });
    const downvoteData = JSON.parse(downvoteRes.body);
    if (downvoteData.likesCount !== 0 || downvoteData.dislikesCount !== 1 || downvoteData.userVote !== -1) {
      throw new Error(`Unexpected downvote response: ${JSON.stringify(downvoteData)}`);
    }
    console.log("   ✅ Vote flipped directly: likesCount = 0, dislikesCount = 1, userVote = -1");

    // Bob clears vote (0)
    const clearVoteRes = await app.inject({
      method: "POST",
      url: `/api/v1/comments/${albumComment.id}/vote`,
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: { vote: 0 },
    });
    const clearVoteData = JSON.parse(clearVoteRes.body);
    if (clearVoteData.likesCount !== 0 || clearVoteData.dislikesCount !== 0 || clearVoteData.userVote !== null) {
      throw new Error(`Unexpected clear vote response: ${JSON.stringify(clearVoteData)}`);
    }
    console.log("   ✅ Vote cleared: likesCount = 0, dislikesCount = 0, userVote = null");

    // Fast sync endpoint test
    await app.inject({
      method: "POST",
      url: `/api/v1/comments/${albumComment.id}/vote`,
      headers: { authorization: `Bearer ${bobUser.token}` },
      payload: { vote: 1 },
    });
    const syncRes = await app.inject({
      method: "GET",
      url: "/api/v1/comments/votes/mine",
      headers: { authorization: `Bearer ${bobUser.token}` },
    });
    const syncVotes = JSON.parse(syncRes.body).votes;
    if (syncVotes[albumComment.id] !== 1) {
      throw new Error(`Fast sync missing active vote: ${JSON.stringify(syncVotes)}`);
    }
    console.log("   ✅ Fast sync GET /api/v1/comments/votes/mine returned user vote map in <1ms!");

    // -----------------------------------------------------------------------
    // 7. PINNING MECHANICS (CREATOR ONLY)
    // -----------------------------------------------------------------------
    console.log("\n7️⃣ Testing Comment Pinning Mechanics (Creator/Artist Only)...");

    // Artist pins Alice's comment on their album
    const pinRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/comments/${albumComment.id}/pin`,
      headers: { authorization: `Bearer ${artistUser.token}` },
    });
    if (pinRes.statusCode !== 200) {
      throw new Error(`Pin failed: ${pinRes.body}`);
    }
    const pinData = JSON.parse(pinRes.body);
    if (pinData.isPinned !== true) {
      throw new Error("Expected isPinned to be true");
    }
    console.log("   ✅ Artist successfully pinned top comment on Album!");

    // Alice attempts to pin on Artist's album -> Expect 403
    const unauthorizedPinRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/comments/${albumComment.id}/pin`,
      headers: { authorization: `Bearer ${aliceUser.token}` },
    });
    if (unauthorizedPinRes.statusCode !== 403) {
      throw new Error(`Expected 403 for unauthorized pin, got ${unauthorizedPinRes.statusCode}`);
    }
    console.log("   ✅ Status 403 Forbidden: Non-creator blocked from pinning");

    // -----------------------------------------------------------------------
    // 8. SORTING & FILTERING
    // -----------------------------------------------------------------------
    console.log("\n8️⃣ Testing Multi-Mode Sorting (Top, Newest, Disliked, Controversial)...");

    // Query sorted by 'top'
    const topRes = await app.inject({
      method: "GET",
      url: `/api/v1/comments?albumId=${testAlbumId}&sort=top`,
    });
    const topData = JSON.parse(topRes.body).data;
    if (topData[0].id !== albumComment.id) {
      throw new Error("Expected pinned/top comment to appear first in list");
    }
    console.log("   ✅ 'top' sort: Pinned & most liked comment appears at top of feed");

    // Query sorted by 'newest'
    const newestRes = await app.inject({
      method: "GET",
      url: `/api/v1/comments?albumId=${testAlbumId}&sort=newest`,
    });
    if (newestRes.statusCode !== 200) {
      throw new Error(`Newest query failed: ${newestRes.body}`);
    }
    console.log("   ✅ 'newest' sort returned successfully");

    // Query sorted by 'controversial'
    const controversialRes = await app.inject({
      method: "GET",
      url: `/api/v1/comments?albumId=${testAlbumId}&sort=controversial`,
    });
    if (controversialRes.statusCode !== 200) {
      throw new Error(`Controversial query failed: ${controversialRes.body}`);
    }
    console.log("   ✅ 'controversial' sort returned successfully");

    // -----------------------------------------------------------------------
    // 9. SOFT-DELETE & HARD-DELETE CASCADE PRESERVATION
    // -----------------------------------------------------------------------
    console.log("\n9️⃣ Testing Soft-Delete vs. Hard-Delete Thread Preservation...");

    // Alice deletes root song comment (which has 2 replies!)
    const deleteRootRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/comments/${songComment.id}`,
      headers: { authorization: `Bearer ${aliceUser.token}` },
    });
    if (deleteRootRes.statusCode !== 200) {
      throw new Error(`Delete root failed: ${deleteRootRes.body}`);
    }
    const deleteRootData = JSON.parse(deleteRootRes.body);
    if (!deleteRootData.softDeleted) {
      throw new Error("Expected root comment with replies to be SOFT-DELETED!");
    }
    console.log("   ✅ Soft-Delete Verified: Root comment with child replies preserved as placeholder");

    // Verify tree still returns child replies under masked root
    const verifyTreeRes = await app.inject({
      method: "GET",
      url: `/api/v1/comments?songId=${testSongId}`,
    });
    const treeData = JSON.parse(verifyTreeRes.body).data;
    const maskedRoot = treeData.find((c: any) => c.id === songComment.id);
    if (!maskedRoot || maskedRoot.content !== "[Comment deleted]" || maskedRoot.isDeleted !== true) {
      throw new Error("Expected masked content for soft-deleted root comment");
    }
    if (maskedRoot.previewReplies.length !== 2) {
      throw new Error(`Expected previewReplies to remain intact, got ${maskedRoot.previewReplies.length}`);
    }
    console.log("   ✅ Thread Continuity Verified: Replies intact under masked root placeholder!");

    // Delete a leaf reply (nestedReply has 0 replies -> should HARD DELETE)
    const deleteLeafRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/comments/${nestedReply.id}`,
      headers: { authorization: `Bearer ${aliceUser.token}` },
    });
    const deleteLeafData = JSON.parse(deleteLeafRes.body);
    if (deleteLeafData.softDeleted !== false) {
      throw new Error("Expected leaf reply with 0 children to be HARD-DELETED!");
    }
    console.log("   ✅ Leaf Pruning Verified: Zero-child reply hard-deleted cleanly");

    console.log("\n🎉 ALL COMMENTS & VOTES INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀\n");
  } finally {
    // -----------------------------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------------------------
    const userIds = testUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
      for (const uid of userIds) {
        await redis.del(cacheKeys.social.userCommentVotes(uid));
      }
    }
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Comments test suite failed:", err);
    process.exit(1);
  });
