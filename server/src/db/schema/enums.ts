import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "LISTENER",
  "ARTIST",
  "ADMIN",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
]);

export const albumTypeEnum = pgEnum("album_type", [
  "ALBUM",
  "SINGLE",
  "EP",
]);

export const songStatusEnum = pgEnum("song_status", [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
]);
