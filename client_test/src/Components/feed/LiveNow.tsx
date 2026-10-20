import { memo, useId } from 'react'
import { Link } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { Avatar } from '../../Components/ui'
import { MusicIconSVG, PauseIconSVG, PlayIconSVG } from '../Icons'
import { formatElapsed, liveItemToTrack } from './feed.utils'
import type { FriendActivityItem } from '../../lib/player.api'

export type LiveNowLayout = 'strip' | 'panel'

interface LiveNowProps {
  activities: FriendActivityItem[]
  isLoading: boolean
  layout: LiveNowLayout
}

function LiveCard({
  item,
  className = '',
}: {
  item: FriendActivityItem
  className?: string
}) {
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  const isCurrent = currentTrackId === item.activity.songId
  const isPlaying = isCurrent && playbackStatus === 'playing'

  const progressPercent = item.activity.durationMs
    ? Math.min(100, (item.activity.progressMs / item.activity.durationMs) * 100)
    : 0

  const handleListen = () => {
    if (isCurrent) {
      togglePlay()
      return
    }

    const track = liveItemToTrack(item)
    playTrack(track, [track], 0, 'live:activity', 'Live now')
    if (item.activity.progressMs > 0) {
      usePlayerStore
        .getState()
        .seek(Math.floor(item.activity.progressMs / 1000))
    }
  }

  return (
    <div
      className={`rounded-surface border border-border bg-card p-3 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <Link
          to="/users/$id"
          params={{ id: item.user.id }}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Avatar
            src={item.user.avatarUrl}
            name={item.user.displayName}
            size="sm"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/users/$id"
            params={{ id: item.user.id }}
            className="block truncate text-caption font-semibold text-foreground hover:underline"
          >
            {item.user.displayName}
          </Link>
          <p className="truncate font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
            {item.user.isMutualFriend ? 'Mutual friend' : 'Following'}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Live
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-control border border-border/70 bg-muted">
          {item.activity.coverImageUrl ? (
            <img
              src={item.activity.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <MusicIconSVG className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-body font-medium text-foreground"
            title={item.activity.trackTitle}
          >
            {item.activity.trackTitle}
          </p>
          <p className="truncate text-caption text-muted-foreground">
            {item.activity.artistName}
          </p>
        </div>

        <button
          type="button"
          onClick={handleListen}
          aria-label={
            isPlaying
              ? `Pause ${item.activity.trackTitle}`
              : `Listen to ${item.activity.trackTitle} with ${item.user.displayName}`
          }
          title={isPlaying ? 'Pause' : 'Listen along'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {isPlaying ? (
            <PauseIconSVG className="h-3.5 w-3.5" />
          ) : (
            <PlayIconSVG className="ml-0.5 h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="mt-2.5">
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-eyebrow text-muted-foreground">
          <span>{formatElapsed(item.activity.progressMs)}</span>
          {item.activity.durationMs ? (
            <span>{formatElapsed(item.activity.durationMs)}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const MemoLiveCard = memo(LiveCard)

function Header({ count }: { count: number }) {
  const headingId = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <h2 id={headingId} className="text-title font-semibold text-foreground">
          Live now
        </h2>
      </div>
      <span className="text-caption text-muted-foreground">
        {count === 1 ? '1 person' : `${count} people`}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-surface border border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-2 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-10 w-10 animate-pulse rounded-control bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-2 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}

export function LiveNow({ activities, isLoading, layout }: LiveNowProps) {
  const isStrip = layout === 'strip'

  if (!isLoading && activities.length === 0) {
    if (isStrip) return null
    return (
      <section aria-label="Live now">
        <Header count={0} />
        <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
          No one you follow is listening right now.
        </p>
      </section>
    )
  }

  if (isStrip) {
    return (
      <section aria-label="Live now" className="xl:hidden">
        <Header count={activities.length} />
        <div className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
          {isLoading
            ? Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="w-64 shrink-0 snap-start">
                  <SkeletonCard />
                </div>
              ))
            : activities.map((item) => (
                <MemoLiveCard
                  key={item.user.id}
                  item={item}
                  className="w-64 shrink-0 snap-start"
                />
              ))}
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Live now" className="hidden xl:block">
      <Header count={activities.length} />
      <div className="mt-3 space-y-2">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          activities
            .slice(0, 3)
            .map((item) => <MemoLiveCard key={item.user.id} item={item} />)
        )}
      </div>
    </section>
  )
}
