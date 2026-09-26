import type { PlayerTrack } from "../types/player";

export interface ParsedTrackArtist {
  name: string;
  id?: string;
  slug?: string;
  role: string;
  verified?: boolean;
}

export interface ParsedTrackCredits {
  primary: ParsedTrackArtist;
  collaborators: ParsedTrackArtist[];
  all: ParsedTrackArtist[];
  producers: ParsedTrackArtist[];
  writers: ParsedTrackArtist[];
}

export function slugifyArtistName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_EMPTY_CREDITS: ParsedTrackCredits = {
  primary: { name: "", role: "Primary Artist" },
  collaborators: [],
  all: [],
  producers: [],
  writers: [],
};

/**
 * Robust utility to parse both primary artists, collaborating/featured artists,
 * and production/writing credits from structured SongCredit[] or artistName strings.
 */
export function parseTrackArtistsAndCredits(
  track: PlayerTrack | null | undefined
): ParsedTrackCredits {
  if (!track) return DEFAULT_EMPTY_CREDITS;
  const primaryArtistId = track.artistId;
  const primaryArtistSlug = track.artistSlug;
  const rawName = track.artistName || "Unknown Artist";

  // Case 1: Structured credits are present
  if (track.credits && track.credits.length > 0) {
    const primaryCredit = track.credits.find((c) => c.role === "PRIMARY");
    const featuredCredits = track.credits.filter(
      (c) => c.role === "FEATURED" || (c.role === "PRIMARY" && c.artistId !== primaryArtistId)
    );
    const producerCredits = track.credits.filter((c) =>
      ["PRODUCER", "MIX_AND_MASTER", "ENGINEER"].includes(c.role)
    );
    const writerCredits = track.credits.filter((c) =>
      ["LYRICIST", "COMPOSER"].includes(c.role)
    );

    const primaryStageName = primaryCredit?.stageName || rawName;
    const primary: ParsedTrackArtist = {
      name: primaryStageName,
      id: primaryCredit?.artistId || primaryArtistId,
      slug: primaryCredit?.slug || primaryArtistSlug || slugifyArtistName(primaryStageName),
      role: "Primary Artist",
      verified: primaryCredit?.verified,
    };

    const collaborators: ParsedTrackArtist[] = featuredCredits
      .filter((c) => c.artistId !== primary.id)
      .map((c) => ({
        name: c.stageName,
        id: c.artistId,
        slug: c.slug || slugifyArtistName(c.stageName),
        role: c.role === "FEATURED" ? "Featured Artist" : c.role.replace(/_/g, " "),
        verified: c.verified,
      }));

    const producers: ParsedTrackArtist[] = producerCredits.map((c) => ({
      name: c.stageName,
      id: c.artistId,
      slug: c.slug || slugifyArtistName(c.stageName),
      role: c.role.replace(/_/g, " "),
      verified: c.verified,
    }));

    const writers: ParsedTrackArtist[] = writerCredits.map((c) => ({
      name: c.stageName,
      id: c.artistId,
      slug: c.slug || slugifyArtistName(c.stageName),
      role: c.role.replace(/_/g, " "),
      verified: c.verified,
    }));

    return {
      primary,
      collaborators,
      all: [primary, ...collaborators],
      producers,
      writers,
    };
  }

  // Case 2: String parsing fallback for "feat.", "ft.", "&", ","
  let primaryName = rawName;
  const collabNames: string[] = [];

  const featMatch = rawName.match(/^(.*?)\s+(?:feat\.?|ft\.?)\s+(.*)$/i);
  if (featMatch) {
    primaryName = featMatch[1].trim();
    const featPart = featMatch[2].trim();
    const splits = featPart.split(/[,&]/).map((s) => s.trim()).filter(Boolean);
    collabNames.push(...splits);
  } else if (rawName.includes(",") || rawName.includes(" & ")) {
    const parts = rawName.split(/[,&]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      primaryName = parts[0];
      collabNames.push(...parts.slice(1));
    }
  }

  const primary: ParsedTrackArtist = {
    name: primaryName,
    id: primaryArtistId,
    slug: primaryArtistSlug || slugifyArtistName(primaryName),
    role: "Primary Artist",
  };

  const collaborators: ParsedTrackArtist[] = collabNames.map((name) => ({
    name,
    slug: slugifyArtistName(name),
    role: "Featured Artist",
  }));

  return {
    primary,
    collaborators,
    all: [primary, ...collaborators],
    producers: [],
    writers: [],
  };
}
