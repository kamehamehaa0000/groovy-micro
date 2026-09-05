import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { songs } from "./catalog";

export const listeningHistory = pgTable(
  "listening_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    durationListenedSeconds: integer("duration_listened_seconds").notNull(),
    completed: boolean("completed").notNull().default(false),
    playedAt: timestamp("played_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_history_user_recent").on(table.userId, table.playedAt),
  ]
);

export type ListeningHistory = typeof listeningHistory.$inferSelect;
export type NewListeningHistory = typeof listeningHistory.$inferInsert;
