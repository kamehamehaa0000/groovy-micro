CREATE TYPE "public"."album_type" AS ENUM('ALBUM', 'SINGLE', 'EP', 'MIXTAPE', 'LP');--> statement-breakpoint
CREATE TYPE "public"."catalog_scope" AS ENUM('GLOBAL', 'PERSONAL');--> statement-breakpoint
CREATE TYPE "public"."credit_role" AS ENUM('PRIMARY', 'FEATURED', 'PRODUCER', 'COMPOSER', 'LYRICIST', 'ENGINEER', 'MIX_AND_MASTER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."follow_status" AS ENUM('PENDING', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."library_privacy" AS ENUM('PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."listening_activity_privacy" AS ENUM('FRIENDS_ONLY', 'FOLLOWERS', 'OFF');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'NEW_FOLLOWER', 'COMMENT_REPLY', 'COMMENT_MENTION', 'PLAYLIST_COMMENT', 'ARTIST_RELEASE', 'JAM_INVITE', 'TRANSCODE_COMPLETE', 'TRANSCODE_FAILED', 'SYSTEM_ALERT');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."release_visibility" AS ENUM('PUBLIC', 'UNLISTED', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."song_status" AS ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('LISTENER', 'ARTIST', 'ADMIN');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'LISTENER' NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_private_account" boolean DEFAULT false NOT NULL,
	"listening_activity_privacy" "listening_activity_privacy" DEFAULT 'FRIENDS_ONLY' NOT NULL,
	"library_privacy" "library_privacy" DEFAULT 'PUBLIC' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"google_id" varchar(255),
	"locker_include_in_search" boolean DEFAULT true NOT NULL,
	"locker_include_in_home" boolean DEFAULT false NOT NULL,
	"locker_include_in_recently_played" boolean DEFAULT true NOT NULL,
	"locker_link_to_global_artists" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "artist_followers" (
	"user_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_followers_user_id_artist_id_pk" PRIMARY KEY("user_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "artist_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"owner_user_id" uuid,
	"scope" "catalog_scope" DEFAULT 'GLOBAL' NOT NULL,
	"stage_name" varchar(150) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"bio" text,
	"banner_url" text,
	"avatar_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_status" varchar(20) DEFAULT 'NONE' NOT NULL,
	"verification_details" jsonb DEFAULT '{}'::jsonb,
	"rejection_reason" text,
	"monthly_listeners" integer DEFAULT 0 NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb,
	"pinned_release_id" uuid,
	"pinned_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plan_feature_definitions" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"value_type" varchar(20) DEFAULT 'BOOLEAN' NOT NULL,
	"default_value" jsonb DEFAULT 'false'::jsonb NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"interval" varchar(20) DEFAULT 'month' NOT NULL,
	"features" jsonb DEFAULT '{"max_bitrate_kbps":128,"lossless":false,"ad_free":false,"can_host_jam":false,"max_jam_participants":3}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" varchar(50) NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"external_customer_id" varchar(255),
	"external_subscription_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"album_type" "album_type" DEFAULT 'ALBUM' NOT NULL,
	"cover_image_url" text,
	"description" text,
	"genre" varchar(60),
	"primary_genre" varchar(60),
	"sub_genre" varchar(80),
	"moods" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"release_date" date NOT NULL,
	"scope" "catalog_scope" DEFAULT 'GLOBAL' NOT NULL,
	"uploader_user_id" uuid,
	"status" "release_status" DEFAULT 'PUBLISHED' NOT NULL,
	"visibility" "release_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"scheduled_release_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"share_token" varchar(64),
	"allow_comments" boolean DEFAULT true NOT NULL,
	"pre_saves_count" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"total_tracks" integer DEFAULT 0 NOT NULL,
	"total_duration_seconds" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_presaves" (
	"user_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_presaves_user_id_album_id_pk" PRIMARY KEY("user_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "song_credits" (
	"song_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "credit_role" DEFAULT 'PRIMARY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_credits_song_id_artist_id_role_pk" PRIMARY KEY("song_id","artist_id","role")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"album_id" uuid,
	"title" varchar(255) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"genre" varchar(60),
	"primary_genre" varchar(60),
	"sub_genre" varchar(80),
	"moods" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"bpm" integer,
	"musical_key" varchar(20),
	"energy" real,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"track_number" integer DEFAULT 1,
	"disc_number" integer DEFAULT 1,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"scope" "catalog_scope" DEFAULT 'GLOBAL' NOT NULL,
	"uploader_user_id" uuid,
	"raw_audio_key" text,
	"audio_url" text,
	"cover_image_url" text,
	"hls_manifest_url" text,
	"processing_status" "song_status" DEFAULT 'PENDING' NOT NULL,
	"processing_error" text,
	"audio_analysis" jsonb,
	"allow_comments" boolean DEFAULT true NOT NULL,
	"plays_count" bigint DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_collaborators" (
	"playlist_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_collaborators_playlist_id_user_id_pk" PRIMARY KEY("playlist_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "playlist_songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(150) NOT NULL,
	"description" text,
	"cover_image_url" text,
	"visibility" "release_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_collaborative" boolean DEFAULT false NOT NULL,
	"share_token" varchar(64),
	"collaboration_token" varchar(64),
	"allow_duplicates" boolean DEFAULT false NOT NULL,
	"allow_comments" boolean DEFAULT true NOT NULL,
	"saves_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_library_albums" (
	"user_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_library_albums_user_id_album_id_pk" PRIMARY KEY("user_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "user_library_playlists" (
	"user_id" uuid NOT NULL,
	"playlist_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_library_playlists_user_id_playlist_id_pk" PRIMARY KEY("user_id","playlist_id")
);
--> statement-breakpoint
CREATE TABLE "album_likes" (
	"user_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_likes_user_id_album_id_pk" PRIMARY KEY("user_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "song_likes" (
	"user_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_likes_user_id_song_id_pk" PRIMARY KEY("user_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"status" "follow_status" DEFAULT 'ACCEPTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "listening_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"duration_listened_seconds" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"skip_duration_seconds" integer,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" varchar(50) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"user_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"vote" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_votes_user_id_comment_id_pk" PRIMARY KEY("user_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"song_id" uuid,
	"album_id" uuid,
	"playlist_id" uuid,
	"parent_id" uuid,
	"reply_to_user_id" uuid,
	"timestamp_seconds" integer,
	"content" text NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"dislikes_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "chk_comments_single_target" CHECK (num_nonnulls("comments"."song_id", "comments"."album_id", "comments"."playlist_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "user_library_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_type" varchar(32) NOT NULL,
	"item_id" varchar(64) NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_releases" boolean DEFAULT true NOT NULL,
	"email_comments" boolean DEFAULT true NOT NULL,
	"push_social" boolean DEFAULT true NOT NULL,
	"push_jams" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" "notification_type" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_followers" ADD CONSTRAINT "artist_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_followers" ADD CONSTRAINT "artist_followers_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profiles" ADD CONSTRAINT "artist_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profiles" ADD CONSTRAINT "artist_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profiles" ADD CONSTRAINT "artist_profiles_pinned_release_id_albums_id_fk" FOREIGN KEY ("pinned_release_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_presaves" ADD CONSTRAINT "release_presaves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_presaves" ADD CONSTRAINT "release_presaves_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_credits" ADD CONSTRAINT "song_credits_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_credits" ADD CONSTRAINT "song_credits_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_artist_id_artist_profiles_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_collaborators" ADD CONSTRAINT "playlist_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library_albums" ADD CONSTRAINT "user_library_albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library_albums" ADD CONSTRAINT "user_library_albums_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library_playlists" ADD CONSTRAINT "user_library_playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library_playlists" ADD CONSTRAINT "user_library_playlists_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_likes" ADD CONSTRAINT "album_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_likes" ADD CONSTRAINT "album_likes_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_likes" ADD CONSTRAINT "song_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_likes" ADD CONSTRAINT "song_likes_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_history" ADD CONSTRAINT "listening_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_history" ADD CONSTRAINT "listening_history_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_user_id_users_id_fk" FOREIGN KEY ("reply_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library_pins" ADD CONSTRAINT "user_library_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artist_followers_artist" ON "artist_followers" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "idx_artists_stage_name" ON "artist_profiles" USING btree ("stage_name");--> statement-breakpoint
CREATE INDEX "idx_artists_verification_status" ON "artist_profiles" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "idx_artists_scope_owner" ON "artist_profiles" USING btree ("scope","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artists_user_id_unique" ON "artist_profiles" USING btree ("user_id") WHERE "artist_profiles"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_user" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_albums_artist" ON "albums" USING btree ("artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_albums_slug_unique" ON "albums" USING btree ("slug") WHERE "albums"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_albums_artist_published" ON "albums" USING btree ("artist_id","status","release_date") WHERE "albums"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_albums_status" ON "albums" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_albums_scope_uploader" ON "albums" USING btree ("scope","uploader_user_id");--> statement-breakpoint
CREATE INDEX "idx_albums_scheduled_at" ON "albums" USING btree ("scheduled_release_at");--> statement-breakpoint
CREATE INDEX "idx_albums_visibility" ON "albums" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_albums_deleted_at" ON "albums" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_albums_personal_created" ON "albums" USING btree ("uploader_user_id","created_at" desc,"id" desc) WHERE "albums"."scope" = 'PERSONAL' AND "albums"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_albums_personal_title" ON "albums" USING btree ("uploader_user_id","title") WHERE "albums"."scope" = 'PERSONAL' AND "albums"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_presaves_album" ON "release_presaves" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "idx_presaves_user" ON "release_presaves" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_song_credits_artist" ON "song_credits" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "idx_song_credits_song" ON "song_credits" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "idx_songs_artist" ON "songs" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "idx_songs_album" ON "songs" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_songs_artist_slug_unique" ON "songs" USING btree ("artist_id","slug") WHERE "songs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_songs_album_tracklist" ON "songs" USING btree ("album_id","disc_number","track_number") WHERE "songs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_songs_status" ON "songs" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "idx_songs_scope_uploader" ON "songs" USING btree ("scope","uploader_user_id");--> statement-breakpoint
CREATE INDEX "idx_songs_title" ON "songs" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_songs_deleted_at" ON "songs" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_playlist_collab_user" ON "playlist_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_playlist_songs_lookup" ON "playlist_songs" USING btree ("playlist_id","song_id");--> statement-breakpoint
CREATE INDEX "idx_playlist_songs_order" ON "playlist_songs" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "idx_playlist_songs_song" ON "playlist_songs" USING btree ("song_id","playlist_id");--> statement-breakpoint
CREATE INDEX "idx_playlists_owner" ON "playlists" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_playlists_visibility" ON "playlists" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_playlists_directory_popular" ON "playlists" USING btree ("saves_count" desc,"created_at" desc,"id" desc) WHERE "playlists"."visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX "idx_playlists_directory_recent" ON "playlists" USING btree ("created_at" desc,"saves_count" desc,"id" desc) WHERE "playlists"."visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX "idx_playlists_directory_popular_asc" ON "playlists" USING btree ("saves_count" asc,"created_at" asc,"id" asc) WHERE "playlists"."visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX "idx_playlists_directory_recent_asc" ON "playlists" USING btree ("created_at" asc,"saves_count" asc,"id" asc) WHERE "playlists"."visibility" = 'PUBLIC';--> statement-breakpoint
CREATE INDEX "idx_user_library_albums_album" ON "user_library_albums" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "idx_user_library_playlists_playlist" ON "user_library_playlists" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "idx_album_likes_user" ON "album_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_song_likes_user" ON "song_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_incoming_status" ON "user_follows" USING btree ("following_id","status");--> statement-breakpoint
CREATE INDEX "idx_history_user_recent" ON "listening_history" USING btree ("user_id","played_at");--> statement-breakpoint
CREATE INDEX "idx_history_song_recent" ON "listening_history" USING btree ("song_id","played_at");--> statement-breakpoint
CREATE INDEX "idx_outbox_pending" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."published_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_comment_votes_comment" ON "comment_votes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "idx_comment_votes_user" ON "comment_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_comments_song" ON "comments" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "idx_comments_album" ON "comments" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "idx_comments_playlist" ON "comments" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "idx_comments_parent" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_comments_user" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_comments_created" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_comments_likes" ON "comments" USING btree ("likes_count");--> statement-breakpoint
CREATE INDEX "idx_comments_song_root" ON "comments" USING btree ("song_id","is_pinned","likes_count") WHERE "comments"."parent_id" IS NULL AND "comments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_comments_album_root" ON "comments" USING btree ("album_id","is_pinned","likes_count") WHERE "comments"."parent_id" IS NULL AND "comments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_comments_playlist_root" ON "comments" USING btree ("playlist_id","is_pinned","likes_count") WHERE "comments"."parent_id" IS NULL AND "comments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_pins_unique" ON "user_library_pins" USING btree ("user_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "idx_user_pins_user" ON "user_library_pins" USING btree ("user_id","pinned_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_unread" ON "notifications" USING btree ("recipient_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_created" ON "notifications" USING btree ("recipient_id","created_at");