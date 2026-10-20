CREATE INDEX IF NOT EXISTS "idx_playlists_directory_popular"
  ON "playlists" USING btree ("saves_count" DESC, "created_at" DESC, "id" DESC)
  WHERE "visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_playlists_directory_recent"
  ON "playlists" USING btree ("created_at" DESC, "saves_count" DESC, "id" DESC)
  WHERE "visibility" = 'PUBLIC';
