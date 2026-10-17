import { client, db } from "../src/db";
import { users, artistProfiles } from "../src/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * One-time repair for the denormalized users.role column.
 *
 * Owning an artist profile is what makes an account an artist, and the column already
 * agrees by construction: createArtistProfile writes it in the same transaction as the
 * profile insert, authorization resolves the profile directly (see resolveUserRole),
 * and a profile owner is reported as ARTIST by GET /auth/me either way. This is only a
 * safety net for rows that predate that guarantee or were edited by hand, so the
 * column stops disagreeing with the facts in listings.
 *
 * Idempotent: a second run has nothing left to promote. Exported so the studio drift
 * test can assert both the promotion and that it leaves nothing behind.
 */
export async function backfillArtistRoles() {
  const profileOwners = db
    .select({ userId: artistProfiles.userId })
    .from(artistProfiles)
    .where(isNotNull(artistProfiles.userId));

  const promoted = await db
    .update(users)
    .set({ role: "ARTIST", updatedAt: new Date() })
    .where(and(eq(users.role, "LISTENER"), inArray(users.id, profileOwners)))
    .returning({ id: users.id, email: users.email });

  return promoted;
}

if (import.meta.main) {
  console.log("Checking for artist accounts whose role column lags behind...\n");

  try {
    const promoted = await backfillArtistRoles();

    if (promoted.length === 0) {
      console.log(
        "✅ Nothing to do: every profile owner already carries the ARTIST role."
      );
    } else {
      console.log(`Promoted ${promoted.length} account(s) to ARTIST:`);
      for (const row of promoted) {
        console.log(`  - ${row.email} (${row.id})`);
      }
    }
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
