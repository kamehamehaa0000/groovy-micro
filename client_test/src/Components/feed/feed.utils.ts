import type { FriendActivityItem } from '../../lib/player.api'
import type { FeedItem, FeedItemType, FeedTarget } from '../../lib/social.api'
import type { PlayerTrack } from '../../types/player'

export const FEED_ACTION_LABEL: Record<FeedItemType, string> = {
  NEW_RELEASE: 'released new music',
  PLAYLIST_CREATED: 'created a playlist',
  PLAYLIST_SAVED: 'saved a playlist',
  SONG_LIKED: 'liked a song',
}

const TARGET_KIND: Record<FeedTarget['type'], string> = {
  album: 'Album',
  playlist: 'Playlist',
  song: 'Song',
}

/**
 * Backend subtitles read `KIND · detail` (e.g. `EP · Nia Archives`). Split them
 * so the card can show the kind as a label and the detail as secondary text.
 */
const KIND_ALIASES: Record<string, string> = {
  album: 'Album',
  single: 'Single',
  ep: 'EP',
  mixtape: 'Mixtape',
  lp: 'LP',
  playlist: 'Playlist',
  track: 'Song',
  song: 'Song',
}

export function targetMeta(target: FeedTarget): {
  kind: string
  detail: string
} {
  const subtitle = target.subtitle?.trim()
  if (!subtitle) {
    return { kind: TARGET_KIND[target.type], detail: '' }
  }

  const separator = subtitle.indexOf(' · ')
  if (separator === -1) {
    return { kind: TARGET_KIND[target.type], detail: subtitle }
  }

  const first = subtitle.slice(0, separator)
  const detail = subtitle.slice(separator + 3)
  const kind = KIND_ALIASES[first.trim().toLowerCase()]

  return kind
    ? { kind, detail }
    : { kind: TARGET_KIND[target.type], detail: subtitle }
}

/** Compact relative time: `now`, `12m`, `5h`, `3d`, then a calendar date. */
export function formatRelativeTime(value: string | number): string {
  const timestamp =
    typeof value === 'number' ? value : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return 'now'

  const minutes = Math.floor(diffSeconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`

  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** `m:ss` for live progress. */
export function formatElapsed(progressMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(progressMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Local calendar key (`YYYY-MM-DD`) used to group the timeline by day. */
export function dayKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function dayLabel(key: string): string {
  if (key === 'unknown') return 'Earlier'

  const date = new Date(`${key}T12:00:00`)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(yesterday)) return 'Yesterday'

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear()
      ? {}
      : { year: 'numeric' }),
  })
}

/** A feed song is playable only when the API supplied an audio URL. */
export function feedItemToTrack(item: FeedItem): PlayerTrack | null {
  const target = item.target
  if (target.type !== 'song' || !target.audioUrl) return null

  return {
    id: target.id,
    title: target.title,
    artistId: item.actor.id,
    artistName: item.actor.name,
    artistSlug: item.actor.slug || undefined,
    albumId: null,
    albumTitle: null,
    coverImageUrl: target.coverImageUrl,
    durationSeconds: target.durationSeconds ?? 0,
    audioUrl: target.audioUrl,
    isExplicit: target.isExplicit ?? false,
  }
}

export function liveItemToTrack(item: FriendActivityItem): PlayerTrack {
  return {
    id: item.activity.songId,
    title: item.activity.trackTitle,
    artistId: '',
    artistName: item.activity.artistName,
    coverImageUrl: item.activity.coverImageUrl,
    durationSeconds: Math.floor((item.activity.durationMs ?? 0) / 1000),
  }
}
