import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  primaryKey,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { songs, albums } from "./catalog";
import { playlists } from "./playlists";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Mutually exclusive target entity
    songId: uuid("song_id").references(() => songs.id, {
      onDelete: "cascade",
    }),
    albumId: uuid("album_id").references(() => albums.id, {
      onDelete: "cascade",
    }),
    playlistId: uuid("playlist_id").references(() => playlists.id, {
      onDelete: "cascade",
    }),

    // 2-Level Threading Hierarchy
    // parentId === null -> Root Comment
    // parentId !== null -> Reply (strictly attached to the root comment)
    parentId: uuid("parent_id").references((): any => comments.id, {
      onDelete: "cascade",
    }),
    // If replying to a reply within the 2-level thread, store who was quoted
    replyToUserId: uuid("reply_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Audio timestamp in seconds (optional, e.g. 102 = 1:42)
    timestampSeconds: integer("timestamp_seconds"),

    content: text("content").notNull(),

    // Aggregate counters
    likesCount: integer("likes_count").notNull().default(0),
    dislikesCount: integer("dislikes_count").notNull().default(0),
    repliesCount: integer("replies_count").notNull().default(0),

    // Status flags
    isEdited: boolean("is_edited").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_comments_song").on(table.songId),
    index("idx_comments_album").on(table.albumId),
    index("idx_comments_playlist").on(table.playlistId),
    index("idx_comments_parent").on(table.parentId),
    index("idx_comments_user").on(table.userId),
    index("idx_comments_created").on(table.createdAt),
    index("idx_comments_likes").on(table.likesCount),
    index("idx_comments_song_root")
      .on(table.songId, table.isPinned, table.likesCount)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    index("idx_comments_album_root")
      .on(table.albumId, table.isPinned, table.likesCount)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    index("idx_comments_playlist_root")
      .on(table.playlistId, table.isPinned, table.likesCount)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    check(
      "chk_comments_single_target",
      sql`num_nonnulls(${table.songId}, ${table.albumId}, ${table.playlistId}) = 1`
    ),
  ]
);

export const commentVotes = pgTable(
  "comment_votes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    vote: smallint("vote").notNull(), // +1 for like, -1 for dislike
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.commentId] }),
    index("idx_comment_votes_comment").on(table.commentId),
    index("idx_comment_votes_user").on(table.userId),
  ]
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentVote = typeof commentVotes.$inferSelect;
export type NewCommentVote = typeof commentVotes.$inferInsert;
