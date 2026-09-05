import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  integer,
  text,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const outboxEvents = pgTable(
  "outbox_events",
  {
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
  },
  (table) => [
    index("idx_outbox_pending")
      .on(table.createdAt)
      .where(sql`${table.publishedAt} IS NULL`),
  ]
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
