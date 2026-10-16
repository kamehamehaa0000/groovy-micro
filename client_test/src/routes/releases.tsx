import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { artistsApi, type FollowedArtistRelease } from '../lib/artists.api'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { GridIconSVG, ListIconSVG } from '../components/icons'

export const Route = createFileRoute('/releases')({
  component: FollowedReleasesComponent,
})

type ViewMode = 'grid' | 'list'

interface ReleaseMonthGroup {
  key: string
  label: string
  sortTimestamp: number
  releases: FollowedArtistRelease[]
}

function formatReleaseDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatDurationSeconds(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  return `${m} min`
}

function FollowedReleasesComponent() {
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [releases, setReleases] = useState<FollowedArtistRelease[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Initial load
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isMounted = true
    setIsLoading(true)

    artistsApi
      .getFollowedReleases({ page: 1, limit: 30 })
      .then((res) => {
        if (!isMounted) return
        setReleases(res.releases || [])
        setHasMore(res.hasMore)
        setPage(res.page)
      })
      .catch((err) => {
        console.warn('[Releases] Failed to load followed releases:', err)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isAuthenticated])

  // Infinite scroll next page loader
  const fetchNextPage = useCallback(async () => {
    if (isLoadingMore || !hasMore) return

    setIsLoadingMore(true)
    const nextPage = page + 1

    try {
      const res = await artistsApi.getFollowedReleases({
        page: nextPage,
        limit: 30,
      })
      setReleases((prev) => [...prev, ...(res.releases || [])])
      setHasMore(res.hasMore)
      setPage(res.page)
    } catch (err) {
      console.warn('[Releases] Failed to load more releases:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [page, isLoadingMore, hasMore])

  // Attach IntersectionObserver for smooth infinite scroll
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage()
        }
      },
      { threshold: 0.1, rootMargin: '300px' },
    )

    const el = sentinelRef.current
    if (el) observer.observe(el)

    return () => {
      if (el) observer.unobserve(el)
    }
  }, [hasMore, isLoading, isLoadingMore, fetchNextPage])

  // High-performance chronological Month grouping
  const monthGroups: ReleaseMonthGroup[] = useMemo(() => {
    if (releases.length === 0) return []

    const map = new Map<string, ReleaseMonthGroup>()

    for (const rel of releases) {
      const d = new Date(rel.releaseDate)
      const validDate = isNaN(d.getTime()) ? new Date() : d
      const year = validDate.getFullYear()
      const month = String(validDate.getMonth() + 1).padStart(2, '0')
      const key = `${year}-${month}`

      let group = map.get(key)
      if (!group) {
        const label = validDate.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
        const sortTimestamp = new Date(year, validDate.getMonth(), 1).getTime()
        group = {
          key,
          label,
          sortTimestamp,
          releases: [],
        }
        map.set(key, group)
      }

      group.releases.push(rel)
    }

    return Array.from(map.values()).sort(
      (a, b) => b.sortTimestamp - a.sortTimestamp,
    )
  }, [releases])

  // Guest view if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-panel border border-line flex items-center justify-center mx-auto mb-6 text-primary shadow-md">
          <svg
            className="w-8 h-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        </div>
        <h1 className="font-serif italic text-3xl font-medium text-ink mb-3">
          Artist Radar
        </h1>
        <p className="font-sans text-xs text-ink-soft mb-8 leading-relaxed max-w-sm mx-auto">
          Sign in to view new releases dropped in the past 6 months by artists
          you follow.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className="font-mono text-xs uppercase tracking-widest font-semibold px-8 py-3 bg-primary text-canvas rounded-full shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          Sign in to Groovy
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 w-full select-none">
      {/* ===================== EDITORIAL HEADER ===================== */}
      <div className="border-b border-line pb-6 ">
        <div className="flex  sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
              Latest releases
            </h1>
            <span className="font-mono text-[11px] uppercase tracking-widest text-primary block mb-2">
              ✦ Artist Radar
            </span>
          </div>
          {/* Controls Bar: Only View Mode (Grid / List) */}
          <div className="flex w-fit items-center p-1 bg-panel  rounded-lg self-start sm:self-auto shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                if (viewMode !== 'list') setViewMode('list')
                if (viewMode === 'list') setViewMode('grid')
              }}
              title="Grid View"
              aria-label="Grid View"
              className={`p-1.5 rounded-md transition-all cursor-pointer`}
            >
              {viewMode === 'grid' ? (
                <ListIconSVG className="w-5 h-5" />
              ) : (
                <GridIconSVG className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ===================== MAIN CONTENT STREAM ===================== */}
      {isLoading ? (
        /* Loading skeleton */
        <div className="space-y-10">
          {[1, 2].map((groupIndex) => (
            <div key={groupIndex} className="space-y-4">
              <div className="h-5 w-44 bg-line/40 rounded-xs animate-pulse" />
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-panel/40 border border-line/40 animate-pulse space-y-2.5"
                    >
                      <div className="aspect-square bg-line/30 rounded-lg" />
                      <div className="h-3.5 bg-line/50 rounded-xs w-4/5" />
                      <div className="h-2.5 bg-line/30 rounded-xs w-1/2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-panel/40 border border-line/40 animate-pulse flex items-center gap-3.5"
                    >
                      <div className="w-12 h-12 bg-line/30 rounded-lg shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 bg-line/50 rounded-xs w-1/3" />
                        <div className="h-2.5 bg-line/30 rounded-xs w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : monthGroups.length === 0 ? (
        /* Empty State */
        <div className="py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-panel border border-line flex items-center justify-center mx-auto mb-4 text-ink-soft">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="font-serif italic text-xl text-ink font-medium">
            No recent releases found
          </h2>
          <p className="font-sans text-xs text-ink-soft mt-1.5 max-w-sm mx-auto">
            None of your followed artists have released music in the past 6
            months, or you aren't following any artists yet.
          </p>
          <Link
            to="/artists"
            className="inline-block mt-6 font-mono text-xs uppercase tracking-widest px-6 py-2.5 bg-ink text-canvas rounded-full hover:opacity-90 transition-opacity"
          >
            Explore Artists Roster
          </Link>
        </div>
      ) : (
        /* Month Grouped Release Sections */
        <div className="space-y-1">
          {monthGroups.map((group) => (
            <section key={group.key} className="space-y-4">
              {/* Group Section Header */}
              <div className="flex items-baseline justify-between border-b border-line pb-2.5">
                <h2 className="font-serif italic font-medium text-lg sm:text-xl text-ink">
                  {group.label}
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                  {group.releases.length}{' '}
                  {group.releases.length === 1 ? 'release' : 'releases'}
                </span>
              </div>

              {/* View Mode: Grid View */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {group.releases.map((release) => (
                    <Link
                      key={release.id}
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: release.slug || release.id }}
                      className="group relative flex flex-col p-2.5 rounded-xl border border-line bg-panel/40 hover:bg-canvas-soft/80 hover:border-ink/20 shadow-2xs hover:shadow-sm transition-all duration-200 cursor-pointer text-inherit no-underline"
                    >
                      {/* Album Artwork */}
                      <div className="aspect-square bg-canvas-deep border border-line relative overflow-hidden rounded-lg mb-2.5 shadow-2xs">
                        {release.coverImageUrl ? (
                          <img
                            src={release.coverImageUrl}
                            alt={release.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <ProceduralCover
                            title={release.title}
                            artistName={release.artist?.name}
                            className="w-full h-full"
                          />
                        )}

                        {/* Release Type Badge (ALBUM, EP, SINGLE) */}
                        <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-xs font-mono text-[11px] uppercase tracking-wider bg-canvas/90 backdrop-blur-xs text-ink-soft border border-line/60">
                          {release.albumType}
                        </span>
                      </div>

                      {/* Release Title & Artist */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className="text-sm font-semibold text-ink group-hover:text-primary truncate tracking-tight transition-colors"
                          title={release.title}
                        >
                          {release.title}
                        </span>

                        <span className="text-[11px] text-ink-soft truncate mt-0.5">
                          {release.artist?.name}
                        </span>

                        {/* Sub-bar: Release Date & Tracks Count */}
                        <div className="flex items-center justify-between font-mono text-[11px] text-ink-soft/70 border-t border-line-soft pt-1.5 mt-2">
                          <span>{formatReleaseDate(release.releaseDate)}</span>
                          {release.totalTracks > 0 && (
                            <span>
                              {release.totalTracks}{' '}
                              {release.totalTracks === 1 ? 'track' : 'tracks'}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                /* View Mode: List View */
                <div className="space-y-2">
                  {group.releases.map((release) => (
                    <Link
                      key={release.id}
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: release.slug || release.id }}
                      className="group flex items-center gap-3.5 p-2.5 sm:px-4 rounded-xl border border-line bg-panel/40 hover:bg-canvas-soft/80 hover:border-ink/20 shadow-2xs hover:shadow-sm transition-all duration-200 cursor-pointer text-inherit no-underline"
                    >
                      {/* Compact Thumbnail Cover */}
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-canvas-deep border border-line shrink-0 shadow-2xs">
                        {release.coverImageUrl ? (
                          <img
                            src={release.coverImageUrl}
                            alt={release.title}
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <ProceduralCover
                            title={release.title}
                            artistName={release.artist?.name}
                            className="w-full h-full"
                          />
                        )}
                      </div>

                      {/* Title, Artist, & Type Badge */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs sm:text-sm font-semibold text-ink group-hover:text-primary truncate tracking-tight transition-colors"
                            title={release.title}
                          >
                            {release.title}
                          </span>

                          <span className="shrink-0 px-1.5 py-0.5 rounded-xs font-mono text-[11px] uppercase tracking-wider bg-canvas border border-line text-ink-soft">
                            {release.albumType}
                          </span>
                        </div>

                        <span className="text-[11px] text-ink-soft truncate mt-0.5">
                          {release.artist?.name}
                        </span>
                      </div>

                      {/* Right Metadata: Duration & Release Date */}
                      <div className="flex items-center gap-4 shrink-0 font-mono text-[11px] text-ink-soft">
                        {release.totalDurationSeconds > 0 && (
                          <span className="hidden sm:inline-block">
                            {formatDurationSeconds(
                              release.totalDurationSeconds,
                            )}
                          </span>
                        )}
                        <span className="min-w-20 text-right">
                          {formatReleaseDate(release.releaseDate)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* ===================== INFINITE SCROLL SENTINEL ===================== */}
          <div
            ref={sentinelRef}
            className="py-2 flex flex-col items-center justify-center"
          >
            {isLoadingMore && (
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-ink-soft animate-pulse">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <span>Loading earlier releases...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
