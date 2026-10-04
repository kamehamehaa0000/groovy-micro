import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import { artistsApi } from '../lib/artists.api'
import type { AlbumDetail, EnrichedSong } from '../types/catalog'
import {
  VerifiedBadgeSVG,
  PlayIconSVG,
  HeartIconSVG,
  SvgArtworkSpiral,
  CalendarIconSVG,
} from '../components/icons'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { ProceduralCover } from '../components/common/ProceduralCover'
import type { PlayerTrack } from '../types/player'
import { CommentSection } from '../components/comments/CommentSection'
import { SongRow } from '../components/common/SongRow'

export const Route = createFileRoute('/albums/$idOrSlug')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { shareToken?: string } => ({
    shareToken: (search.shareToken as string) || undefined,
  }),
  component: AlbumDetailComponent,
})

function AlbumDetailComponent() {
  const { idOrSlug } = Route.useParams()
  const { shareToken } = Route.useSearch()
  const { isAuthenticated, user } = useAuthStore()

  // High-performance client-side likes store
  const likedAlbumIds = useLikesStore((s) => s.likedAlbumIds)
  const toggleAlbumLike = useLikesStore((s) => s.toggleAlbumLike)
  const hydrateAlbums = useLikesStore((s) => s.hydrateAlbums)
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  // High-performance client-side pre-saves store
  const preSavedAlbumIds = usePreSavesStore((s) => s.preSavedAlbumIds)
  const togglePreSaveStore = usePreSavesStore((s) => s.togglePreSave)
  const hydratePreSavedAlbums = usePreSavesStore((s) => s.hydrateAlbums)

  const [album, setAlbum] = useState<AlbumDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isCreator, setIsCreator] = useState(false)

  // Likes state
  const isLiked = album ? likedAlbumIds.has(album.id) : false
  const [likesCount, setLikesCount] = useState(0)
  const [isLikeLoading, setIsLikeLoading] = useState(false)

  // Pre-save state
  const isPreSaved = album ? preSavedAlbumIds.has(album.id) : false
  const [preSavesCount, setPreSavesCount] = useState(0)
  const [isPreSaveLoading, setIsPreSaveLoading] = useState(false)

  // Player store state & actions
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Share feedback
  const [copiedLink, setCopiedLink] = useState(false)

  // Live drop countdown timer
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
    totalMs: number
  } | null>(null)

  useEffect(() => {
    if (!album?.isUpcoming || !album?.scheduledReleaseAt) {
      setTimeLeft(null)
      return
    }

    const target = new Date(album.scheduledReleaseAt).getTime()

    const updateTimer = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 })
        // Auto-refresh album to unlock playback upon drop
        catalogApi
          .getAlbum(idOrSlug, shareToken)
          .then((data) => {
            setAlbum(data)
            setLikesCount(data.likesCount ?? 0)
            setPreSavesCount(data.preSavesCount ?? 0)
            if (data.isLiked) {
              hydrateAlbums([{ id: data.id, isLiked: true }])
            }
          })
          .catch(() => {})
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((diff / (1000 * 60)) % 60)
      const seconds = Math.floor((diff / 1000) % 60)
      setTimeLeft({ days, hours, minutes, seconds, totalMs: diff })
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [album?.isUpcoming, album?.scheduledReleaseAt, idOrSlug, shareToken])

  // Check creator / artist privileges for governance
  useEffect(() => {
    if (!isAuthenticated || !user || !album) {
      setIsCreator(false)
      return
    }
    if (user.role === 'ADMIN') {
      setIsCreator(true)
      return
    }
    if (user.role === 'ARTIST') {
      artistsApi
        .getMyProfile()
        .then((p) => {
          if (p && p.id === album.artistId) {
            setIsCreator(true)
          }
        })
        .catch(() => setIsCreator(false))
    }
  }, [user, album, isAuthenticated])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setErrorMsg(null)

    catalogApi
      .getAlbum(idOrSlug, shareToken)
      .then((data) => {
        if (!isMounted) return
        setAlbum(data)
        setLikesCount(data.likesCount ?? 0)
        setPreSavesCount(data.preSavesCount ?? 0)

        // Hydrate global likes store
        if (data.isLiked) {
          hydrateAlbums([{ id: data.id, isLiked: true }])
        }
        if (data.isPreSaved) {
          hydratePreSavedAlbums([{ id: data.id, isPreSaved: true }])
        }
        if (data.tracks?.length) {
          hydrateSongs(data.tracks)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setErrorMsg(err.message || 'Failed to load album details')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [idOrSlug, shareToken, hydrateAlbums, hydrateSongs])

  const handleToggleAlbumLike = async () => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Release Library',
        subtitle: 'Album',
        title: 'Save to your library.',
        description:
          'Sign in or create an account to like albums, save releases, and keep your library organized.',
      })
      return
    }
    if (!album || isLikeLoading) return

    setIsLikeLoading(true)
    const prevLiked = isLiked
    const prevCount = likesCount

    // Optimistically update count
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1)

    try {
      const res = await toggleAlbumLike(album.id)
      setLikesCount(res.likesCount)
    } catch (err: any) {
      // Revert count on error
      setLikesCount(prevCount)
      alert(err.message || 'Could not update like status')
    } finally {
      setIsLikeLoading(false)
    }
  }

  const handleTogglePreSave = async () => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Upcoming Release',
        subtitle: 'Pre-Save',
        title: 'Pre-save this album.',
        description:
          'Sign in or create an account to pre-save this upcoming release and have it automatically added to your library on drop day.',
      })
      return
    }
    if (!album || isPreSaveLoading) return

    setIsPreSaveLoading(true)
    const prevCount = preSavesCount
    const willBePreSaved = !isPreSaved

    // Optimistic count update (Zustand store instantly updates preSavedAlbumIds Set)
    setPreSavesCount(
      willBePreSaved ? prevCount + 1 : Math.max(0, prevCount - 1),
    )

    try {
      const res = await togglePreSaveStore(album.id)
      setPreSavesCount(res.preSavesCount)
    } catch (err: any) {
      // Rollback count (store handles preSavedAlbumIds rollback)
      setPreSavesCount(prevCount)
      alert(err.message || 'Could not update pre-save status')
    } finally {
      setIsPreSaveLoading(false)
    }
  }

  const toPlayerTrack = (song: EnrichedSong): PlayerTrack => ({
    id: song.id,
    title: song.title,
    artistId: album?.artistId || '',
    artistName: album?.artistStageName || '',
    artistSlug: album?.artistSlug,
    albumId: album?.id,
    albumTitle: album?.title,
    albumSlug: album?.slug,
    coverImageUrl: song.coverImageUrl || album?.coverImageUrl,
    durationSeconds: song.durationSeconds,
    audioUrl: song.audioUrl,
    hlsManifestUrl: song.hlsManifestUrl,
    rawAudioKey: song.rawAudioKey,
    isExplicit: song.isExplicit,
    credits: song.credits,
    isStreamable: isCreator
      ? true
      : song.isStreamable !== false && !album?.isUpcoming,
  })

  const handlePlaySong = (song: EnrichedSong, index: number) => {
    const isLocked =
      (album?.isUpcoming || song.isStreamable === false) && !isCreator
    if (isLocked) {
      alert('This master cut is locked until the scheduled release date.')
      return
    }

    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    if (!album) return
    const contextTracks = (album.tracks || []).map(toPlayerTrack)
    playTrack(
      toPlayerTrack(song),
      contextTracks,
      index,
      `album:${album.id}`,
      album.title,
    )
  }

  const handlePlayAlbumFromStart = () => {
    if (album?.isUpcoming && !isCreator) {
      handleTogglePreSave()
      return
    }
    if (!album || !album.tracks || album.tracks.length === 0) return
    const firstPlayableIdx = album.tracks.findIndex(
      (t) => isCreator || t.isStreamable !== false,
    )
    if (firstPlayableIdx >= 0) {
      handlePlaySong(album.tracks[firstPlayableIdx], firstPlayableIdx)
    } else {
      alert('No streamable audio files found for this release yet.')
    }
  }

  const handleCopyShareLink = async () => {
    if (typeof window === 'undefined') return

    let shareUrl = window.location.href
    if (
      album?.visibility === 'UNLISTED' &&
      album.shareToken &&
      !window.location.search.includes('shareToken')
    ) {
      shareUrl = `${window.location.origin}/albums/${album.slug}?shareToken=${album.shareToken}`
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: album?.title,
          text: album
            ? `Listen to ${album.title} by ${album.artistStageName} on Groovy`
            : undefined,
          url: shareUrl,
        })
        return
      } catch {
        // Fallback to clipboard
      }
    }

    await navigator.clipboard.writeText(shareUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
        Retrieving master recording & liner notes...
      </div>
    )
  }

  if (errorMsg || !album) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-blue block mb-2">
          404 Catalog Notice
        </span>
        <h1 className="font-serif italic text-3xl text-ink">
          Release Not Found
        </h1>
        <p className="font-sans text-xs text-ink-soft mt-3 leading-relaxed">
          The requested album identifier{' '}
          <span className="font-mono text-ink">"{idOrSlug}"</span> could not be
          located in the master archive.
        </p>
        <Link
          to="/"
          className="inline-block mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors rounded"
        >
          &larr; Return to Catalog
        </Link>
      </div>
    )
  }

  const releaseYear = album.releaseDate
    ? new Date(album.releaseDate).getFullYear()
    : new Date(album.createdAt).getFullYear()

  const totalPlays =
    album.totalPlays ??
    (album.tracks ?? []).reduce((acc, t) => acc + (t.playsCount || 0), 0)

  return (
    <div className="w-full pb-20">
      {/* ===================== ALBUM HERO HEADER ===================== */}
      <section className="relative overflow-hidden border-b border-line bg-canvas">
        {/* Ambient / Atmospheric Banner */}
        <div className="relative h-44 overflow-hidden bg-canvas-deep">
          {album.coverImageUrl ? (
            <img
              src={album.coverImageUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover blur-3xl scale-125 opacity-25 dark:opacity-20 select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full relative flex items-center justify-center">
              <SvgArtworkSpiral />
              <span className="font-serif italic text-4xl sm:text-6xl md:text-7xl text-ink-soft/10 select-none">
                {album.title}
              </span>
            </div>
          )}

          {/* Editorial gradient */}
          <div className="absolute inset-0 bg-linear-to-t from-canvas via-canvas/40 to-transparent" />

          {/* Top-Right Floating Share Button */}
          <div className="absolute top-4 left-4 right-4 flex justify-end pointer-events-none">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="pointer-events-auto inline-flex items-center justify-center min-h-9 px-3.5 border border-line bg-canvas/80 backdrop-blur-xs font-mono text-[10px] uppercase tracking-[0.12em] text-ink hover:bg-canvas transition-colors shadow-2xs cursor-pointer rounded"
            >
              {copiedLink ? '✓ Copied' : 'Share'}
            </button>
          </div>
        </div>

        {/* Identity & Metadata Container */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="relative -mt-16 sm:-mt-24 md:-mt-28 pb-6 sm:pb-8 flex flex-col md:flex-row md:items-end gap-6 sm:gap-8">
            {/* Cover Art Container */}
            <div className="w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 rounded-md bg-canvas-deep border border-line shadow-md overflow-hidden shrink-0 relative group mx-auto md:mx-0">
              {album.coverImageUrl ? (
                <img
                  src={album.coverImageUrl}
                  alt={album.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <ProceduralCover
                  size="xl"
                  title={album.title}
                  artistName={album.artistStageName}
                  className="w-full h-full rounded-none text-2xl"
                />
              )}
            </div>

            {/* Release Identity & Details */}
            <div className="min-w-0 flex-1 flex flex-col justify-end text-center md:text-left">
              {/* Badges / Eyebrow */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-line bg-canvas text-blue font-semibold rounded">
                  {album.albumType}
                </span>
                {(album as any).scope === 'PERSONAL' && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold rounded">
                    Personal Collection
                  </span>
                )}
                {album.isUpcoming && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-blue/30 bg-blue/10 text-blue font-semibold flex items-center gap-1 rounded">
                    <CalendarIconSVG className="w-2.5 h-2.5" />
                    <span>Upcoming Drop</span>
                  </span>
                )}
                {album.visibility === 'UNLISTED' && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold rounded">
                    🔗 Unlisted Link
                  </span>
                )}
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                  Master Recording &bull; {releaseYear}
                </span>
              </div>

              {/* Title */}
              <h1 className="font-serif italic text-3xl sm:text-5xl md:text-6xl leading-[0.95] tracking-[-0.03em] text-ink wrap-break-words">
                {album.title}
              </h1>

              {/* Artist Attribution & Aggregate Stats */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2.5 gap-y-1.5 mt-3 font-mono text-[10px] sm:text-[11px] text-ink-soft">
                <Link
                  to="/artists/$idOrSlug"
                  params={{ idOrSlug: album.artistSlug }}
                  className="font-serif italic text-base sm:text-lg text-ink hover:text-blue transition-colors inline-flex items-center gap-1.5"
                >
                  <span>{album.artistStageName}</span>
                  {album.artistVerified && (
                    <VerifiedBadgeSVG className="w-3.5 h-3.5 text-blue" />
                  )}
                </Link>

                <span className="text-ink-soft/50">·</span>

                <span>
                  {album.totalTracks}{' '}
                  {album.totalTracks === 1 ? 'Track' : 'Tracks'}
                </span>

                <span className="text-ink-soft/50">·</span>

                <span>{formatDuration(album.totalDurationSeconds)}</span>

                <span className="text-ink-soft/50">·</span>

                <span>
                  {totalPlays.toLocaleString()}{' '}
                  {totalPlays === 1 ? 'stream' : 'streams'}
                </span>
              </div>

              {album.description && (
                <p className="font-sans text-xs text-ink-soft leading-relaxed mt-2.5 max-w-2xl mx-auto md:mx-0">
                  {album.description}
                </p>
              )}

              {/* Actions Bar */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-center md:justify-start gap-2 pt-4">
                {album.isUpcoming && !isCreator ? (
                  <button
                    type="button"
                    disabled={isPreSaveLoading}
                    onClick={handleTogglePreSave}
                    className={`rounded inline-flex items-center justify-center gap-2 min-h-10 px-5 sm:px-6 font-mono text-[10px] uppercase tracking-[0.12em] font-semibold transition-all shadow-2xs cursor-pointer ${
                      isPreSaved
                        ? 'border border-blue bg-blue text-canvas hover:opacity-90'
                        : 'bg-ink text-canvas hover:opacity-90'
                    }`}
                  >
                    <span>
                      {isPreSaved ? '✓ Pre-Saved' : '✦ Pre-Save Release'}
                    </span>
                    <span className="opacity-80 font-mono text-[9px]">
                      ({preSavesCount})
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePlayAlbumFromStart}
                    className="rounded inline-flex items-center justify-center gap-2 min-h-10 px-5 sm:px-6 bg-blue text-canvas font-mono text-[10px] uppercase tracking-[0.12em] font-semibold hover:opacity-90 transition-opacity shadow-2xs cursor-pointer"
                  >
                    <PlayIconSVG className="w-3.5 h-3.5" />
                    <span>
                      {album.isUpcoming && isCreator
                        ? 'Audition Release'
                        : 'Play Release'}
                    </span>
                  </button>
                )}

                {!album.isUpcoming && (
                  <button
                    type="button"
                    disabled={isLikeLoading}
                    onClick={handleToggleAlbumLike}
                    className={`rounded inline-flex items-center justify-center gap-2 min-h-10 px-4 sm:px-5 font-mono text-[10px] uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                      isLiked
                        ? 'border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-600 hover:border-red-400'
                        : 'border border-line bg-panel text-ink hover:border-ink'
                    }`}
                  >
                    <HeartIconSVG
                      filled={isLiked}
                      className={`w-3.5 h-3.5 ${isLiked ? 'text-red-500' : 'text-ink-soft'}`}
                    />
                    <span>{likesCount.toLocaleString()}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 sm:mt-10 space-y-8">
        {/* ===================== UPCOMING RELEASE BANNER ===================== */}
        {album.isUpcoming && (
          <div className="border border-blue/30 bg-blue/5 hover:border-blue/60 transition-colors rounded-lg p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-2xs">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-blue font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue animate-ping" />
                <span>Upcoming Scheduled Drop &bull; Master Vault Locked</span>
              </div>
              <h2 className="font-serif italic text-lg sm:text-xl text-ink font-semibold">
                Official Drop:{' '}
                {album.scheduledReleaseAt
                  ? new Date(album.scheduledReleaseAt).toLocaleString(
                      undefined,
                      {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      },
                    )
                  : 'Coming Soon'}
              </h2>
              {timeLeft && timeLeft.totalMs > 0 && (
                <div className="pt-1">
                  <div className="grid grid-cols-4 gap-2 max-w-xs">
                    <div className="border border-blue/30 bg-blue/10 p-2 text-center rounded-md">
                      <span className="font-mono text-base sm:text-lg font-bold text-blue block leading-none">
                        {timeLeft.days}
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft">
                        Days
                      </span>
                    </div>
                    <div className="border border-blue/30 bg-blue/10 p-2 text-center rounded-md">
                      <span className="font-mono text-base sm:text-lg font-bold text-blue block leading-none">
                        {String(timeLeft.hours).padStart(2, '0')}
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft">
                        Hours
                      </span>
                    </div>
                    <div className="border border-blue/30 bg-blue/10 p-2 text-center rounded-md">
                      <span className="font-mono text-base sm:text-lg font-bold text-blue block leading-none">
                        {String(timeLeft.minutes).padStart(2, '0')}
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft">
                        Mins
                      </span>
                    </div>
                    <div className="border border-blue/30 bg-blue/10 p-2 text-center rounded-md">
                      <span className="font-mono text-base sm:text-lg font-bold text-blue block leading-none">
                        {String(timeLeft.seconds).padStart(2, '0')}
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft">
                        Secs
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <p className="font-mono text-[10px] text-ink-soft leading-relaxed max-w-xl">
                Lossless master audio streams unlock automatically on release
                date. Pre-save now to add this {album.albumType.toLowerCase()}{' '}
                to your library immediately upon drop.
              </p>
            </div>

            <div className="w-full md:w-auto shrink-0">
              <button
                type="button"
                disabled={isPreSaveLoading}
                onClick={handleTogglePreSave}
                className={`w-full md:w-auto rounded font-mono text-[10px] uppercase tracking-[0.14em] py-2.5 px-6 border transition-all cursor-pointer font-semibold shadow-2xs flex items-center justify-center gap-2 ${
                  isPreSaved
                    ? 'border-blue bg-blue text-canvas hover:opacity-90'
                    : 'border-ink bg-ink text-canvas hover:opacity-90'
                }`}
              >
                <span>
                  {isPreSaved ? '✓ Pre-Saved to Library' : '✦ Pre-Save Release'}
                </span>
                <span className="opacity-75 font-mono text-[10px]">
                  ({preSavesCount})
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TRACKLIST SECTION ===================== */}
        <div className="space-y-3 px-1">
          <div className="flex justify-between items-baseline border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-serif italic text-xl sm:text-2xl text-ink font-semibold">
                Master Tracklist
              </h2>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
              {(album.tracks ?? []).length}{' '}
              {(album.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {(album.tracks ?? []).length === 0 ? (
            <div className="p-8 border border-dashed border-line bg-panel/30 text-center rounded-md">
              <p className="font-serif italic text-base text-ink">
                No tracks uploaded to this release yet.
              </p>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft mt-1">
                Check back soon as the master tape transfers complete.
              </p>
            </div>
          ) : (
            <div className="border border-line rounded-md overflow-clip bg-panel divide-y divide-line/60 shadow-2xs">
              {/* Desktop Tracklist Column Header */}
              <div className="hidden sm:flex items-center justify-between gap-4 px-5 sm:px-6 py-2.5 border-b border-line/60 bg-canvas/40 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="w-6 text-center">#</span>
                  <span>Title &amp; Credits</span>
                </div>
                <div className="w-24 text-right">Streams</div>
                <div className="flex items-center justify-end gap-3 sm:gap-4 shrink-0 min-w-[120px] pr-2">
                  <span>Duration</span>
                </div>
              </div>

              <div className="divide-y divide-line/60">
                {(album.tracks ?? []).map((track, idx) => {
                  const primaryCredits =
                    track.credits?.filter((c) => c.role === 'PRIMARY') || []
                  const featuredCredits =
                    track.credits?.filter((c) => c.role === 'FEATURED') || []
                  const producerCredits =
                    track.credits?.filter((c) => c.role === 'PRODUCER') || []

                  return (
                    <SongRow
                      key={track.id}
                      track={toPlayerTrack(track)}
                      index={idx}
                      trackNumberDisplay={track.trackNumber || idx + 1}
                      variant="album"
                      playsCount={track.playsCount}
                      primaryCredits={primaryCredits}
                      featuredCredits={featuredCredits}
                      producerCredits={producerCredits}
                      scheduledReleaseAt={
                        album.isUpcoming && !isCreator
                          ? album.scheduledReleaseAt
                          : undefined
                      }
                      onPlay={() => handlePlaySong(track, idx)}
                      hideGoToAlbum={true}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Nested Comments Subsystem */}
        <CommentSection
          targetType="album"
          targetId={album.id}
          allowComments={album.allowComments ?? true}
          isCreatorOrOwner={isCreator}
        />
      </div>
    </div>
  )
}
