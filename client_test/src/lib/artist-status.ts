import type { ArtistProfile } from "../types/artist";
import type { UserProfile } from "../types/auth";

type ArtistAccountUser =
  | (Pick<UserProfile, "role"> & Pick<UserProfile, "artistProfile">)
  | null
  | undefined;

/**
 * Whether the account owns an artist identity.
 *
 * Two sources answer the same question: the full profile fetched from the
 * artist API and the lightweight pointer bundled with `/auth/me`. Either one
 * is enough, so a page that has only one of them still gets the right answer.
 */
export function hasArtistProfile(
  user: ArtistAccountUser,
  artistProfile?: ArtistProfile | null,
): boolean {
  return Boolean(artistProfile || user?.artistProfile);
}

/**
 * Whether an account should be treated as an artist.
 *
 * Owning an artist profile is the source of truth. `role === 'ARTIST'` is kept
 * as a fallback for a promotion that has not been reflected in the profile
 * probe yet (and for the inconsistent state where the role says artist but the
 * profile still has to be created). `ADMIN` alone is deliberately not enough:
 * admin is a privilege, not an artist identity.
 */
export function isArtistAccount(
  user: ArtistAccountUser,
  artistProfile?: ArtistProfile | null,
): boolean {
  if (!user) return false;
  return user.role === "ARTIST" || hasArtistProfile(user, artistProfile);
}
