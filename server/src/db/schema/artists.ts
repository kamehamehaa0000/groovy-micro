import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const artistProfiles = pgTable(
  "artist_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    stageName: varchar("stage_name", { length: 150 }).notNull(),
    bio: text("bio"),
    bannerUrl: text("banner_url"),
    verified: boolean("verified").notNull().default(false),
    monthlyListeners: integer("monthly_listeners").notNull().default(0),
    socialLinks: jsonb("social_links").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_artists_stage_name").on(table.stageName),
  ]
);

export const artistFollowers = pgTable(
  "artist_followers",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artistProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.artistId] }),
    index("idx_artist_followers_artist").on(table.artistId),
  ]
);

export type ArtistProfile = typeof artistProfiles.$inferSelect;
export type NewArtistProfile = typeof artistProfiles.$inferInsert;
export type ArtistFollower = typeof artistFollowers.$inferSelect;
