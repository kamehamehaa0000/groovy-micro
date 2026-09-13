import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import {
  userRoleEnum,
  listeningActivityPrivacyEnum,
  libraryPrivacyEnum,
} from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("LISTENER"),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isPrivateAccount: boolean("is_private_account").notNull().default(false),
    listeningActivityPrivacy: listeningActivityPrivacyEnum(
      "listening_activity_privacy"
    )
      .notNull()
      .default("FRIENDS_ONLY"),
    libraryPrivacy: libraryPrivacyEnum("library_privacy")
      .notNull()
      .default("PUBLIC"),
    tokenVersion: integer("token_version").notNull().default(0),
    googleId: varchar("google_id", { length: 255 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    index("idx_users_google_id").on(table.googleId),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
