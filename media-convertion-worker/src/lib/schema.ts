import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  real,
} from "drizzle-orm/pg-core";

export const songStatusEnum = pgEnum("song_status", [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
]);

export interface SongAudioAnalysis {
  durationSeconds: number;
  specs: {
    format: string;
    sampleRate: number;
    channels: number;
    bitDepth?: number;
    bitrateKbps?: number;
  };
  loudness?: {
    integratedLufs: number;
    truePeakDbfs: number;
    loudnessRangeLu: number;
  };
  waveform?: number[];
  musical?: {
    bpm?: number;
    key?: string;
  };
  energy?: number;
}

export const songs = pgTable("songs", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id").notNull(),
  albumId: uuid("album_id"),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull(),
  genre: varchar("genre", { length: 60 }),
  primaryGenre: varchar("primary_genre", { length: 60 }),
  subGenre: varchar("sub_genre", { length: 80 }),
  moods: jsonb("moods").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  bpm: integer("bpm"),
  musicalKey: varchar("musical_key", { length: 20 }),
  energy: real("energy"),
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
  audioAnalysis: jsonb("audio_analysis").$type<SongAudioAnalysis>(),

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
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  retryCount: integer("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
});
