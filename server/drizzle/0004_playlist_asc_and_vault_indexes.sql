CREATE INDEX IF NOT EXISTS "idx_playlists_directory_popular_asc"
  ON "playlists" USING btree ("saves_count" ASC, "created_at" ASC, "id" ASC)
  WHERE "visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_playlists_directory_recent_asc"
  ON "playlists" USING btree ("created_at" ASC, "saves_count" ASC, "id" ASC)
  WHERE "visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_personal_created"
  ON "albums" USING btree ("uploader_user_id", "created_at" DESC, "id" DESC)
  WHERE "scope" = 'PERSONAL' AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_personal_title"
  ON "albums" USING btree ("uploader_user_id", "title")
  WHERE "scope" = 'PERSONAL' AND "deleted_at" IS NULL;
