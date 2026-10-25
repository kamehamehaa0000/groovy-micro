import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowDown, ArrowUp, Shuffle, X } from 'lucide-react'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { usePlayerStore } from '../stores/player.store'
import { useLikesStore } from '../stores/likes.store'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import { shuffleArray } from '../lib/shuffle'
import type { EnrichedSong } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { SongRow } from '../components/common/SongRow'
import { LikedSongsCover } from '../components/LikeSongsCover'
import {
  HeartIconSVG,
  SearchIconSVG,
  SortIconSVG,
  DiscIconSVG,
} from '../components/icons'
import { CollectionActionBar, CollectionHeader } from '../components/collection'
import {
  Badge,
  Button,
  Eyebrow,
  IconButton,
  Input,
  Select,
} from '../components/ui'

export const Route = createFileRoute('/liked')({
  component: LikedSongsPage,
})

type LikedSort = 'recent' | 'title' | 'artist' | 'album' | 'duration'

function LikedSongsPage() {
  const { isAuthenticated, user, isLoading: isAuthLoading } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  const [songs, setSongs] = useState<EnrichedSong[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<LikedSort>('recent')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [isShuffleOn, setIsShuffleOn] = useState(false)

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
      scope: s.scope || 'GLOBAL',
      credits: s.credits,
    }
  }, [])

  // Everything currently liked, independent of the search filter.
  const librarySongs = useMemo(
    () => songs.filter((s) => likedSongIds.has(s.id)),
    [songs, likedSongIds],
  )

  // Sort once so the hero's play queue and the visible list share the order.
  const sortedSongs = useMemo(() => {
    return [...librarySongs].sort((a, b) => {
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
  }, [librarySongs, sortBy, sortOrder])

  // Apply the search filter on top of the sorted library.
  const filteredAndSortedSongs = useMemo(() => {
    if (!searchQuery.trim()) return sortedSongs

    const q = searchQuery.toLowerCase().trim()
    return sortedSongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artistStageName && s.artistStageName.toLowerCase().includes(q)) ||
        (s.albumTitle && s.albumTitle.toLowerCase().includes(q)),
    )
  }, [sortedSongs, searchQuery])

  // Hero stats describe the whole collection; the tracklist count describes
  // the current search result.
  const libraryCutsCount = librarySongs.length
  const libraryDurationSeconds = useMemo(() => {
    return librarySongs.reduce((acc, s) => acc + (s.durationSeconds || 0), 0)
  }, [librarySongs])
  const totalCutsCount = filteredAndSortedSongs.length

  // Play All (ignores the search filter, like the rest of the app)
  const handlePlayAll = () => {
    if (sortedSongs.length === 0) return
    if (isPlayingThisContext) {
      togglePlay()
      return
    }

    const queue = isShuffleOn ? shuffleArray(sortedSongs) : sortedSongs
    const playerTracks = queue.map(toPlayerTrack)
    playTrack(playerTracks[0], playerTracks, 0, 'library:liked', 'Liked Songs')
  }

  // Play specific track from row
  const handlePlaySong = (song: EnrichedSong, index: number) => {
    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    const playerTracks = filteredAndSortedSongs.map(toPlayerTrack)
    playTrack(
      playerTracks[index],
      playerTracks,
      index,
      'library:liked',
      'Liked Songs',
    )
  }

  // Unliking a track (row heart or action menu) removes it from the shared
  // store, which is the single source of truth for this list.

  // Unauthenticated view
  if (!isAuthenticated && !isAuthLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HeartIconSVG filled className="h-9 w-9" />
          </span>
          <Eyebrow
            as="span"
            tone="brand"
            className="mb-2 block tracking-widest"
          >
            Collection
          </Eyebrow>
          <h1 className="font-serif italic text-3xl text-foreground">
            Your Liked Songs
          </h1>
          <p className="mt-3 font-sans text-body leading-relaxed text-muted-foreground">
            Sign in or create an account to view and play all tracks you've
            saved across your listening sessions.
          </p>
          <Button
            variant="primary"
            size="md"
            className="mt-8"
            onClick={() =>
              openAuthModal({
                category: 'Favorites & Library',
                title: 'Access your Liked Songs',
                subtitle: 'Authentication Required',
                description:
                  'Sign in to access your personal collection of liked tracks.',
              })
            }
          >
            Sign in / Register
          </Button>
        </div>
      </div>
    )
  }

  const displayName = user?.displayName || 'Your Favorites'
  const hasSongs = libraryCutsCount > 0
  const showToolbar = isLoading || hasSongs || searchQuery.length > 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 select-none sm:px-8 sm:pt-10">
      {/* ===================== COLLECTION HERO HEADER ===================== */}
      <CollectionHeader
        className="-mx-4 sm:-mx-8"
        stickyClassName="-mx-4 sm:-mx-8"
        title="Liked Songs"
        eyebrow={
          <Eyebrow
            as="span"
            tone="brand"
            className="font-semibold tracking-widest"
          >
            Collection
          </Eyebrow>
        }
        badges={<Badge tone="warning">Private</Badge>}
        cover={<LikedSongsCover accentColor="#6d78f0" />}
        meta={
          <>
            <span className="max-w-full truncate font-sans text-caption text-muted-foreground">
              {displayName}
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>
                {libraryCutsCount} {libraryCutsCount === 1 ? 'Cut' : 'Cuts'}
              </span>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>{formatDuration(libraryDurationSeconds)}</span>
            </span>
          </>
        }
        stickySubtitle={displayName}
        stickyThumbnail={<LikedSongsCover />}
      />

      {/* ===================== COLLECTION CONTROLS ===================== */}
      <CollectionActionBar
        className="pt-3.5 pb-2 md:pt-2 md:pb-5"
        onPlay={hasSongs ? handlePlayAll : undefined}
        isPlaying={isPlayingThisContext}
        playLabel="Liked Songs"
        adjacentAction={
          <IconButton
            size="lg"
            className={
              isShuffleOn ? 'group text-primary! hover:text-primary!' : 'group'
            }
            aria-label={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
            title={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
            aria-pressed={isShuffleOn}
            onClick={() => setIsShuffleOn((prev) => !prev)}
          >
            <Shuffle className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
          </IconButton>
        }
      />

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="mt-6 space-y-8 sm:mt-10">
        {/* ===================== FILTER & SORT TOOLBAR ===================== */}
        {showToolbar ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <SearchIconSVG className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search liked songs"
                aria-label="Search liked songs"
                className="pl-9 pr-9"
              />
              {searchQuery ? (
                <IconButton
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                <SortIconSVG className="h-3.5 w-3.5" />
                Sort
              </span>
              <div className="w-40 shrink-0">
                <Select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as LikedSort)
                  }
                  aria-label="Sort liked songs"
                  className="pr-8"
                >
                  <option value="recent">Date Added</option>
                  <option value="title">Title</option>
                  <option value="artist">Artist</option>
                  <option value="album">Album</option>
                  <option value="duration">Duration</option>
                </Select>
              </div>
              <IconButton
                size="sm"
                aria-label={
                  sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'
                }
                title={
                  sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'
                }
                onClick={() =>
                  setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                }
              >
                {sortOrder === 'asc' ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </IconButton>
            </div>
          </div>
        ) : null}

        {/* ===================== TRACKLIST SECTION ===================== */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-sans text-heading font-semibold text-foreground">
              Tracklist
            </h2>
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
              {totalCutsCount} {totalCutsCount === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-0.5">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-inset bg-card/40"
                />
              ))}
            </div>
          ) : errorMsg ? (
            <div className="rounded-surface border border-destructive/30 bg-destructive-soft p-4 font-sans text-caption text-destructive">
              {errorMsg}
            </div>
          ) : totalCutsCount === 0 ? (
            <div className="overflow-hidden rounded-surface border border-dashed border-border bg-card/40 p-10 text-center sm:p-12">
              <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <DiscIconSVG className="h-5 w-5" />
              </span>
              {searchQuery ? (
                <>
                  <p className="font-serif italic text-title text-foreground">
                    No matching tracks found
                  </p>
                  <p className="mt-1 font-sans text-caption text-muted-foreground">
                    No liked songs match "{searchQuery}".
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear filter
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-serif italic text-title text-foreground">
                    Songs you like will appear here
                  </p>
                  <p className="mx-auto mt-1 max-w-sm font-sans text-caption text-muted-foreground">
                    Save songs by tapping the heart icon on any release, album,
                    or player cut across Groovy.
                  </p>
                  <Link
                    to="/search"
                    className="mt-4 inline-block rounded-control border border-border bg-card px-4 py-2 font-eyebrow text-eyebrow uppercase tracking-wider text-foreground transition-colors hover:bg-background"
                  >
                    Explore Music
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-surface">
              {/* Desktop Tracklist Column Header */}
              <div className="hidden items-center justify-between gap-4 border-b border-border/60 px-2 py-2.5 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground sm:flex sm:px-3">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="w-6 text-center">#</span>
                  <span>Title &amp; Artist</span>
                </div>
                <div className="w-24 text-right">Streams</div>
                <div className="flex min-w-30 shrink-0 items-center justify-end gap-3 pr-2 sm:gap-4">
                  <span>Duration</span>
                </div>
              </div>

              <div className="relative space-y-0.5">
                {filteredAndSortedSongs.map((song, idx) => (
                  <SongRow
                    key={song.id}
                    track={toPlayerTrack(song)}
                    index={idx}
                    trackNumberDisplay={idx + 1}
                    variant="playlist"
                    surface="transparent"
                    density="compact"
                    playsCount={song.playsCount}
                    onPlay={() => handlePlaySong(song, idx)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
