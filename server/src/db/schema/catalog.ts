import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  date,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { artistProfiles } from "./artists";
import { users } from "./users";
import {
  albumTypeEnum,
  songStatusEnum,
  creditRoleEnum,
  releaseStatusEnum,
  releaseVisibilityEnum,
} from "./enums";

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    albumType: albumTypeEnum("album_type").notNull().default("ALBUM"),
    coverImageUrl: text("cover_image_url").notNull(),
    description: text("description"),
    genre: varchar("genre", { length: 60 }),
    releaseDate: date("release_date").notNull(),

    // Scheduling & Status Lifecycle
    status: releaseStatusEnum("status").notNull().default("PUBLISHED"),
    visibility: releaseVisibilityEnum("visibility").notNull().default("PUBLIC"),
    scheduledReleaseAt: timestamp("scheduled_release_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    shareToken: varchar("share_token", { length: 64 }),

    // Aggregates & Counts
    allowComments: boolean("allow_comments").notNull().default(true),
    preSavesCount: integer("pre_saves_count").notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),
    totalTracks: integer("total_tracks").notNull().default(0),
    totalDurationSeconds: integer("total_duration_seconds").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_albums_artist").on(table.artistId),
    index("idx_albums_slug").on(table.slug),
    index("idx_albums_status").on(table.status),
    index("idx_albums_scheduled_at").on(table.scheduledReleaseAt),
    index("idx_albums_visibility").on(table.visibility),
    index("idx_albums_deleted_at").on(table.deletedAt),
  ]
);

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    albumId: uuid("album_id").references(() => albums.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    genre: varchar("genre", { length: 60 }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    trackNumber: integer("track_number").default(1),
    discNumber: integer("disc_number").default(1),
    isExplicit: boolean("is_explicit").notNull().default(false),

    // Audio Processing Fields
    rawAudioKey: text("raw_audio_key"),
    audioUrl: text("audio_url"),
    coverImageUrl: text("cover_image_url"),
    hlsManifestUrl: text("hls_manifest_url"),
    processingStatus: songStatusEnum("processing_status")
      .notNull()
      .default("PENDING"),
    processingError: text("processing_error"),

    // Cached Counter Aggregates
    allowComments: boolean("allow_comments").notNull().default(true),
    playsCount: bigint("plays_count", { mode: "number" }).notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_songs_artist").on(table.artistId),
    index("idx_songs_album").on(table.albumId),
    index("idx_songs_status").on(table.processingStatus),
    index("idx_songs_title").on(table.title),
    index("idx_songs_slug").on(table.slug),
    index("idx_songs_deleted_at").on(table.deletedAt),
  ]
);

export const songCredits = pgTable(
  "song_credits",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    role: creditRoleEnum("role").notNull().default("PRIMARY"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.songId, table.artistId, table.role] }),
    index("idx_song_credits_artist").on(table.artistId),
    index("idx_song_credits_song").on(table.songId),
  ]
);

export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;
export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type SongCredit = typeof songCredits.$inferSelect;
export type NewSongCredit = typeof songCredits.$inferInsert;

export const releasePresaves = pgTable(
  "release_presaves",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.albumId] }),
    index("idx_presaves_album").on(table.albumId),
    index("idx_presaves_user").on(table.userId),
  ]
);

export type ReleasePresave = typeof releasePresaves.$inferSelect;
export type NewReleasePresave = typeof releasePresaves.$inferInsert;
