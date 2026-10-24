CREATE INDEX IF NOT EXISTS "idx_playlist_songs_song"
  ON "playlist_songs" USING btree ("song_id", "playlist_id");
