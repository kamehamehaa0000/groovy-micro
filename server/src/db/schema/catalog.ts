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
import { albumTypeEnum, songStatusEnum, creditRoleEnum } from "./enums";

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
    releaseDate: date("release_date").notNull(),
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
