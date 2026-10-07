import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { playerApi, type RecentHistoryItem } from '../../lib/player.api'
import { useAuthStore } from '../../stores/auth.store'
import { MediaTile } from '../common/MediaTile'
import { ProceduralCover } from '../common/ProceduralCover'

interface RecentlyPlayedShelfProps {
  title?: string
  subtitle?: string
  limit?: number
  className?: string
}

export function RecentlyPlayedShelf({
  title = 'Recently Played',
  subtitle,
  limit = 12,
  className = '',
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
    <section className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-baseline border-b border-line pb-3">
        <div>
          <h2 className="font-serif italic font-medium text-xl text-ink">
            {title}
          </h2>
          {subtitle && (
            <p className="font-sans text-xs text-ink-soft mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
          {displayedItems.length}{' '}
          {displayedItems.length === 1 ? 'release' : 'releases'}
        </span>
      </div>

      {isLoading ? (
        <>
          {/* Mobile Loading Skeleton: 2-column horizontal tiles */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:hidden">
            {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
              <div
                key={i}
                className="flex items-center h-13 sm:h-14 rounded-md bg-panel/40 border border-line/40 animate-pulse overflow-hidden"
              >
                <div className="w-13 h-13 sm:w-14 sm:h-14 bg-line/40 shrink-0" />
                <div className="flex-1 min-w-0 px-2.5 space-y-1.5">
                  <div className="h-3 bg-line/50 rounded-xs w-3/4" />
                  <div className="h-2 bg-line/30 rounded-xs w-1/2" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Loading Skeleton: 6-column MediaTile vertical cards */}
          <div className="hidden md:grid md:grid-cols-6 gap-3">
            {Array.from({ length: limit }).map((_, i) => (
              <div
                key={i}
                className="p-2.5 rounded-xl bg-panel/40 animate-pulse space-y-2.5"
              >
                <div className="aspect-square bg-line/40 rounded-md" />
                <div className="h-3 bg-line/50 rounded-xs w-3/4" />
                <div className="h-2.5 bg-line/30 rounded-xs w-1/2" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* ===================== MOBILE VIEW (< md) ===================== */}
          {/* Spotify-style 2-column compact horizontal release tiles */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:hidden">
            {displayedItems.map((item) => {
              const releaseTitle = item.song.albumTitle || item.song.title
              const releaseCover =
                item.song.albumCoverImageUrl || item.song.coverImageUrl
              const releaseSlug =
                item.song.albumSlug || item.song.albumId || item.song.slug
              const releaseType = item.song.albumType || 'Release'

              return (
                <Link
                  key={item.historyId}
                  to="/albums/$idOrSlug"
                  params={{ idOrSlug: releaseSlug }}
                  className="group flex items-center h-13 sm:h-14 rounded-md overflow-hidden bg-panel/70 hover:bg-canvas-soft border border-line/50 active:scale-[0.98] transition-all duration-150 text-inherit no-underline select-none cursor-pointer"
                >
                  {/* Square Cover Flush Left */}
                  <div className="relative w-13 h-13 sm:w-14 sm:h-14 bg-canvas-deep shrink-0 overflow-hidden">
                    {releaseCover ? (
                      <img
                        src={releaseCover}
                        alt={releaseTitle}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <ProceduralCover
                        title={releaseTitle}
                        artistName={item.song.artistName}
                        className="w-full h-full"
                      />
                    )}
                  </div>

                  {/* Title & Artist */}
                  <div className="flex flex-col justify-center min-w-0 flex-1 px-2.5 py-1">
                    <span
                      className="text-xs font-semibold text-ink group-hover:text-blue truncate tracking-tight transition-colors"
                      title={releaseTitle}
                    >
                      {releaseTitle}
                    </span>
                    <span className="text-[10.5px] text-ink-soft truncate mt-0.5 leading-tight">
                      {item.song.artistName} · {releaseType}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* ===================== DESKTOP VIEW (>= md) ===================== */}
          {/* 6-column MediaTile vertical release cards */}
          <div className="hidden md:grid md:grid-cols-6 gap-3">
            {displayedItems.map((item) => {
              const releaseTitle = item.song.albumTitle || item.song.title
              const releaseCover =
                item.song.albumCoverImageUrl || item.song.coverImageUrl
              const releaseSlug =
                item.song.albumSlug || item.song.albumId || item.song.slug
              const releaseType = item.song.albumType || 'Release'

              return (
                <MediaTile
                  key={item.historyId}
                  to="/albums/$idOrSlug"
                  params={{ idOrSlug: releaseSlug }}
                  title={releaseTitle}
                  subtitle={`${item.song.artistName} · ${releaseType}`}
                  imageUrl={releaseCover}
                  artistName={item.song.artistName}
                />
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
