import { client as pgClient } from "../src/db";

async function runMigration() {
  console.log("🚀 Running Cloud Locker & Catalog Scope Schema Migration...");

  try {
    // 1. Create catalog_scope enum if not exists
    await pgClient`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catalog_scope') THEN
          CREATE TYPE catalog_scope AS ENUM ('GLOBAL', 'PERSONAL');
        END IF;
      END $$;
    `;
    console.log("   ✅ catalog_scope enum checked/created.");

    // 2. Add locker preference flags to users
    await pgClient`
      ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS locker_include_in_search boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS locker_include_in_home boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS locker_include_in_recently_played boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS locker_link_to_global_artists boolean NOT NULL DEFAULT false;
    `;
    console.log("   ✅ users table locker preferences added.");

    // 3. Update artist_profiles
    await pgClient`
      ALTER TABLE artist_profiles 
        ALTER COLUMN user_id DROP NOT NULL;
    `;
    await pgClient`
      ALTER TABLE artist_profiles 
        ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS scope catalog_scope NOT NULL DEFAULT 'GLOBAL';
    `;
    await pgClient`
      CREATE INDEX IF NOT EXISTS idx_artists_scope_owner ON artist_profiles (scope, owner_user_id);
    `;
    console.log("   ✅ artist_profiles scope, owner_user_id, and index updated.");

    // 4. Update albums
    await pgClient`
      ALTER TABLE albums 
        ADD COLUMN IF NOT EXISTS scope catalog_scope NOT NULL DEFAULT 'GLOBAL',
        ADD COLUMN IF NOT EXISTS uploader_user_id uuid REFERENCES users(id) ON DELETE CASCADE;
    `;
    await pgClient`
      CREATE INDEX IF NOT EXISTS idx_albums_scope_uploader ON albums (scope, uploader_user_id);
    `;
    console.log("   ✅ albums scope, uploader_user_id, and index updated.");

    // 5. Update songs
    await pgClient`
      ALTER TABLE songs 
        ADD COLUMN IF NOT EXISTS scope catalog_scope NOT NULL DEFAULT 'GLOBAL',
        ADD COLUMN IF NOT EXISTS uploader_user_id uuid REFERENCES users(id) ON DELETE CASCADE;
    `;
    await pgClient`
      CREATE INDEX IF NOT EXISTS idx_songs_scope_uploader ON songs (scope, uploader_user_id);
    `;
    console.log("   ✅ songs scope, uploader_user_id, and index updated.");

    console.log("🎉 Cloud Locker Schema Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

runMigration();
