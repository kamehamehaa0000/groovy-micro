import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { songs, albums } from "./catalog";
import { releaseVisibilityEnum } from "./enums";

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 150 }).notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    visibility: releaseVisibilityEnum("visibility").notNull().default("PUBLIC"),
    isPublic: boolean("is_public").notNull().default(true),
    isCollaborative: boolean("is_collaborative").notNull().default(false),
    shareToken: varchar("share_token", { length: 64 }),
    collaborationToken: varchar("collaboration_token", { length: 64 }),
    allowDuplicates: boolean("allow_duplicates").notNull().default(false),
    allowComments: boolean("allow_comments").notNull().default(true),
    savesCount: integer("saves_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_playlists_owner").on(table.ownerId),
    index("idx_playlists_visibility").on(table.visibility),
  ]
);

export const playlistSongs = pgTable(
  "playlist_songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_playlist_songs_lookup").on(table.playlistId, table.songId),
    index("idx_playlist_songs_order").on(table.playlistId, table.position),
  ]
);

export const playlistCollaborators = pgTable(
  "playlist_collaborators",
  {
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.playlistId, table.userId] }),
    index("idx_playlist_collab_user").on(table.userId),
  ]
);

export const userLibraryAlbums = pgTable(
  "user_library_albums",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.albumId] }),
  ]
);

export const userLibraryPlaylists = pgTable(
  "user_library_playlists",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.playlistId] }),
    index("idx_user_library_playlists_user").on(table.userId),
  ]
);

export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type NewPlaylistSong = typeof playlistSongs.$inferInsert;
export type PlaylistCollaborator = typeof playlistCollaborators.$inferSelect;
export type NewPlaylistCollaborator = typeof playlistCollaborators.$inferInsert;
export type UserLibraryPlaylist = typeof userLibraryPlaylists.$inferSelect;
export type NewUserLibraryPlaylist = typeof userLibraryPlaylists.$inferInsert;
