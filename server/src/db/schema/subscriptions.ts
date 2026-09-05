import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { subscriptionStatusEnum } from "./enums";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  interval: varchar("interval", { length: 20 }).notNull().default("month"),
  features: jsonb("features")
    .notNull()
    .default({
      max_bitrate_kbps: 128,
      lossless: false,
      ad_free: false,
      can_host_jam: false,
      max_jam_participants: 3,
    }),
  isActive: boolean("is_active").notNull().default(true),
});

export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 50 })
      .notNull()
      .references(() => subscriptionPlans.id),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    externalCustomerId: varchar("external_customer_id", { length: 255 }),
    externalSubscriptionId: varchar("external_subscription_id", {
      length: 255,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_user_subscriptions_user").on(table.userId),
  ]
);

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;
