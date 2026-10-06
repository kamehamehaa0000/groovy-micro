import { client as pgClient } from "../src/db";

async function runNotificationsMigration() {
  console.log("🚀 Running Notifications Subsystem Schema Migration...");

  try {
    // 1. Create notification_type enum if not exists
    await pgClient`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
          CREATE TYPE notification_type AS ENUM (
            'FOLLOW_REQUEST',
            'FOLLOW_ACCEPTED',
            'NEW_FOLLOWER',
            'COMMENT_REPLY',
            'COMMENT_MENTION',
            'PLAYLIST_COMMENT',
            'ARTIST_RELEASE',
            'JAM_INVITE',
            'TRANSCODE_COMPLETE',
            'TRANSCODE_FAILED',
            'SYSTEM_ALERT'
          );
        END IF;
      END $$;
    `;
    console.log("   ✅ notification_type enum verified/created.");

    // 2. Create notifications table if not exists
    await pgClient`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        type notification_type NOT NULL,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        metadata jsonb,
        is_read boolean NOT NULL DEFAULT false,
        read_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log("   ✅ notifications table verified/created.");

    // 3. Create notification_preferences table if not exists
    await pgClient`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        email_releases boolean NOT NULL DEFAULT true,
        email_comments boolean NOT NULL DEFAULT true,
        push_social boolean NOT NULL DEFAULT true,
        push_jams boolean NOT NULL DEFAULT true,
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log("   ✅ notification_preferences table verified/created.");

    // 4. Create performance indexes
    await pgClient`
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread 
        ON notifications (recipient_id, is_read, created_at DESC);
    `;
    await pgClient`
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created 
        ON notifications (recipient_id, created_at DESC);
    `;
    console.log("   ✅ idx_notifications_recipient_unread and idx_notifications_recipient_created verified/created.");

    console.log("🎉 Notifications Schema Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

runNotificationsMigration();
