import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ListPlus,
  PlusCircle,
  Shuffle,
  X,
} from 'lucide-react'
import { usePlayerStore } from '../stores/player.store'
import { useLikesStore } from '../stores/likes.store'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../stores/create-playlist-modal.store'
import { useAddToPlaylistModalStore } from '../stores/add-to-playlist-modal.store'
import { formatDuration } from '../lib/catalog.api'
import { shuffleArray } from '../lib/shuffle'
import {
  recommendationsApi,
  type ScoredRecommendationTrack,
} from '../lib/recommendations.api'
import type { PlayerTrack } from '../types/player'
import { SongRow } from '../components/common/SongRow'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { CollectionActionBar, CollectionHeader } from '../components/collection'
import {
  Badge,
  Button,
  Eyebrow,
  IconButton,
  Input,
  Select,
} from '../components/ui'
import { DiscIconSVG, SearchIconSVG, SortIconSVG } from '../components/icons'

export const Route = createFileRoute('/radio/$songId')({
  component: RadioMixPage,
})

type RadioSort = 'recommended' | 'title' | 'artist' | 'duration'

function MetaItem({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      <span aria-hidden="true" className="mr-2 text-border">
        &bull;
      </span>
      <span>{children}</span>
    </span>
  )
}

function RadioMixPage() {
  const { songId } = Route.useParams()
  const { isAuthenticated } = useAuthStore()

  const [seedSong, setSeedSong] = useState<ScoredRecommendationTrack | null>(
    null,
  )
  const [tracks, setTracks] = useState<ScoredRecommendationTrack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [isShuffleOn, setIsShuffleOn] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<RadioSort>('recommended')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Player Store
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const contextUri = usePlayerStore((s) => s.contextUri)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Likes Store
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setErrorMsg(null)
    setSeedSong(null)
    setTracks([])

    recommendationsApi
      .getTrackRadio(songId, 25)
      .then((data) => {
        if (!isMounted) return
        setSeedSong(data.seedSong)
        setTracks(data.tracks)

        const all = data.seedSong
          ? [data.seedSong, ...data.tracks]
          : data.tracks
        hydrateSongs(all)
      })
      .catch((err) => {
        console.error('[RadioMixPage] Failed to load radio:', err)
        if (isMounted) {
          setErrorMsg('Failed to load radio mix. Please try again.')
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [songId, hydrateSongs, reloadToken])

  // Close the overflow menu on outside click or Escape.
  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMenuOpen])

  const fullQueue = useMemo<ScoredRecommendationTrack[]>(() => {
    if (!seedSong) return tracks
    return [seedSong, ...tracks]
  }, [seedSong, tracks])

  const totalDurationSeconds = useMemo(() => {
    return fullQueue.reduce((acc, t) => acc + (t.durationSeconds || 0), 0)
  }, [fullQueue])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const visibleQueue = useMemo(() => {
    const filtered = normalizedQuery
      ? fullQueue.filter((track) =>
          [track.title, track.artistStageName, track.albumTitle]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(normalizedQuery)),
        )
      : fullQueue

    if (sortBy === 'recommended') return filtered

    const direction = sortOrder === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortBy === 'duration') {
        return (a.durationSeconds - b.durationSeconds) * direction
      }
      const aValue = sortBy === 'title' ? a.title : a.artistStageName
      const bValue = sortBy === 'title' ? b.title : b.artistStageName
      return aValue.localeCompare(bValue) * direction
    })
  }, [fullQueue, normalizedQuery, sortBy, sortOrder])

  const isRadioPlaying = useMemo(() => {
    return (
      contextUri === `radio:${songId}` &&
      playbackStatus === 'playing' &&
      fullQueue.some((t) => t.id === currentTrack?.id)
    )
  }, [contextUri, songId, playbackStatus, fullQueue, currentTrack])

  const toPlayerTrack = useCallback(
    (s: ScoredRecommendationTrack): PlayerTrack => ({
      id: s.id,
      title: s.title,
      artistId: s.artistId || '',
      artistName: s.artistStageName || 'Unknown Artist',
      artistSlug: s.artistSlug,
      albumId: s.albumId || undefined,
      albumTitle: s.albumTitle || undefined,
      albumSlug: s.albumSlug || undefined,
      coverImageUrl: s.coverImageUrl,
      durationSeconds: s.durationSeconds,
      audioUrl: s.audioUrl,
      hlsManifestUrl: s.hlsManifestUrl,
      isLiked: s.isLiked,
    }),
    [],
  )

  const handlePlayAll = useCallback(() => {
    if (fullQueue.length === 0) return

    if (isRadioPlaying) {
      togglePlay()
      return
    }

    const ordered = fullQueue.map(toPlayerTrack)
    const contextTracks = isShuffleOn ? shuffleArray(ordered) : ordered
    playTrack(
      contextTracks[0],
      contextTracks,
      0,
      `radio:${songId}`,
      `${seedSong?.title || 'Track'} Radio`,
    )
  }, [
    fullQueue,
    isRadioPlaying,
    isShuffleOn,
    songId,
    togglePlay,
    playTrack,
    seedSong,
    toPlayerTrack,
  ])

  const handlePlayTrackAtIndex = useCallback(
    (index: number) => {
      const target = visibleQueue[index]
      if (!target) return

      if (currentTrack?.id === target.id) {
        togglePlay()
        return
      }

      const contextTracks = visibleQueue.map(toPlayerTrack)
      playTrack(
        toPlayerTrack(target),
        contextTracks,
        index,
        `radio:${songId}`,
        `${seedSong?.title || 'Track'} Radio`,
      )
    },
    [
      visibleQueue,
      currentTrack,
      togglePlay,
      toPlayerTrack,
      playTrack,
      songId,
      seedSong,
    ],
  )

  const handleSaveAsPlaylist = useCallback(() => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Playlist Curation',
        subtitle: 'Playlists',
        title: 'Save this radio mix.',
        description:
          'Sign in or create an account to save this mix as a playlist in your library.',
      })
      return
    }

    if (fullQueue.length === 0) return

    const trackIds = Array.from(new Set(fullQueue.map((t) => t.id)))
    useCreatePlaylistModalStore.getState().openModal(trackIds, {
      title: `${seedSong?.title || 'Music'} Radio Mix`,
      description: seedSong
        ? `Radio mix seeded from ${seedSong.title} by ${seedSong.artistStageName}`
        : 'Radio mix from Groovy',
    })
  }, [isAuthenticated, fullQueue, seedSong])

  const handleAddToExistingPlaylist = useCallback(() => {
    setIsMenuOpen(false)
    if (fullQueue.length === 0) return
    useAddToPlaylistModalStore
      .getState()
      .openModalForTracks(
        fullQueue.map(toPlayerTrack),
        `${seedSong?.title || 'Track'} Radio`,
      )
  }, [fullQueue, seedSong, toPlayerTrack])

  const hasTracks = fullQueue.length > 0
  const showToolbar = isLoading || hasTracks || searchQuery.length > 0
  const stickyThumbnail = seedSong?.coverImageUrl ? (
    <img
      src={seedSong.coverImageUrl}
      alt=""
      className="h-full w-full object-cover"
    />
  ) : (
    <ProceduralCover
      title={seedSong?.title || 'Radio'}
      artistName={seedSong?.artistStageName || 'Groovy'}
      fill
    />
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 select-none sm:px-8 sm:pt-10">
      {/* ===================== COLLECTION HERO HEADER ===================== */}
      <CollectionHeader
        className="-mx-4 sm:-mx-8"
        stickyClassName="-mx-4 sm:-mx-8"
        title={seedSong ? `${seedSong.title} Radio` : 'Radio'}
        eyebrow={
          <Eyebrow
            as="span"
            tone="brand"
            className="font-semibold tracking-widest"
          >
            Radio
          </Eyebrow>
        }
        badges={<Badge tone="neutral">Mix</Badge>}
        cover={
          seedSong?.coverImageUrl ? (
            <img
              src={seedSong.coverImageUrl}
              alt={seedSong.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <ProceduralCover
              title={seedSong?.title || 'Radio'}
              artistName={seedSong?.artistStageName || 'Groovy'}
              fill
            />
          )
        }
        backdropImageUrl={seedSong?.coverImageUrl}
        description={
          seedSong ? (
            <>
              Seeded from{' '}
              <span className="font-semibold text-foreground">
                {seedSong.title}
              </span>{' '}
              by{' '}
              <span className="font-semibold text-foreground">
                {seedSong.artistStageName}
              </span>
              . A mix tuned to tempo, mood, and co-listening.
            </>
          ) : (
            'A mix tuned to your listening.'
          )
        }
        meta={
          <>
            <span className="inline-flex items-center whitespace-nowrap">
              {fullQueue.length} {fullQueue.length === 1 ? 'Cut' : 'Cuts'}
            </span>
            {totalDurationSeconds > 0 ? (
              <MetaItem>{formatDuration(totalDurationSeconds)}</MetaItem>
            ) : null}
            {seedSong?.bpm ? <MetaItem>{seedSong.bpm} BPM</MetaItem> : null}
            {seedSong?.moods?.length ? (
              <MetaItem>
                <span className="capitalize">
                  {seedSong.moods.slice(0, 2).join(' · ')}
                </span>
              </MetaItem>
            ) : null}
          </>
        }
        stickySubtitle={seedSong?.artistStageName}
        stickyThumbnail={stickyThumbnail}
      />

      {/* ===================== COLLECTION CONTROLS ===================== */}
      <CollectionActionBar
        className="pt-3.5 pb-2 md:pt-2 md:pb-5"
        onPlay={hasTracks ? handlePlayAll : undefined}
        isPlaying={isRadioPlaying}
        playDisabled={isLoading}
        playLabel={seedSong ? `${seedSong.title} Radio` : 'Radio'}
        adjacentAction={
          <>
            <IconButton
              size="lg"
              className={
                isShuffleOn
                  ? 'group text-primary! hover:text-primary!'
                  : 'group'
              }
              aria-label={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
              title={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
              aria-pressed={isShuffleOn}
              disabled={!hasTracks || isLoading}
              onClick={() => setIsShuffleOn((prev) => !prev)}
            >
              <Shuffle className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
            </IconButton>
            <IconButton
              size="lg"
              aria-label={'Create a playlist from this radio mix'}
              onClick={handleSaveAsPlaylist}
              disabled={!hasTracks || isLoading}
            >
              <ListPlus className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
            </IconButton>
            <IconButton
              size="lg"
              aria-label={'Add to existing playlist'}
              onClick={handleAddToExistingPlaylist}
              disabled={!hasTracks || isLoading}
            >
              <PlusCircle className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
            </IconButton>
          </>
        }
      ></CollectionActionBar>

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="mt-6 space-y-8 sm:mt-10">
        {/* ===================== SEARCH & SORT TOOLBAR ===================== */}
        {showToolbar ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <SearchIconSVG className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search this mix"
                aria-label="Search this mix"
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
              <div className="w-44 shrink-0">
                <Select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as RadioSort)
                  }
                  aria-label="Sort radio tracks"
                  className="pr-8"
                >
                  <option value="recommended">Recommended</option>
                  <option value="title">Title</option>
                  <option value="artist">Artist</option>
                  <option value="duration">Duration</option>
                </Select>
              </div>
              {sortBy !== 'recommended' ? (
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
              ) : null}
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
              {visibleQueue.length} {visibleQueue.length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-0.5">
              {[...Array(8)].map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-inset bg-card/40"
                />
              ))}
            </div>
          ) : errorMsg ? (
            <div className="rounded-surface border border-destructive/30 bg-destructive-soft p-4">
              <p className="font-sans text-caption text-destructive">
                {errorMsg}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setReloadToken((prev) => prev + 1)}
              >
                Try again
              </Button>
            </div>
          ) : !hasTracks ? (
            <div className="overflow-hidden rounded-surface border border-dashed border-border bg-card/40 p-10 text-center sm:p-12">
              <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <DiscIconSVG className="h-5 w-5" />
              </span>
              <p className="font-serif italic text-title text-foreground">
                No radio tracks found
              </p>
              <p className="mx-auto mt-1 max-w-sm font-sans text-caption text-muted-foreground">
                We could not find matching cuts for this song right now.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => setReloadToken((prev) => prev + 1)}
              >
                Try again
              </Button>
            </div>
          ) : visibleQueue.length === 0 ? (
            <div className="overflow-hidden rounded-surface border border-dashed border-border bg-card/40 p-10 text-center sm:p-12">
              <p className="font-serif italic text-title text-foreground">
                No matching tracks
              </p>
              <p className="mt-1 font-sans text-caption text-muted-foreground">
                Nothing in this mix matches "{searchQuery}".
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
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
                {visibleQueue.map((track, idx) => (
                  <SongRow
                    key={track.id}
                    track={toPlayerTrack(track)}
                    index={idx}
                    trackNumberDisplay={idx + 1}
                    variant="playlist"
                    surface="transparent"
                    density="compact"
                    playsCount={track.playsCount}
                    onPlay={() => handlePlayTrackAtIndex(idx)}
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
