import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { usePlayerStore } from '../stores/player.store'
import { useLikesStore } from '../stores/likes.store'
import { catalogApi } from '../lib/catalog.api'
import type { EnrichedSong } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { SongRow } from '../components/common/SongRow'
import {
  HeartIconSVG,
  PlayIconSVG,
  PauseIconSVG,
  SearchIconSVG,
  SortIconSVG,
  DiscIconSVG,
} from '../components/icons'

export const Route = createFileRoute('/liked')({
  component: LikedSongsPage,
})

function formatTotalDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0 min'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours} hr ${minutes} min`
  }
  if (minutes > 0) {
    return `${minutes} min ${secs > 0 ? `${secs} sec` : ''}`
  }
  return `${secs} sec`
}

export function LikedSongsPage() {
  const { isAuthenticated, user, isLoading: isAuthLoading } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  const [songs, setSongs] = useState<EnrichedSong[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'artist' | 'album' | 'duration'>('recent')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [unlikedIds, setUnlikedIds] = useState<Set<string>>(new Set())

  // Player Store
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const contextUri = usePlayerStore((s) => s.contextUri)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Likes Store
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  const isCurrentContext = contextUri === 'library:liked'
  const isPlayingThisContext = isCurrentContext && playbackStatus === 'playing'

  // Fetch liked songs on mount
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isMounted = true
    const loadLikedSongs = async () => {
      setIsLoading(true)
      setErrorMsg(null)
      try {
        const res = await catalogApi.getLikedSongs(1, 100)
        if (!isMounted) return
        setSongs(res.data)
        hydrateSongs(res.data.map((s) => ({ id: s.id, isLiked: true })))
      } catch (err: any) {
        if (!isMounted) return
        setErrorMsg(err.message || 'Failed to load liked songs')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadLikedSongs()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated, hydrateSongs])

  // Map EnrichedSong to PlayerTrack
  const toPlayerTrack = useCallback((s: EnrichedSong): PlayerTrack => {
    return {
      id: s.id,
      title: s.title,
      artistId: s.artistId,
      artistName: s.artistStageName || 'Unknown Artist',
      artistSlug: s.artistSlug,
      albumId: s.albumId,
      albumTitle: s.albumTitle,
      albumSlug: s.albumSlug,
      coverImageUrl: s.coverImageUrl || s.albumCoverImageUrl,
      durationSeconds: s.durationSeconds,
      audioUrl: s.audioUrl,
      hlsManifestUrl: s.hlsManifestUrl,
      rawAudioKey: s.rawAudioKey,
      isExplicit: s.isExplicit,
      isLiked: true,
      scope: 'GLOBAL',
      credits: s.credits,
    }
  }, [])

  // Filtered and Sorted list
  const filteredAndSortedSongs = useMemo(() => {
    // 1. Exclude locally unliked tracks
    let list = songs.filter(
      (s) => !unlikedIds.has(s.id) && (likedSongIds.size === 0 || likedSongIds.has(s.id))
    )

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.artistStageName && s.artistStageName.toLowerCase().includes(q)) ||
          (s.albumTitle && s.albumTitle.toLowerCase().includes(q))
      )
    }

    // 3. Sort list
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'recent') {
        const dateA = new Date((a as any).likedAt || a.createdAt).getTime()
        const dateB = new Date((b as any).likedAt || b.createdAt).getTime()
        cmp = dateA - dateB
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title)
      } else if (sortBy === 'artist') {
        const nameA = a.artistStageName || ''
        const nameB = b.artistStageName || ''
        cmp = nameA.localeCompare(nameB)
      } else if (sortBy === 'album') {
        const albA = a.albumTitle || ''
        const albB = b.albumTitle || ''
        cmp = albA.localeCompare(albB)
      } else if (sortBy === 'duration') {
        cmp = a.durationSeconds - b.durationSeconds
      }

      return sortOrder === 'desc' ? -cmp : cmp
    })
  }, [songs, unlikedIds, likedSongIds, searchQuery, sortBy, sortOrder])

  // Context total stats
  const totalCutsCount = filteredAndSortedSongs.length
  const totalDurationSeconds = useMemo(() => {
    return filteredAndSortedSongs.reduce(
      (acc, s) => acc + (s.durationSeconds || 0),
      0
    )
  }, [filteredAndSortedSongs])

  // Play All
  const handlePlayAll = () => {
    if (filteredAndSortedSongs.length === 0) return
    if (isPlayingThisContext) {
      togglePlay()
      return
    }

    const playerTracks = filteredAndSortedSongs.map(toPlayerTrack)
    playTrack(playerTracks[0], playerTracks, 0, 'library:liked', 'Liked Songs')
  }

  // Play specific track from row
  const handlePlaySong = (song: EnrichedSong, index: number) => {
    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    const playerTracks = filteredAndSortedSongs.map(toPlayerTrack)
    playTrack(playerTracks[index], playerTracks, index, 'library:liked', 'Liked Songs')
  }

  // If user unlikes track via SongRow, remove it from list
  const handleTrackUnlike = (songId: string) => {
    setUnlikedIds((prev) => new Set(prev).add(songId))
  }

  // Unauthenticated view
  if (!isAuthenticated && !isAuthLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center select-none">
        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-500 rounded-full flex items-center justify-center text-white shadow-lg">
          <HeartIconSVG filled={true} className="w-10 h-10" />
        </div>
        <h1 className="font-serif italic text-3xl sm:text-4xl text-ink mb-3">
          Your Liked Songs
        </h1>
        <p className="font-sans text-sm text-ink-soft max-w-md mx-auto mb-8 leading-relaxed">
          Sign in or create an account to view and play all tracks you've saved across your listening sessions.
        </p>
        <button
          type="button"
          onClick={() =>
            openAuthModal({
              category: 'Favorites & Library',
              title: 'Access your Liked Songs',
              subtitle: 'Authentication Required',
              description: 'Sign in to access your personal collection of liked tracks.',
            })
          }
          className="font-mono text-xs uppercase tracking-[0.14em] py-3 px-8 bg-ink text-canvas hover:opacity-90 font-semibold cursor-pointer shadow-sm"
        >
          Sign In / Register
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 select-none">
      {/* ===================== HERO HEADER ===================== */}
      <div className="border border-line bg-panel p-6 sm:p-10 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-8 relative z-10">
          {/* Gradient Cover Container */}
          <div className="w-44 h-44 sm:w-52 sm:h-52 shrink-0 bg-gradient-to-br from-indigo-800 via-indigo-600 to-blue-500 border border-line shadow-md overflow-hidden relative flex items-center justify-center select-none shadow-inner">
            <div className="text-white scale-125 transform hover:scale-135 transition-transform duration-200">
              <HeartIconSVG filled={true} className="w-16 h-16 drop-shadow-md" />
            </div>
          </div>

          {/* Details & Actions */}
          <div className="flex-1 flex flex-col justify-end gap-3 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2.5 flex-wrap font-mono text-[9px] uppercase tracking-[0.16em]">
              <span className="px-2.5 py-0.5 border border-line bg-canvas text-blue font-semibold">
                Collection
              </span>
              <span className="px-2 py-0.5 border border-line text-ink-soft">
                Private
              </span>
            </div>

            {/* Title */}
            <h1 className="font-serif italic text-3xl sm:text-5xl text-ink tracking-tight leading-tight truncate">
              Liked Songs
            </h1>

            {/* User Attribution & Total Stats */}
            <div className="flex items-center gap-2.5 flex-wrap font-mono text-xs text-ink-soft pt-1">
              <span className="text-ink font-serif italic text-sm">
                {user?.displayName || 'Your Favorites'}
              </span>
              <span>&bull;</span>
              <span>
                {totalCutsCount} {totalCutsCount === 1 ? 'Cut' : 'Cuts'}
              </span>
              <span>&bull;</span>
              <span>{formatTotalDuration(totalDurationSeconds)}</span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-3 flex-wrap">
              {totalCutsCount > 0 && (
                <>
                  {/* Play All */}
                  <button
                    type="button"
                    onClick={handlePlayAll}
                    className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-6 bg-blue text-canvas hover:opacity-90 transition-opacity font-semibold shadow-2xs flex items-center gap-2 cursor-pointer"
                  >
                    {isPlayingThisContext ? (
                      <PauseIconSVG className="w-4 h-4" />
                    ) : (
                      <PlayIconSVG className="w-4 h-4" />
                    )}
                    <span>{isPlayingThisContext ? 'Pause' : 'Play All'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== FILTER & SORT TOOLBAR ===================== */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-line pb-4">
        {/* Search within Liked Songs */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter liked tracks by title, artist..."
            className="w-full pl-9 pr-4 py-2 border border-line bg-canvas text-ink placeholder:text-ink-soft/60 font-mono text-xs focus:outline-none focus:border-ink transition-colors"
          />
          <div className="absolute left-3 top-2.5 text-ink-soft pointer-events-none">
            <SearchIconSVG className="w-4 h-4" />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-ink-soft hover:text-ink font-mono text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft flex items-center gap-1">
            <SortIconSVG className="w-3.5 h-3.5" />
            Sort:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="font-mono text-xs border border-line bg-canvas text-ink py-1.5 px-3 focus:outline-none focus:border-ink cursor-pointer"
          >
            <option value="recent">Date Added</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="album">Album</option>
            <option value="duration">Duration</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="font-mono text-xs border border-line bg-canvas hover:bg-canvas-deep px-2.5 py-1.5 text-ink-soft hover:text-ink cursor-pointer"
            title={`Toggle order (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* ===================== TRACKLIST SECTION ===================== */}
      <div className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-serif italic font-medium text-xl text-ink">
              Tracklist
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
              {filteredAndSortedSongs.length}{' '}
              {filteredAndSortedSongs.length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-16 border border-line/40 bg-panel/50 animate-pulse"
              />
            ))}
          </div>
        ) : errorMsg ? (
          <div className="p-6 border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-mono text-xs">
            {errorMsg}
          </div>
        ) : filteredAndSortedSongs.length === 0 ? (
          <div className="border border-line bg-panel p-12 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-canvas-deep flex items-center justify-center text-ink-soft">
              <DiscIconSVG className="w-6 h-6" />
            </div>
            {searchQuery ? (
              <>
                <h3 className="font-serif italic text-lg text-ink">
                  No matching tracks found
                </h3>
                <p className="font-sans text-xs text-ink-soft">
                  No liked songs match your query "{searchQuery}".
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="font-mono text-xs text-blue hover:underline cursor-pointer"
                >
                  Clear filter
                </button>
              </>
            ) : (
              <>
                <h3 className="font-serif italic text-lg text-ink">
                  Songs you like will appear here
                </h3>
                <p className="font-sans text-xs text-ink-soft max-w-sm mx-auto">
                  Save songs by tapping the heart icon on any release, album, or player cut across Groovy.
                </p>
                <Link
                  to="/search"
                  className="inline-block mt-2 font-mono text-xs uppercase tracking-[0.14em] py-2 px-5 border border-line bg-canvas hover:bg-canvas-deep text-ink cursor-pointer transition-colors"
                >
                  Explore Music
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="border border-line bg-panel overflow-hidden shadow-2xs divide-y divide-line/40">
            {filteredAndSortedSongs.map((song, idx) => {
              const primaryCredits =
                song.credits?.filter((c) => c.role === 'PRIMARY') || []
              const featuredCredits =
                song.credits?.filter((c) => c.role === 'FEATURED') || []
              const producerCredits =
                song.credits?.filter((c) => c.role === 'PRODUCER') || []

              return (
                <div
                  key={song.id}
                  className="relative group transition-colors hover:bg-canvas-deep/40"
                >
                  <SongRow
                    track={toPlayerTrack(song)}
                    index={idx}
                    trackNumberDisplay={idx + 1}
                    variant="playlist"
                    playsCount={song.playsCount}
                    primaryCredits={primaryCredits}
                    featuredCredits={featuredCredits}
                    producerCredits={producerCredits}
                    onPlay={() => handlePlaySong(song, idx)}
                    customActions={[
                      {
                        label: 'Remove from Liked Songs',
                        icon: <HeartIconSVG filled={false} className="w-3.5 h-3.5 text-red-500" />,
                        danger: true,
                        onClick: () => handleTrackUnlike(song.id),
                      },
                    ]}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
