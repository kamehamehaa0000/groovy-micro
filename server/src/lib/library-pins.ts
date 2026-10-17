import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { userLibraryPins } from "../db/schema";

export type LibraryPinItemType =
  | "LIKED_SONGS"
  | "PERSONAL_COLLECTION"
  | "PLAYLIST"
  | "ALBUM"
  | "ARTIST";

/**
 * Drops a single user's pin for an item.
 *
 * Call this whenever that user can no longer reach the item — an unsaved
 * playlist, an unliked album, an unfollowed artist. Otherwise the orphaned row
 * silently counts against the pin limit. Idempotent: a no-op when unpinned.
 */
export async function removePinForUser(
  userId: string,
  itemType: LibraryPinItemType,
  itemId: string
): Promise<void> {
  await db
    .delete(userLibraryPins)
    .where(
      and(
        eq(userLibraryPins.userId, userId),
        eq(userLibraryPins.itemType, itemType),
        eq(userLibraryPins.itemId, itemId)
      )
    );
}

/**
 * Drops every pin pointing at an item across all users.
 *
 * Call this when the item itself is deleted, so no user is left holding a pin
 * to something unreachable. Idempotent.
 */
export async function removePinsForItem(
  itemType: LibraryPinItemType,
  itemId: string
): Promise<void> {
  await db
    .delete(userLibraryPins)
    .where(
      and(
        eq(userLibraryPins.itemType, itemType),
        eq(userLibraryPins.itemId, itemId)
      )
    );
}
