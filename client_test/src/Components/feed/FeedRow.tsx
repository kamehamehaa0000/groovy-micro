import { memo, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { Avatar } from '../../Components/ui'
import { MusicIconSVG, PauseIconSVG, PlayIconSVG } from '../Icons'
import {
  FEED_ACTION_LABEL,
  feedItemToTrack,
  formatRelativeTime,
  targetMeta,
} from './feed.utils'
import type { FeedItem, FeedTarget } from '../../lib/social.api'

function QueueIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h11M4 12h11M4 17h7" />
      <path d="M18 8v8M14 12h8" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function ChevronIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function TargetArtwork({ target }: { target: FeedTarget }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-control border border-border/70 bg-muted">
      {target.coverImageUrl ? (
        <img
          src={target.coverImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <MusicIconSVG className="h-5 w-5" />
        </div>
      )}
    </div>
  )
}

function TargetText({ target }: { target: FeedTarget }) {
  const { kind, detail } = targetMeta(target)

  return (
    <div className="min-w-0 flex-1">
      <p className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
        {kind}
      </p>
      <p
        className="mt-0.5 truncate text-body font-semibold text-foreground"
        title={target.title}
      >
        {target.title}
      </p>
      {detail ? (
        <p className="mt-0.5 truncate text-caption text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

const TILE =
  'flex items-center gap-3 rounded-inset border border-border bg-card p-2 transition-colors'
const LINK_TILE = `${TILE} hover:border-foreground/20 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`

function PlayControl({
  playing,
  paused,
  onPlay,
}: {
  playing: boolean
  paused: boolean
  onPlay: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={playing ? 'Pause' : paused ? 'Resume' : 'Play'}
      title={playing ? 'Pause' : 'Play'}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-8 sm:w-8 sm:after:hidden"
    >
      {playing ? (
        <PauseIconSVG className="h-3.5 w-3.5" />
      ) : (
        <PlayIconSVG className="ml-0.5 h-3.5 w-3.5" />
      )}
    </button>
  )
}

export const FeedRow = memo(function FeedRow({ item }: { item: FeedItem }) {
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const addToQueue = usePlayerStore((s) => s.addToQueue)

  const [queued, setQueued] = useState(false)
  const queueTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (queueTimer.current !== null) window.clearTimeout(queueTimer.current)
    }
  }, [])

  const track = feedItemToTrack(item)
  const isCurrent = Boolean(track && currentTrackId === track.id)
  const isPlaying = isCurrent && playbackStatus === 'playing'
  const isPaused = isCurrent && playbackStatus === 'paused'

  const actorLink =
    item.actor.isArtist && item.actor.slug ? (
      <Link
        to="/artists/$idOrSlug"
        params={{ idOrSlug: item.actor.slug }}
        className="text-body font-semibold text-foreground hover:underline"
      >
        {item.actor.name}
      </Link>
    ) : (
      <Link
        to="/users/$id"
        params={{ id: item.actor.id }}
        className="text-body font-semibold text-foreground hover:underline"
      >
        {item.actor.name}
      </Link>
    )

  const handlePlay = () => {
    if (!track) return
    if (isCurrent) {
      togglePlay()
      return
    }
    playTrack(track, [track], 0, `feed:${item.id}`, 'Feed')
  }

  const handleAddToQueue = () => {
    if (!track) return
    addToQueue(track)
    setQueued(true)
    if (queueTimer.current !== null) window.clearTimeout(queueTimer.current)
    queueTimer.current = window.setTimeout(() => {
      setQueued(false)
      queueTimer.current = null
    }, 2000)
  }

  return (
    <article className="flex gap-3 py-3.5">
      {item.actor.isArtist && item.actor.slug ? (
        <Link
          to="/artists/$idOrSlug"
          params={{ idOrSlug: item.actor.slug }}
          className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Avatar src={item.actor.avatarUrl} name={item.actor.name} size="sm" />
        </Link>
      ) : (
        <Link
          to="/users/$id"
          params={{ id: item.actor.id }}
          className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Avatar src={item.actor.avatarUrl} name={item.actor.name} size="sm" />
        </Link>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-caption leading-5 text-muted-foreground">
            {actorLink} <span>{FEED_ACTION_LABEL[item.type]}</span>
          </p>
          <time
            dateTime={item.timestamp}
            className="shrink-0 font-mono text-eyebrow text-muted-foreground"
            title={new Date(item.timestamp).toLocaleString()}
          >
            {formatRelativeTime(item.timestamp)}
          </time>
        </div>

        <div className="mt-2">
          {item.target.type === 'album' && item.target.slug ? (
            <Link
              to="/albums/$idOrSlug"
              params={{ idOrSlug: item.target.slug }}
              className={LINK_TILE}
            >
              <TargetArtwork target={item.target} />
              <TargetText target={item.target} />
              <ChevronIcon className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : item.target.type === 'playlist' ? (
            <Link
              to="/playlists/$id"
              params={{ id: item.target.id }}
              className={LINK_TILE}
            >
              <TargetArtwork target={item.target} />
              <TargetText target={item.target} />
              <ChevronIcon className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <div className={TILE}>
              <TargetArtwork target={item.target} />
              <TargetText target={item.target} />
              {track ? (
                <div className="flex shrink-0 items-center gap-2 sm:gap-1">
                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    aria-label={queued ? 'Added to queue' : 'Add to queue'}
                    title={queued ? 'Added to queue' : 'Add to queue'}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-8 sm:w-8 sm:after:hidden ${
                      queued
                        ? 'bg-success-soft text-success'
                        : 'text-muted-foreground/70 hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {queued ? (
                      <CheckIcon className="h-4 w-4 sm:h-3 sm:w-3" />
                    ) : (
                      <QueueIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                    )}
                  </button>
                  <span role="status" className="sr-only">
                    {queued ? `Added ${item.target.title} to queue` : ''}
                  </span>
                  <PlayControl
                    playing={isPlaying}
                    paused={isPaused}
                    onPlay={handlePlay}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </article>
  )
})
