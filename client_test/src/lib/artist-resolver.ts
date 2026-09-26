import { useState, useEffect } from "react";
import { artistsApi } from "./artists.api";
import { storageApi } from "./storage.api";
import { catalogApi } from "./catalog.api";
import { usePlayerStore } from "../stores/player.store";
import type { PlayerTrack } from "../types/player";
import type { SongCredit } from "../types/catalog";
import type { ArtistProfile } from "../types/artist";
import {
  parseTrackArtistsAndCredits,
  slugifyArtistName,
  type ParsedTrackArtist,
  type ParsedTrackCredits,
} from "./artist-credits";

export interface CachedArtistRecord {
  id: string;
  slug: string;
  stageName: string;
  verified?: boolean;
  scope?: "GLOBAL" | "PERSONAL";
}

const STORAGE_CACHE_KEY = "groovy:artist_slugs_cache:v1";

// In-memory cache structures
const artistByNameCache = new Map<string, CachedArtistRecord>();
const songCreditsCache = new Map<string, SongCredit[]>();

// Hydrate cache from sessionStorage on client startup
if (typeof window !== "undefined") {
  try {
    const raw = sessionStorage.getItem(STORAGE_CACHE_KEY);
    if (raw) {
      const items: CachedArtistRecord[] = JSON.parse(raw);
      for (const item of items) {
        if (item.stageName && item.slug) {
          artistByNameCache.set(item.stageName.toLowerCase().trim(), item);
          artistByNameCache.set(item.slug.toLowerCase().trim(), item);
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }
}

function persistCacheToSession() {
  if (typeof window === "undefined") return;
  try {
    const uniqueRecords = Array.from(new Set(artistByNameCache.values()));
    // Keep max 500 entries to prevent session bloat
    const trimmed = uniqueRecords.slice(-500);
    sessionStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage quota fallback
  }
}

/**
 * Seeds the artist cache with known artist records (e.g. from personal collection or catalog).
 */
export function seedArtistCache(
  records: Array<{
    id?: string;
    slug?: string;
    stageName?: string;
    verified?: boolean;
    scope?: "GLOBAL" | "PERSONAL";
  }>
) {
  let modified = false;
  for (const r of records) {
    if (!r.stageName || !r.slug) continue;
    const cleanName = r.stageName.toLowerCase().trim();
    const entry: CachedArtistRecord = {
      id: r.id || "",
      slug: r.slug,
      stageName: r.stageName,
      verified: r.verified,
      scope: r.scope,
    };
    artistByNameCache.set(cleanName, entry);
    artistByNameCache.set(r.slug.toLowerCase().trim(), entry);
    modified = true;
  }
  if (modified) {
    persistCacheToSession();
  }
}

/**
 * Synchronously checks if an artist's exact server slug is already cached.
 */
export function getCachedArtist(nameOrSlug: string): CachedArtistRecord | null {
  if (!nameOrSlug) return null;
  const key = nameOrSlug.toLowerCase().trim();
  return artistByNameCache.get(key) || null;
}

/**
 * Resolves an artist's actual server slug by querying the server with intelligent caching.
 * Prioritizes personal collection scoped slugs if owned by the user, then canonical global artists.
 */
export async function resolveArtistByName(
  artistName: string
): Promise<CachedArtistRecord | null> {
  if (!artistName || !artistName.trim()) return null;
  const normalized = artistName.toLowerCase().trim();

  // 1. Check in-memory / session cache
  const cached = artistByNameCache.get(normalized);
  if (cached && cached.slug) {
    return cached;
  }

  try {
    // 2. Query artists roster across all scopes (GLOBAL and PERSONAL)
    const searchRes = await artistsApi
      .searchArtists({
        search: artistName,
        scope: "ALL",
        limit: 10,
      })
      .catch(() => null);

    if (searchRes?.data && searchRes.data.length > 0) {
      // Find exact case-insensitive match first (prefer PERSONAL if present, else first exact match)
      const exactMatches = searchRes.data.filter(
        (a: ArtistProfile) => a.stageName.toLowerCase().trim() === normalized
      );

      const bestMatch =
        exactMatches.find((a: ArtistProfile) => a.scope === "PERSONAL") ||
        exactMatches[0] ||
        searchRes.data.find((a: ArtistProfile) =>
          a.stageName.toLowerCase().includes(normalized)
        );

      if (bestMatch && bestMatch.slug) {
        const record: CachedArtistRecord = {
          id: bestMatch.id,
          slug: bestMatch.slug,
          stageName: bestMatch.stageName,
          verified: bestMatch.verified,
          scope: bestMatch.scope,
        };
        artistByNameCache.set(normalized, record);
        artistByNameCache.set(bestMatch.slug.toLowerCase().trim(), record);
        persistCacheToSession();
        return record;
      }
    }

    // 3. Fallback check against personal artists if search didn't index private artist
    const personalRes = await storageApi.getPersonalArtists().catch(() => null);
    if (personalRes?.artists && personalRes.artists.length > 0) {
      const match = personalRes.artists.find(
        (pa) => pa.stageName.toLowerCase().trim() === normalized
      );
      if (match && match.slug) {
        const record: CachedArtistRecord = {
          id: match.id,
          slug: match.slug,
          stageName: match.stageName,
          verified: false,
          scope: "PERSONAL",
        };
        artistByNameCache.set(normalized, record);
        artistByNameCache.set(match.slug.toLowerCase().trim(), record);
        persistCacheToSession();
        return record;
      }
    }
  } catch (err) {
    console.warn("[ArtistResolver] Failed to resolve artist from server:", err);
  }

  return null;
}

/**
 * Resolves song credits directly from the server if not already embedded in PlayerTrack.
 * Caches credits and updates the player store so the UI is immediately enriched with real slugs.
 */
export async function resolveSongCredits(
  track: PlayerTrack
): Promise<SongCredit[] | null> {
  if (!track || !track.id) return null;

  // If track already has structured credits from server, cache and return them
  if (track.credits && track.credits.length > 0) {
    songCreditsCache.set(track.id, track.credits);
    seedArtistCache(track.credits);
    return track.credits;
  }

  // Check cache
  if (songCreditsCache.has(track.id)) {
    const cached = songCreditsCache.get(track.id)!;
    return cached;
  }

  try {
    const song = await catalogApi.getSong(track.id).catch(() => null);
    if (song?.credits && song.credits.length > 0) {
      songCreditsCache.set(track.id, song.credits);
      seedArtistCache(song.credits);

      // Enforce update in player store if currently playing
      const current = usePlayerStore.getState().currentTrack;
      if (current && current.id === track.id) {
        usePlayerStore.getState().updateTrackCredits(track.id, song.credits);
      }
      return song.credits;
    }
  } catch {
    // Ignore fetch errors
  }

  return null;
}

/**
 * React hook that provides fully parsed and server-resolved credits for the current track.
 * Automatically resolves any missing collaborator slugs in the background and populates the cache.
 */
export function useResolvedTrackCredits(track: PlayerTrack | null): ParsedTrackCredits {
  const initial = parseTrackArtistsAndCredits(track);
  const [credits, setCredits] = useState<ParsedTrackCredits>(initial);

  useEffect(() => {
    const parsed = parseTrackArtistsAndCredits(track);
    setCredits(parsed);

    if (!track) return;

    let isCancelled = false;

    // 1. If track is missing server credits, resolve song credits from server
    if (!track.credits || track.credits.length === 0) {
      resolveSongCredits(track).then((serverCredits) => {
        if (!isCancelled && serverCredits && serverCredits.length > 0) {
          const recomputed = parseTrackArtistsAndCredits({
            ...track,
            credits: serverCredits,
          });
          setCredits(recomputed);
        }
      });
    }

    // 2. For any collaborating artist, ensure their real server slug is resolved & cached
    const pendingCollabs = parsed.collaborators.filter(
      (c) => !c.id || !artistByNameCache.has(c.name.toLowerCase().trim())
    );

    if (pendingCollabs.length > 0) {
      Promise.all(
        pendingCollabs.map((collab) =>
          resolveArtistByName(collab.name).then((resolved) => ({
            name: collab.name,
            resolved,
          }))
        )
      ).then((results) => {
        if (isCancelled) return;
        let hasUpdates = false;
        const updatedCollabs = parsed.collaborators.map((c) => {
          const match = results.find((r) => r.name === c.name);
          if (match?.resolved?.slug && match.resolved.slug !== c.slug) {
            hasUpdates = true;
            return {
              ...c,
              id: match.resolved.id || c.id,
              slug: match.resolved.slug,
              verified: match.resolved.verified ?? c.verified,
            };
          }
          return c;
        });

        if (hasUpdates) {
          setCredits({
            ...parsed,
            collaborators: updatedCollabs,
            all: [parsed.primary, ...updatedCollabs],
          });
        }
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [track?.id, track?.artistName, track?.credits?.length]);

  return credits;
}

/**
 * Reusable, safe navigation helper to an artist profile.
 * Guarantees that the slug used is the verified server slug (e.g. scoped personal slug).
 */
export async function navigateToArtist(
  artist: ParsedTrackArtist | { name: string; slug?: string; id?: string },
  navigate: (opts: any) => void,
  onBeforeNavigate?: () => void
): Promise<void> {
  if (!artist || !artist.name) return;

  const normalized = artist.name.toLowerCase().trim();
  const cached = artistByNameCache.get(normalized);

  // 1. Check cached record or explicitly provided id/slug
  let target = cached?.slug || cached?.id || artist.slug || artist.id;

  // 2. If no verified target or artist needs resolution (e.g. from string fallback)
  if (!target || (!artist.id && !cached)) {
    const resolved = await resolveArtistByName(artist.name);
    if (resolved?.slug || resolved?.id) {
      target = resolved.slug || resolved.id;
    }
  }

  // 3. Fallback to slugified name if server search returned nothing
  if (!target && artist.name) {
    target = slugifyArtistName(artist.name);
  }

  if (target) {
    if (onBeforeNavigate) {
      onBeforeNavigate();
    }
    navigate({
      to: "/artists/$idOrSlug",
      params: { idOrSlug: target },
    });
  }
}

/**
 * Reusable navigation helper to an album/release page.
 * Safely resolves album ID or slug from track or server catalog if needed.
 */
export async function navigateToRelease(
  track: PlayerTrack | null | undefined,
  navigate: (opts: any) => void,
  onBeforeNavigate?: () => void
): Promise<void> {
  if (!track) return;

  let target = track.albumSlug || track.albumId;

  // If missing album information, query song details from catalog
  if (!target && track.id) {
    try {
      const song = await catalogApi.getSong(track.id).catch(() => null);
      if (song && (song.albumSlug || song.albumId)) {
        target = song.albumSlug || song.albumId;
      }
    } catch {
      // Ignore fetch errors
    }
  }

  if (target) {
    if (onBeforeNavigate) {
      onBeforeNavigate();
    }
    navigate({
      to: "/albums/$idOrSlug",
      params: { idOrSlug: target },
    });
  }
}
