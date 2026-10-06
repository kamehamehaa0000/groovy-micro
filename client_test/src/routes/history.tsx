import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { usePlayerStore } from '../stores/player.store'
import { playerApi, type HistoryItem } from '../lib/player.api'
import type { PlayerTrack } from '../types/player'
import { ProceduralCover } from '../components/common/ProceduralCover'
import {
  PlayIconSVG,
  PauseIconSVG,
  GridIconSVG,
  ListIconSVG,
} from '../components/icons'

export const Route = createFileRoute('/history')({
  component: HistoryPageComponent,
})

export type GroupByInterval = 'day' | 'week' | 'month' | 'year'
export type ViewMode = 'grid' | 'list'

export interface PlayedRelease {
  releaseKey: string
  albumId: string | null
  title: string
  slug: string
  albumType: string
  coverImageUrl: string | null
  artistId: string
  artistName: string
  artistSlug: string
  latestPlayedAt: string
  playCount: number
  tracksPlayed: HistoryItem[]
}

export interface ReleaseGroup {
  key: string
  label: string
  totalPlays: number
  releases: PlayedRelease[]
}

function formatPlayTime(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function formatDurationSeconds(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function HistoryPageComponent() {
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  const [groupBy, setGroupBy] = useState<GroupByInterval>('day')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [expandedReleaseKey, setExpandedReleaseKey] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Initial load
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isMounted = true
    setIsLoading(true)

    playerApi
      .getHistory({ limit: 50 })
      .then((res) => {
        if (!isMounted) return
        setItems(res.items || [])
        setNextCursor(res.nextCursor)
        setHasMore(res.hasMore)
      })
      .catch((err) => {
        console.warn('[History] Failed to load listening history:', err)
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
    if (!nextCursor || isLoadingMore || !hasMore) return

    setIsLoadingMore(true)
    try {
      const res = await playerApi.getHistory({
        limit: 50,
        cursor: nextCursor,
      })
      setItems((prev) => [...prev, ...(res.items || [])])
      setNextCursor(res.nextCursor)
      setHasMore(res.hasMore)
    } catch (err) {
      console.warn('[History] Failed to load more history:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextCursor, isLoadingMore, hasMore])

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

  // High-performance bucket & release aggregator
  const releaseGroups: ReleaseGroup[] = useMemo(() => {
    if (items.length === 0) return []

    const now = new Date()

    // Helper functions for date bucketing
    const getBucket = (d: Date): { key: string; label: string; sortTimestamp: number } => {
      if (groupBy === 'day') {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dayNum = String(d.getDate()).padStart(2, '0')
        const key = `day-${y}-${m}-${dayNum}`

        const isToday =
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()

        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)
        const isYesterday =
          d.getFullYear() === yesterday.getFullYear() &&
          d.getMonth() === yesterday.getMonth() &&
          d.getDate() === yesterday.getDate()

        let label: string
        if (isToday) {
          label = `Today • ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        } else if (isYesterday) {
          label = `Yesterday • ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        } else {
          label = d.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
          })
        }

        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
        return { key, label, sortTimestamp: startOfDay }
      }

      if (groupBy === 'week') {
        const monday = new Date(d)
        const dayOfWeek = (monday.getDay() + 6) % 7
        monday.setDate(monday.getDate() - dayOfWeek)
        monday.setHours(0, 0, 0, 0)

        const sunday = new Date(monday)
        sunday.setDate(sunday.getDate() + 6)

        const key = `week-${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

        const nowMonday = new Date(now)
        const nowDayOfWeek = (nowMonday.getDay() + 6) % 7
        nowMonday.setDate(nowMonday.getDate() - nowDayOfWeek)
        nowMonday.setHours(0, 0, 0, 0)

        const isCurrentWeek = monday.getTime() === nowMonday.getTime()
        const lastWeekMonday = new Date(nowMonday)
        lastWeekMonday.setDate(lastWeekMonday.getDate() - 7)
        const isLastWeek = monday.getTime() === lastWeekMonday.getTime()

        let label: string
        if (isCurrentWeek) {
          label = `This Week • ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        } else if (isLastWeek) {
          label = `Last Week • ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        } else {
          label = `Week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: monday.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })}`
        }

        return { key, label, sortTimestamp: monday.getTime() }
      }

      if (groupBy === 'month') {
        const key = `month-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
        const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
        return { key, label, sortTimestamp: startOfMonth }
      }

      // Year
      const key = `year-${d.getFullYear()}`
      const label = String(d.getFullYear())
      const startOfYear = new Date(d.getFullYear(), 0, 1).getTime()
      return { key, label, sortTimestamp: startOfYear }
    }

    // Bucket map: key -> { label, sortTimestamp, releasesMap }
    const bucketsMap = new Map<
      string,
      {
        key: string
        label: string
        sortTimestamp: number
        totalPlays: number
        releasesMap: Map<string, PlayedRelease>
      }
    >()

    for (const item of items) {
      const d = new Date(item.playedAt)
      if (isNaN(d.getTime())) continue

      const bucketInfo = getBucket(d)
      let bucket = bucketsMap.get(bucketInfo.key)

      if (!bucket) {
        bucket = {
          key: bucketInfo.key,
          label: bucketInfo.label,
          sortTimestamp: bucketInfo.sortTimestamp,
          totalPlays: 0,
          releasesMap: new Map(),
        }
        bucketsMap.set(bucketInfo.key, bucket)
      }

      bucket.totalPlays += 1

      // Release key: albumId if exists, otherwise single track
      const releaseKey = item.song.albumId ? `album:${item.song.albumId}` : `single:${item.song.id}`
      let release = bucket.releasesMap.get(releaseKey)

      if (!release) {
        const isPersonal = item.song.scope === 'PERSONAL'
        const rawType = item.song.albumType || (isPersonal ? 'VAULT' : 'SINGLE')

        release = {
          releaseKey,
          albumId: item.song.albumId,
          title: item.song.albumTitle || item.song.title,
          slug: item.song.albumSlug || item.song.slug,
          albumType: rawType,
          coverImageUrl: item.song.albumCoverImageUrl || item.song.coverImageUrl,
          artistId: item.song.artistId,
          artistName: item.song.artistName,
          artistSlug: item.song.artistSlug,
          latestPlayedAt: item.playedAt,
          playCount: 1,
          tracksPlayed: [item],
        }
        bucket.releasesMap.set(releaseKey, release)
      } else {
        release.playCount += 1
        release.tracksPlayed.push(item)
        if (new Date(item.playedAt).getTime() > new Date(release.latestPlayedAt).getTime()) {
          release.latestPlayedAt = item.playedAt
        }
      }
    }

    // Sort buckets descending by date
    const sortedBuckets = Array.from(bucketsMap.values()).sort(
      (a, b) => b.sortTimestamp - a.sortTimestamp,
    )

    // Build final output with releases sorted by latest played
    return sortedBuckets.map((bucket) => {
      const releases = Array.from(bucket.releasesMap.values()).sort(
        (a, b) => new Date(b.latestPlayedAt).getTime() - new Date(a.latestPlayedAt).getTime(),
      )
      return {
        key: bucket.key,
        label: bucket.label,
        totalPlays: bucket.totalPlays,
        releases,
      }
    })
  }, [items, groupBy])

  // Play an entire release (or its played tracks)
  const handlePlayRelease = (release: PlayedRelease) => {
    if (release.tracksPlayed.length === 0) return

    // Check if current playing track belongs to this release
    const isPlayingThisRelease = release.tracksPlayed.some((t) => t.song.id === currentTrack?.id)
    if (isPlayingThisRelease) {
      togglePlay()
      return
    }

    const firstItem = release.tracksPlayed[0]
    const playerTrack: PlayerTrack = {
      id: firstItem.song.id,
      title: firstItem.song.title,
      artistId: firstItem.song.artistId,
      artistName: firstItem.song.artistName,
      artistSlug: firstItem.song.artistSlug,
      albumId: firstItem.song.albumId || undefined,
      albumTitle: firstItem.song.albumTitle || undefined,
      albumSlug: firstItem.song.albumSlug || undefined,
      durationSeconds: firstItem.song.durationSeconds,
      coverImageUrl: firstItem.song.coverImageUrl || firstItem.song.albumCoverImageUrl || undefined,
      audioUrl: firstItem.song.audioUrl || undefined,
      hlsManifestUrl: firstItem.song.hlsManifestUrl || undefined,
      rawAudioKey: firstItem.song.rawAudioKey || undefined,
      isExplicit: firstItem.song.isExplicit,
      scope: (firstItem.song.scope as any) || 'GLOBAL',
    }

    const queue: PlayerTrack[] = release.tracksPlayed.map((t) => ({
      id: t.song.id,
      title: t.song.title,
      artistId: t.song.artistId,
      artistName: t.song.artistName,
      artistSlug: t.song.artistSlug,
      albumId: t.song.albumId || undefined,
      albumTitle: t.song.albumTitle || undefined,
      albumSlug: t.song.albumSlug || undefined,
      durationSeconds: t.song.durationSeconds,
      coverImageUrl: t.song.coverImageUrl || t.song.albumCoverImageUrl || undefined,
      audioUrl: t.song.audioUrl || undefined,
      hlsManifestUrl: t.song.hlsManifestUrl || undefined,
      rawAudioKey: t.song.rawAudioKey || undefined,
      isExplicit: t.song.isExplicit,
      scope: (t.song.scope as any) || 'GLOBAL',
    }))

    playTrack(playerTrack, queue, 0, `history:${release.releaseKey}`, release.title)
  }

  // Play an individual track inside a release
  const handlePlaySingleTrack = (item: HistoryItem, allReleaseItems: HistoryItem[]) => {
    if (currentTrack?.id === item.song.id) {
      togglePlay()
      return
    }

    const playerTrack: PlayerTrack = {
      id: item.song.id,
      title: item.song.title,
      artistId: item.song.artistId,
      artistName: item.song.artistName,
      artistSlug: item.song.artistSlug,
      albumId: item.song.albumId || undefined,
      albumTitle: item.song.albumTitle || undefined,
      albumSlug: item.song.albumSlug || undefined,
      durationSeconds: item.song.durationSeconds,
      coverImageUrl: item.song.coverImageUrl || item.song.albumCoverImageUrl || undefined,
      audioUrl: item.song.audioUrl || undefined,
      hlsManifestUrl: item.song.hlsManifestUrl || undefined,
      rawAudioKey: item.song.rawAudioKey || undefined,
      isExplicit: item.song.isExplicit,
      scope: (item.song.scope as any) || 'GLOBAL',
    }

    const queue: PlayerTrack[] = allReleaseItems.map((t) => ({
      id: t.song.id,
      title: t.song.title,
      artistId: t.song.artistId,
      artistName: t.song.artistName,
      artistSlug: t.song.artistSlug,
      albumId: t.song.albumId || undefined,
      albumTitle: t.song.albumTitle || undefined,
      albumSlug: t.song.albumSlug || undefined,
      durationSeconds: t.song.durationSeconds,
      coverImageUrl: t.song.coverImageUrl || t.song.albumCoverImageUrl || undefined,
      audioUrl: t.song.audioUrl || undefined,
      hlsManifestUrl: t.song.hlsManifestUrl || undefined,
      rawAudioKey: t.song.rawAudioKey || undefined,
      isExplicit: t.song.isExplicit,
      scope: (t.song.scope as any) || 'GLOBAL',
    }))

    const trackIndex = allReleaseItems.findIndex((t) => t.historyId === item.historyId)
    playTrack(
      playerTrack,
      queue,
      trackIndex >= 0 ? trackIndex : 0,
      `history:${item.song.albumId || item.song.id}`,
      item.song.title,
    )
  }

  // Guest view if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-panel border border-line flex items-center justify-center mx-auto mb-6 text-blue shadow-md">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h1 className="font-serif italic text-3xl font-medium text-ink mb-3">
          Listening History
        </h1>
        <p className="font-sans text-xs text-ink-soft mb-8 leading-relaxed max-w-sm mx-auto">
          Sign in to view every record and release spun across all your connected devices.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className="font-mono text-xs uppercase tracking-widest font-semibold px-8 py-3 bg-blue text-canvas rounded-full shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          Sign in to Groovy
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 w-full select-none">
      {/* ===================== EDITORIAL HEADER ===================== */}
      <div className="border-b border-line pb-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-2">
              ✦ Activity &amp; Listening Telemetry
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
              Releases Played
            </h1>
            <p className="font-sans text-xs text-ink-soft max-w-lg mt-2 leading-relaxed">
              A minimal archive of every record and release spun on your account, grouped chronologically.
            </p>
          </div>

          {/* Controls Bar: Group by Interval & View Mode */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
            {/* Grouping Interval Tabs */}
            <div className="flex items-center gap-1 p-1 bg-panel border border-line rounded-lg shadow-2xs">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft/70 px-2 hidden sm:inline-block">
                Group by
              </span>
              {(['day', 'week', 'month', 'year'] as GroupByInterval[]).map((mode) => {
                const isSelected = groupBy === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setGroupBy(mode)}
                    className={`font-mono text-[10.5px] uppercase tracking-wider px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-ink text-canvas font-semibold shadow-xs'
                        : 'text-ink-soft hover:text-ink hover:bg-canvas'
                    }`}
                  >
                    {mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : mode === 'month' ? 'Month' : 'Year'}
                  </button>
                )
              })}
            </div>

            {/* View Mode Toggle (Grid / List) */}
            <div className="flex items-center p-1 bg-panel border border-line rounded-lg shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Grid View"
                aria-label="Grid View"
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-ink text-canvas shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-canvas'
                }`}
              >
                <GridIconSVG className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="List View"
                aria-label="List View"
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-ink text-canvas shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-canvas'
                }`}
              >
                <ListIconSVG className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== MAIN CONTENT ===================== */}
      {isLoading ? (
        /* Loading skeleton */
        <div className="space-y-10">
          {[1, 2].map((groupIndex) => (
            <div key={groupIndex} className="space-y-4">
              <div className="h-5 w-48 bg-line/40 rounded-xs animate-pulse" />
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="p-3 rounded-xl bg-panel/40 border border-line/40 animate-pulse space-y-2.5">
                      <div className="aspect-square bg-line/30 rounded-lg" />
                      <div className="h-3.5 bg-line/50 rounded-xs w-4/5" />
                      <div className="h-2.5 bg-line/30 rounded-xs w-1/2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-3 rounded-xl bg-panel/40 border border-line/40 animate-pulse flex items-center gap-3.5">
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
      ) : releaseGroups.length === 0 ? (
        /* Empty State */
        <div className="py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-panel border border-line flex items-center justify-center mx-auto mb-4 text-ink-soft">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="font-serif italic text-xl text-ink font-medium">No listening history recorded yet</h2>
          <p className="font-sans text-xs text-ink-soft mt-1.5 max-w-sm mx-auto">
            Start playing records from the catalog or personal vault to see your releases organized here.
          </p>
          <Link
            to="/"
            className="inline-block mt-6 font-mono text-xs uppercase tracking-widest px-6 py-2.5 bg-ink text-canvas rounded-full hover:opacity-90 transition-opacity"
          >
            Explore Catalog
          </Link>
        </div>
      ) : (
        /* Date Grouped Release Sections */
        <div className="space-y-12">
          {releaseGroups.map((group) => (
            <section key={group.key} className="space-y-4">
              {/* Group Section Header */}
              <div className="flex items-baseline justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif italic font-medium text-lg sm:text-xl text-ink">
                    {group.label}
                  </h2>
                </div>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                  {group.releases.length} {group.releases.length === 1 ? 'release' : 'releases'} • {group.totalPlays} {group.totalPlays === 1 ? 'play' : 'plays'}
                </span>
              </div>

              {/* View Mode: Grid View */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {group.releases.map((release) => {
                    const isCurrentReleasePlaying =
                      release.tracksPlayed.some((t) => t.song.id === currentTrack?.id) &&
                      playbackStatus === 'playing'

                    const isExpanded = expandedReleaseKey === `${group.key}:${release.releaseKey}`

                    return (
                      <div
                        key={release.releaseKey}
                        className={`group relative flex flex-col p-2.5 rounded-xl border transition-all duration-200 ${
                          isCurrentReleasePlaying
                            ? 'bg-blue/5 border-blue/40 shadow-xs'
                            : 'bg-panel/40 hover:bg-canvas-soft/80 border-line hover:border-ink/20 shadow-2xs'
                        }`}
                      >
                        {/* Album Artwork with Quick Play Overlay */}
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
                              artistName={release.artistName}
                              className="w-full h-full"
                            />
                          )}

                          {/* Play / Pause Overlay */}
                          <button
                            type="button"
                            onClick={() => handlePlayRelease(release)}
                            aria-label={isCurrentReleasePlaying ? 'Pause release' : 'Play release'}
                            className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity cursor-pointer ${
                              isCurrentReleasePlaying
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <div className="w-10 h-10 rounded-full bg-ink text-canvas flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95">
                              {isCurrentReleasePlaying ? (
                                <PauseIconSVG className="w-4 h-4 text-canvas" />
                              ) : (
                                <PlayIconSVG className="w-4 h-4 text-canvas ml-0.5" />
                              )}
                            </div>
                          </button>

                          {/* Playing Pulse Dot */}
                          {isCurrentReleasePlaying && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/75 px-1.5 py-0.5 rounded-full backdrop-blur-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue animate-ping" />
                              <span className="w-1.5 h-1.5 rounded-full bg-blue" />
                            </div>
                          )}

                          {/* Release Type Badge (ALBUM, EP, SINGLE, VAULT) */}
                          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-xs font-mono text-[8px] uppercase tracking-wider bg-canvas/90 backdrop-blur-xs text-ink-soft border border-line/60">
                            {release.albumType}
                          </span>
                        </div>

                        {/* Release Title & Artist */}
                        <div className="flex flex-col min-w-0 flex-1">
                          {release.albumId ? (
                            <Link
                              to="/albums/$idOrSlug"
                              params={{ idOrSlug: release.slug || release.albumId }}
                              className="text-xs font-semibold text-ink hover:text-blue truncate tracking-tight transition-colors"
                              title={release.title}
                            >
                              {release.title}
                            </Link>
                          ) : (
                            <span
                              className="text-xs font-semibold text-ink truncate tracking-tight"
                              title={release.title}
                            >
                              {release.title}
                            </span>
                          )}

                          {release.artistSlug ? (
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: release.artistSlug }}
                              className="text-[11px] text-ink-soft hover:text-ink truncate transition-colors mt-0.5 block"
                            >
                              {release.artistName}
                            </Link>
                          ) : (
                            <span className="text-[11px] text-ink-soft truncate mt-0.5">
                              {release.artistName}
                            </span>
                          )}

                          {/* Sub-bar: Track Count & Expand Toggle */}
                          <div className="flex items-center justify-between font-mono text-[9px] text-ink-soft/70 border-t border-line-soft pt-1.5 mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedReleaseKey((curr) =>
                                  curr === `${group.key}:${release.releaseKey}` ? null : `${group.key}:${release.releaseKey}`,
                                )
                              }
                              className="hover:text-ink transition-colors cursor-pointer flex items-center gap-1"
                              title="Toggle tracks played"
                            >
                              <span>
                                {release.playCount} {release.playCount === 1 ? 'play' : 'plays'}
                              </span>
                              <span className="text-[8px] opacity-70">
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </button>

                            <span>{formatPlayTime(release.latestPlayedAt)}</span>
                          </div>
                        </div>

                        {/* Expandable Track List Accordion */}
                        {isExpanded && (
                          <div className="mt-2.5 pt-2 border-t border-line space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                            <span className="font-mono text-[8px] uppercase tracking-wider text-ink-soft block mb-1">
                              Tracks played:
                            </span>
                            {release.tracksPlayed.map((t) => {
                              const isPlayingThisTrack =
                                currentTrack?.id === t.song.id && playbackStatus === 'playing'

                              return (
                                <button
                                key={t.historyId}
                                type="button"
                                onClick={() => handlePlaySingleTrack(t, release.tracksPlayed)}
                                className={`w-full flex items-center justify-between text-left py-1 px-1.5 rounded-xs text-[10px] transition-colors cursor-pointer ${
                                  isPlayingThisTrack
                                    ? 'bg-blue/10 text-blue font-medium'
                                    : 'hover:bg-canvas text-ink-soft hover:text-ink'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                                  <span className="shrink-0 text-[8.5px] opacity-60">
                                    {isPlayingThisTrack ? '▶' : '♪'}
                                  </span>
                                  <span className="truncate">{t.song.title}</span>
                                </div>
                                <span className="font-mono text-[8.5px] shrink-0 opacity-70">
                                  {formatDurationSeconds(t.song.durationSeconds)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* View Mode: List View */
              <div className="space-y-2">
                {group.releases.map((release) => {
                  const isCurrentReleasePlaying =
                    release.tracksPlayed.some((t) => t.song.id === currentTrack?.id) &&
                    playbackStatus === 'playing'

                  const isExpanded = expandedReleaseKey === `${group.key}:${release.releaseKey}`

                  return (
                    <div
                      key={release.releaseKey}
                      className={`group flex flex-col rounded-xl border transition-all duration-200 overflow-hidden ${
                        isCurrentReleasePlaying
                          ? 'bg-blue/5 border-blue/40 shadow-xs'
                          : 'bg-panel/40 hover:bg-canvas-soft/80 border-line hover:border-ink/20 shadow-2xs'
                      }`}
                    >
                      {/* Row Bar */}
                      <div className="flex items-center gap-3.5 p-2.5 sm:px-4">
                        {/* Thumbnail Cover with Play button */}
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-canvas-deep border border-line shrink-0 group/cover shadow-2xs">
                          {release.coverImageUrl ? (
                            <img
                              src={release.coverImageUrl}
                              alt={release.title}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover/cover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <ProceduralCover
                              title={release.title}
                              artistName={release.artistName}
                              className="w-full h-full"
                            />
                          )}

                          {/* Quick Play/Pause button */}
                          <button
                            type="button"
                            onClick={() => handlePlayRelease(release)}
                            aria-label={isCurrentReleasePlaying ? 'Pause release' : 'Play release'}
                            className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center transition-opacity cursor-pointer ${
                              isCurrentReleasePlaying
                                ? 'opacity-100'
                                : 'opacity-0 group-hover/cover:opacity-100'
                            }`}
                          >
                            <div className="w-7 h-7 rounded-full bg-ink text-canvas flex items-center justify-center shadow-md">
                              {isCurrentReleasePlaying ? (
                                <PauseIconSVG className="w-3.5 h-3.5 text-canvas" />
                              ) : (
                                <PlayIconSVG className="w-3.5 h-3.5 text-canvas ml-0.5" />
                              )}
                            </div>
                          </button>

                          {/* Pulse dot */}
                          {isCurrentReleasePlaying && (
                            <div className="absolute top-1 right-1 flex items-center gap-1 bg-black/75 px-1 py-0.5 rounded-full backdrop-blur-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue animate-ping" />
                              <span className="w-1.5 h-1.5 rounded-full bg-blue" />
                            </div>
                          )}
                        </div>

                        {/* Release Title, Artist & Badge */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {release.albumId ? (
                              <Link
                                to="/albums/$idOrSlug"
                                params={{ idOrSlug: release.slug || release.albumId }}
                                className="text-xs sm:text-sm font-semibold text-ink hover:text-blue truncate tracking-tight transition-colors"
                                title={release.title}
                              >
                                {release.title}
                              </Link>
                            ) : (
                              <span
                                className="text-xs sm:text-sm font-semibold text-ink truncate tracking-tight"
                                title={release.title}
                              >
                                {release.title}
                              </span>
                            )}

                            <span className="shrink-0 px-1.5 py-0.2 rounded-xs font-mono text-[7.5px] uppercase tracking-wider bg-canvas border border-line text-ink-soft">
                              {release.albumType}
                            </span>
                          </div>

                          {release.artistSlug ? (
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: release.artistSlug }}
                              className="text-[11px] text-ink-soft hover:text-ink truncate transition-colors mt-0.5"
                            >
                              {release.artistName}
                            </Link>
                          ) : (
                            <span className="text-[11px] text-ink-soft truncate mt-0.5">
                              {release.artistName}
                            </span>
                          )}
                        </div>

                        {/* Right Metadata: Play count toggle & Timestamp */}
                        <div className="flex items-center gap-4 shrink-0 font-mono text-[9.5px] text-ink-soft">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReleaseKey((curr) =>
                                curr === `${group.key}:${release.releaseKey}`
                                  ? null
                                  : `${group.key}:${release.releaseKey}`,
                              )
                            }
                            className="hover:text-ink transition-colors cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded bg-canvas border border-line"
                            title="View tracks played"
                          >
                            <span>
                              {release.playCount} {release.playCount === 1 ? 'play' : 'plays'}
                            </span>
                            <span className="text-[8px] opacity-70">
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </button>

                          <span className="hidden sm:inline-block min-w-16 text-right">
                            {formatPlayTime(release.latestPlayedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Expandable Tracks Accordion in List View */}
                      {isExpanded && (
                        <div className="bg-canvas-soft/40 border-t border-line px-4 py-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                          <span className="font-mono text-[8px] uppercase tracking-wider text-ink-soft block mb-1">
                            Tracks played:
                          </span>
                          {release.tracksPlayed.map((t, idx) => {
                            const isPlayingThisTrack =
                              currentTrack?.id === t.song.id && playbackStatus === 'playing'

                            return (
                              <button
                                key={t.historyId}
                                type="button"
                                onClick={() => handlePlaySingleTrack(t, release.tracksPlayed)}
                                className={`w-full flex items-center justify-between text-left py-1.5 px-2 rounded-md text-[11px] transition-colors cursor-pointer ${
                                  isPlayingThisTrack
                                    ? 'bg-blue/10 text-blue font-medium'
                                    : 'hover:bg-canvas text-ink-soft hover:text-ink'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                  <span className="font-mono text-[9px] text-ink-soft/60 w-4 text-right shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="shrink-0 text-[9px]">
                                    {isPlayingThisTrack ? '▶' : '♪'}
                                  </span>
                                  <span className="truncate">{t.song.title}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 font-mono text-[9px] opacity-70">
                                  <span>{formatPlayTime(t.playedAt)}</span>
                                  <span>{formatDurationSeconds(t.song.durationSeconds)}</span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}

        {/* ===================== INFINITE SCROLL SENTINEL ===================== */}
        <div ref={sentinelRef} className="py-8 flex flex-col items-center justify-center">
          {isLoadingMore && (
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-ink-soft animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue animate-ping" />
              <span>Loading earlier releases...</span>
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/60">
              ✦ Beginning of recorded history reached
            </p>
          )}
        </div>
      </div>
    )}
  </div>
)
}
