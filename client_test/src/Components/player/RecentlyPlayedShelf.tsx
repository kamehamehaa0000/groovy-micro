import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { playerApi, type RecentHistoryItem } from '../../lib/player.api'
import { useAuthStore } from '../../stores/auth.store'
import { RadioPill } from '../home/RadioPill'
import { cn } from '../ui/cn'
import { ArrowRight, ChevronRight } from 'lucide-react'

interface RecentlyPlayedShelfProps {
  eyebrow?: string
  title?: string
  subtitle?: string
  limit?: number
  className?: string
}

export function RecentlyPlayedShelf({
  eyebrow = 'Listen again',
  title = 'Recently Played',
  subtitle = '',
  limit = 6,
  className,
}: RecentlyPlayedShelfProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [history, setHistory] = useState<RecentHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return

    let isMounted = true
    setIsLoading(true)

    playerApi
      .getRecentHistory()
      .then((res) => {
        if (!isMounted) return
        setHistory(res.history || [])
      })
      .catch((err) => {
        console.warn('[RecentlyPlayedShelf] Failed to load history:', err)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isAuthenticated])

  if (!isAuthenticated || (!isLoading && history.length === 0)) {
    return null
  }

  const displayedItems = history.slice(0, limit)

  return (
    <section className={cn('w-full font-sans text-foreground', className)}>
      {/* Header matching Radio Section style */}
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="mb-2 font-eyebrow text-eyebrow font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <Link
          to="/history"
          className="hidden sm:block shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground "
        >
          History &rarr;
        </Link>
      </div>

      {isLoading ? (
        /* Loading Skeleton: compact pill shapes (h-16 sm:h-20) */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
          {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
            <div
              key={i}
              className="flex h-16 w-full animate-pulse overflow-hidden rounded-full border border-border/40 bg-card/40 sm:h-20"
            >
              <div className="w-[38%] shrink-0 bg-muted sm:w-[42%]" />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pl-3.5 pr-4 sm:pl-5 sm:pr-6">
                <div className="h-2 w-16 rounded-control bg-muted" />
                <div className="h-3.5 w-3/4 rounded-control bg-muted" />
                <div className="h-2.5 w-1/2 rounded-control bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Navigational Pill Grid (purely navigational with h-16 on mobile and h-20 on desktop) */
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
          {displayedItems.map((item) => {
            const releaseTitle = item.song.albumTitle || item.song.title
            const releaseCover =
              item.song.albumCoverImageUrl || item.song.coverImageUrl
            const releaseSlug =
              item.song.albumSlug || item.song.albumId || item.song.slug
            const releaseType =
              item.song.albumType || (item.song.albumTitle ? 'Album' : 'Track')

            return (
              <RadioPill
                key={item.historyId}
                id={item.historyId}
                size="compact"
                title={releaseTitle}
                subtitle={item.song.artistName}
                category={releaseType}
                imageUrl={releaseCover}
                to="/albums/$idOrSlug"
                params={{ idOrSlug: releaseSlug }}
              />
            )
          })}
          <Link
            to="/history"
            className="group flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 ease-out  hover:border-primary/40 hover:bg-card hover:shadow-md active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none sm:hidden"
          >
            <span>See More</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  )
}
