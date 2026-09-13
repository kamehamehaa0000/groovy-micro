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
  "MIXTAPE",
  "LP",
]);

export const songStatusEnum = pgEnum("song_status", [
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
]);

export const creditRoleEnum = pgEnum("credit_role", [
  "PRIMARY",
  "FEATURED",
  "PRODUCER",
  "COMPOSER",
  "LYRICIST",
  "ENGINEER",
  "MIX_AND_MASTER",
  "OTHER",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
]);

export const releaseVisibilityEnum = pgEnum("release_visibility", [
  "PUBLIC",
  "UNLISTED",
  "PRIVATE",
]);

export const followStatusEnum = pgEnum("follow_status", [
  "PENDING",
  "ACCEPTED",
]);

export const listeningActivityPrivacyEnum = pgEnum("listening_activity_privacy", [
  "FRIENDS_ONLY",
  "FOLLOWERS",
  "OFF",
]);

export const libraryPrivacyEnum = pgEnum("library_privacy", [
  "PUBLIC",
  "FOLLOWERS_ONLY",
  "PRIVATE",
]);
