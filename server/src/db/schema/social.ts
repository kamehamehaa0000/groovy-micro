import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  primaryKey,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { songs, albums } from "./catalog";

export const songLikes = pgTable(
  "song_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.songId] }),
    index("idx_song_likes_user").on(table.userId),
  ]
);

export const albumLikes = pgTable(
  "album_likes",
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
    index("idx_album_likes_user").on(table.userId),
  ]
);

export type SongLike = typeof songLikes.$inferSelect;
export type AlbumLike = typeof albumLikes.$inferSelect;
