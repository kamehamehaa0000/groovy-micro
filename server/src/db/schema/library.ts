import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const userLibraryPins = pgTable(
  "user_library_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemType: varchar("item_type", { length: 32 }).notNull(), // 'LIKED_SONGS' | 'PERSONAL_COLLECTION' | 'PLAYLIST' | 'ALBUM' | 'ARTIST'
    itemId: varchar("item_id", { length: 64 }).notNull(),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_pins_unique").on(table.userId, table.itemType, table.itemId),
    index("idx_user_pins_user").on(table.userId, table.pinnedAt),
  ]
);

export type UserLibraryPin = typeof userLibraryPins.$inferSelect;
export type NewUserLibraryPin = typeof userLibraryPins.$inferInsert;
