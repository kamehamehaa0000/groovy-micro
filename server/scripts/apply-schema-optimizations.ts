import { client } from "../src/db";

async function applyOptimizations() {
  console.log("🚀 Starting database schema optimizations & index tuning...\n");

  try {
    // 1. Check for potential duplicate slugs in albums where deleted_at IS NULL
    const albumDuplicates = await client`
      SELECT slug, COUNT(*) as count
      FROM albums
      WHERE deleted_at IS NULL
      GROUP BY slug
      HAVING COUNT(*) > 1
    `;
    if (albumDuplicates.length > 0) {
      console.warn("⚠️ Warning: Duplicate active album slugs found:", albumDuplicates);
    } else {
      console.log("✅ No duplicate active album slugs found.");
    }

    // 2. Check for potential duplicate (artist_id, slug) in songs where deleted_at IS NULL
    const songDuplicates = await client`
      SELECT artist_id, slug, COUNT(*) as count
      FROM songs
      WHERE deleted_at IS NULL
      GROUP BY artist_id, slug
      HAVING COUNT(*) > 1
    `;
    if (songDuplicates.length > 0) {
      console.warn("⚠️ Warning: Duplicate active artist song slugs found:", songDuplicates);
    } else {
      console.log("✅ No duplicate active artist song slugs found.");
    }

    // 3. Drop redundant / duplicate indexes
    console.log("\n🧹 Dropping redundant & superseded indexes...");
    const dropStatements = [
      "DROP INDEX IF EXISTS idx_users_email",
      "DROP INDEX IF EXISTS idx_users_google_id",
      "DROP INDEX IF EXISTS idx_artists_slug",
      "DROP INDEX IF EXISTS idx_user_library_playlists_user",
      "DROP INDEX IF EXISTS idx_user_follows_follower",
      "DROP INDEX IF EXISTS idx_user_follows_following",
      "DROP INDEX IF EXISTS idx_user_follows_status",
      "DROP INDEX IF EXISTS idx_albums_slug",
      "DROP INDEX IF EXISTS idx_songs_slug",
    ];

    for (const stmt of dropStatements) {
      await client.unsafe(stmt);
      console.log(`   ✓ Executed: ${stmt}`);
    }

    // 4. Create new compound and reverse FK indexes
    console.log("\n🔨 Creating optimized compound & reverse FK indexes...");
    const createStatements = [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_slug_unique ON albums (slug) WHERE deleted_at IS NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_artist_slug_unique ON songs (artist_id, slug) WHERE deleted_at IS NULL",
      "CREATE INDEX IF NOT EXISTS idx_user_library_albums_album ON user_library_albums (album_id)",
      "CREATE INDEX IF NOT EXISTS idx_user_library_playlists_playlist ON user_library_playlists (playlist_id)",
      "CREATE INDEX IF NOT EXISTS idx_history_song_recent ON listening_history (song_id, played_at)",
      "CREATE INDEX IF NOT EXISTS idx_albums_artist_published ON albums (artist_id, status, release_date) WHERE deleted_at IS NULL",
      "CREATE INDEX IF NOT EXISTS idx_songs_album_tracklist ON songs (album_id, disc_number, track_number) WHERE deleted_at IS NULL",
      "CREATE INDEX IF NOT EXISTS idx_user_follows_incoming_status ON user_follows (following_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_comments_song_root ON comments (song_id, is_pinned, likes_count) WHERE parent_id IS NULL AND deleted_at IS NULL",
      "CREATE INDEX IF NOT EXISTS idx_comments_album_root ON comments (album_id, is_pinned, likes_count) WHERE parent_id IS NULL AND deleted_at IS NULL",
      "CREATE INDEX IF NOT EXISTS idx_comments_playlist_root ON comments (playlist_id, is_pinned, likes_count) WHERE parent_id IS NULL AND deleted_at IS NULL",
    ];

    for (const stmt of createStatements) {
      await client.unsafe(stmt);
      console.log(`   ✓ Executed: ${stmt}`);
    }

    console.log("\n🎉 All schema optimizations successfully applied to PostgreSQL!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

applyOptimizations();
