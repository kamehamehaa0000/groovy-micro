import type { PlayerTrack } from '../types/player'
import type { SongCredit } from '../types/catalog'

/**
 * The shape every catalogue source can be mapped from: the recommendations
 * feed, search results, an album, an artist's discography, a playlist, the
 * personal vault.
 */
export interface PlayerTrackSource {
  id: string
  title: string
  artistId?: string | null
  artistName?: string | null
  artistSlug?: string | null
  albumId?: string | null
  albumTitle?: string | null
  albumSlug?: string | null
  coverImageUrl?: string | null
  durationSeconds?: number | null
  audioUrl?: string | null
  hlsManifestUrl?: string | null
  rawAudioKey?: string | null
  isExplicit?: boolean
  isLiked?: boolean
  scope?: 'GLOBAL' | 'PERSONAL'
  isStreamable?: boolean
  credits?: SongCredit[]
}

/**
 * One mapping from a catalogue row to a player track.
 *
 * The app had five copies of this, each with its own field names and its own
 * idea of what "missing" means. Because each copy built a fresh object on
 * every render, `memo(SongRow)` never actually held.
 */
export function toPlayerTrack(source: PlayerTrackSource): PlayerTrack {
  return {
    id: source.id,
    title: source.title,
    artistId: source.artistId ?? '',
    artistName: source.artistName ?? 'Unknown Artist',
    artistSlug: source.artistSlug ?? undefined,
    albumId: source.albumId ?? undefined,
    albumTitle: source.albumTitle ?? undefined,
    albumSlug: source.albumSlug ?? undefined,
    coverImageUrl: source.coverImageUrl ?? undefined,
    durationSeconds: source.durationSeconds ?? 0,
    audioUrl: source.audioUrl ?? undefined,
    hlsManifestUrl: source.hlsManifestUrl ?? undefined,
    rawAudioKey: source.rawAudioKey ?? undefined,
    isExplicit: source.isExplicit,
    isLiked: source.isLiked,
    scope: source.scope ?? 'GLOBAL',
    isStreamable: source.isStreamable,
    credits: source.credits,
  }
}
