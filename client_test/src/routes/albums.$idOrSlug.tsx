import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import { artistsApi } from '../lib/artists.api'
import type { AlbumDetail, EnrichedSong } from '../types/catalog'
import {
  VerifiedBadgeSVG,
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  DiscIconSVG,
  SvgArtworkSpiral,
  LockIconSVG,
  CalendarIconSVG,
} from '../components/icons'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import type { PlayerTrack } from '../types/player'
import { CommentSection } from '../components/comments/CommentSection'
import { SongActionMenu } from '../components/player/SongActionMenu'

export const Route = createFileRoute('/albums/$idOrSlug')({
  validateSearch: (search: Record<string, unknown>): { shareToken?: string } => ({
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
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleAlbumLike = useLikesStore((s) => s.toggleAlbumLike)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
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
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Share feedback
  const [copiedLink, setCopiedLink] = useState(false)

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

  const handleToggleComments = async () => {
    if (!album || !isCreator) return
    const nextVal = !(album.allowComments ?? true)
    try {
      await catalogApi.updateAlbum(album.id, {
        allowComments: nextVal,
      })
      setAlbum((prev) => (prev ? { ...prev, allowComments: nextVal } : null))
    } catch (err: any) {
      alert(err.message || 'Failed to update comment settings')
    }
  }

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

  const handleToggleTrackLike = async (track: EnrichedSong) => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Favorites & Library',
        subtitle: 'Library',
        title: 'Save to your library.',
        description:
          'Sign in or create an account to like tracks, build custom playlists, and sync your music across devices.',
      })
      return
    }

    const wasLiked = likedSongIds.has(track.id)
    const prevCount = track.likesCount

    // Optimistic track count update
    setAlbum((prev) => {
      if (!prev) return null
      return {
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                likesCount: wasLiked
                  ? Math.max(0, prevCount - 1)
                  : prevCount + 1,
              }
            : t,
        ),
      }
    })

    try {
      const res = await toggleSongLike(track.id)
      setAlbum((prev) => {
        if (!prev) return null
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === track.id
              ? { ...t, likesCount: res.likesCount }
              : t,
          ),
        }
      })
    } catch {
      // Rollback count on error
      setAlbum((prev) => {
        if (!prev) return null
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === track.id
              ? { ...t, likesCount: prevCount }
              : t,
          ),
        }
      })
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
    setPreSavesCount(willBePreSaved ? prevCount + 1 : Math.max(0, prevCount - 1))

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
  })

  const handlePlaySong = (song: EnrichedSong, index: number) => {
    if (album?.isUpcoming || song.isStreamable === false) {
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
      album.title
    )
  }

  const handlePlayAlbumFromStart = () => {
    if (album?.isUpcoming) {
      handleTogglePreSave()
      return
    }
    if (!album || !album.tracks || album.tracks.length === 0) return
    const firstPlayableIdx = album.tracks.findIndex(
      (t) => t.isStreamable !== false,
    )
    if (firstPlayableIdx >= 0) {
      handlePlaySong(album.tracks[firstPlayableIdx], firstPlayableIdx)
    } else {
      alert('No streamable audio files found for this release yet.')
    }
  }

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      let shareUrl = window.location.href
      if (
        album?.visibility === 'UNLISTED' &&
        album.shareToken &&
        !window.location.search.includes('shareToken')
      ) {
        shareUrl = `${window.location.origin}/albums/${album.slug}?shareToken=${album.shareToken}`
      }
      navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
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
          className="inline-block mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors"
        >
          &larr; Return to Catalog
        </Link>
      </div>
    )
  }

  const releaseYear = album.releaseDate
    ? new Date(album.releaseDate).getFullYear()
    : new Date(album.createdAt).getFullYear()

  return (
    <div className="w-full pb-20 space-y-10">
      {/* ===================== UPCOMING RELEASE BANNER ===================== */}
      {album.isUpcoming && (
        <div className="border-2 border-blue bg-blue/5 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-blue font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue animate-ping" />
              <span>Upcoming Scheduled Drop &bull; Master Vault Locked</span>
            </div>
            <h2 className="font-serif italic text-xl sm:text-2xl text-ink">
              Official Drop:{' '}
              {album.scheduledReleaseAt
                ? new Date(album.scheduledReleaseAt).toLocaleString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  })
                : 'Coming Soon'}
            </h2>
            <p className="font-mono text-[10px] text-ink-soft">
              Lossless master audio streams unlock automatically on release date. Pre-save now to add this {album.albumType.toLowerCase()} to your library immediately upon drop.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={isPreSaveLoading}
              onClick={handleTogglePreSave}
              className={`font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-6 border transition-all cursor-pointer font-semibold shadow-2xs flex items-center gap-2 ${
                isPreSaved
                  ? 'border-blue bg-blue text-canvas hover:opacity-90'
                  : 'border-ink bg-ink text-canvas hover:opacity-90'
              }`}
            >
              <span>{isPreSaved ? '✓ Pre-Saved to Library' : '✦ Pre-Save Release'}</span>
              <span className="opacity-75 font-mono text-[10px]">({preSavesCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================== ALBUM HERO HEADER ===================== */}
      <div className="border border-line bg-panel p-6 sm:p-10 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-8 relative z-10">
          {/* Cover Art Container with Vinyl Shadow Effect */}
          <div className="relative shrink-0 group">
            <div className="w-48 h-48 sm:w-56 sm:h-56 bg-canvas-deep border border-line shadow-md overflow-hidden relative">
              {album.coverImageUrl ? (
                <img
                  src={album.coverImageUrl}
                  alt={album.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <DiscIconSVG className="w-16 h-16 text-ink-soft/40" />
                </div>
              )}
            </div>

            {/* Simulated Vinyl Record Peek */}
            <div className="hidden sm:block absolute -right-6 top-3 w-48 h-48 -z-10 rounded-full border border-line-soft bg-canvas-deep opacity-60 pointer-events-none transition-transform group-hover:translate-x-3 duration-300">
              <div className="w-full h-full rounded-full border border-line/30 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full border border-line/40" />
              </div>
            </div>
          </div>

          {/* Release Metadata */}
          <div className="flex-1 flex flex-col justify-end gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2.5 py-0.5 border border-line bg-canvas text-blue font-semibold">
                {album.albumType}
              </span>
              {album.isUpcoming && (
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-blue/40 bg-blue/10 text-blue font-semibold flex items-center gap-1">
                  <CalendarIconSVG className="w-2.5 h-2.5" />
                  <span>Upcoming Drop</span>
                </span>
              )}
              {album.visibility === 'UNLISTED' && (
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold">
                  🔗 Unlisted Link
                </span>
              )}
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                Master Recording &bull; {releaseYear}
              </span>
            </div>

            <h1 className="font-serif italic text-3xl sm:text-5xl text-ink tracking-tight leading-tight">
              {album.title}
            </h1>

            {/* Artist Attribution */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <Link
                to="/artists/$idOrSlug"
                params={{ idOrSlug: album.artistSlug }}
                className="font-serif italic text-lg sm:text-xl text-ink hover:text-blue transition-colors flex items-center gap-1.5"
              >
                <span>{album.artistStageName}</span>
                {album.artistVerified && (
                  <VerifiedBadgeSVG className="w-4 h-4 text-blue" />
                )}
              </Link>

              <span className="font-mono text-xs text-ink-soft">&bull;</span>
              <span className="font-mono text-xs text-ink-soft">
                {album.totalTracks} {album.totalTracks === 1 ? 'Track' : 'Tracks'}
              </span>
              <span className="font-mono text-xs text-ink-soft">&bull;</span>
              <span className="font-mono text-xs text-ink-soft">
                {formatDuration(album.totalDurationSeconds)}
              </span>
            </div>

            {album.description && (
              <p className="font-sans text-xs text-ink-soft leading-relaxed mt-2 max-w-2xl">
                {album.description}
              </p>
            )}

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-3 flex-wrap">
              {album.isUpcoming ? (
                <button
                  type="button"
                  disabled={isPreSaveLoading}
                  onClick={handleTogglePreSave}
                  className={`font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 border transition-all cursor-pointer flex items-center gap-2 shadow-2xs font-semibold ${
                    isPreSaved
                      ? 'border-blue bg-blue text-canvas hover:opacity-90'
                      : 'border-ink bg-ink text-canvas hover:opacity-90'
                  }`}
                >
                  <span>{isPreSaved ? '✓ Pre-Saved' : '✦ Pre-Save Release'}</span>
                  <span className="opacity-80 font-mono text-[9.5px]">({preSavesCount})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePlayAlbumFromStart}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-all cursor-pointer flex items-center gap-2 shadow-2xs font-semibold"
                >
                  <PlayIconSVG className="w-3.5 h-3.5" />
                  <span>Play Release</span>
                </button>
              )}

              <button
                type="button"
                disabled={isLikeLoading}
                onClick={handleToggleAlbumLike}
                className={`font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-4 border border-line transition-colors cursor-pointer flex items-center gap-2 ${
                  isLiked
                    ? 'bg-red-50 dark:bg-red-950/20 text-red-600 border-red-300'
                    : 'bg-canvas text-ink hover:border-ink'
                }`}
              >
                <HeartIconSVG
                  filled={isLiked}
                  className={`w-3.5 h-3.5 ${isLiked ? 'text-red-500' : 'text-ink-soft'}`}
                />
                <span>{likesCount.toLocaleString()}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyShareLink}
                className="font-mono text-[10px] uppercase tracking-[0.14em] py-2.5 px-4 border border-line bg-canvas hover:border-ink text-ink transition-colors cursor-pointer"
              >
                {copiedLink ? '✓ Copied' : 'Share'}
              </button>

              {isCreator && (
                <button
                  type="button"
                  onClick={handleToggleComments}
                  className={`font-mono text-[10px] uppercase tracking-[0.14em] py-2.5 px-4 border transition-colors cursor-pointer ${
                    album.allowComments === false
                      ? 'border-red-400 bg-red-50 dark:bg-red-950/20 text-red-600 hover:border-red-500'
                      : 'border-line bg-canvas hover:border-ink text-ink-soft hover:text-ink'
                  }`}
                  title="Toggle comment section for this release"
                >
                  {album.allowComments === false ? '💬 Comments: Off' : '💬 Comments: On'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ambient Spiral */}
        <SvgArtworkSpiral />
      </div>

      {/* ===================== TRACKLIST SECTION ===================== */}
      <div className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-serif italic font-medium text-xl text-ink">
              Master Tracklist
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
              Lossless Architecture
            </span>
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
            {(album.tracks ?? []).length} {(album.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
          </span>
        </div>

        {(album.tracks ?? []).length === 0 ? (
          <div className="p-12 border border-dashed border-line bg-panel text-center">
            <p className="font-serif italic text-base text-ink">
              No tracks uploaded to this release yet.
            </p>
            <p className="font-mono text-[10px] text-ink-soft mt-1">
              Check back soon as the master tape transfers complete.
            </p>
          </div>
        ) : (
          <div className="border border-line bg-panel divide-y divide-line/60 shadow-xs">
            {(album.tracks ?? []).map((track, idx) => {
              const isCurrentPlaying =
                currentTrack?.id === track.id && playbackStatus === 'playing'
              const hasFeatured =
                track.credits &&
                track.credits.some((c) => c.role !== 'PRIMARY')

              return (
                <div
                  key={track.id}
                  className={`px-5 py-3.5 flex items-center justify-between hover:bg-canvas-deep transition-colors group ${
                    isCurrentPlaying ? 'bg-blue/5' : ''
                  }`}
                >
                  {/* Left: Number, Play Button, Title & Credits */}
                  <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
                    {/* Play Button or Track Index / Lock */}
                    <button
                      type="button"
                      onClick={() => handlePlaySong(track, idx)}
                      aria-label={
                        album.isUpcoming || track.isStreamable === false
                          ? 'Track is locked until scheduled release'
                          : isCurrentPlaying
                            ? 'Pause track'
                            : 'Play track'
                      }
                      className="w-6 h-6 flex items-center justify-center text-ink-soft group-hover:text-ink cursor-pointer shrink-0"
                    >
                      {album.isUpcoming || track.isStreamable === false ? (
                        <LockIconSVG className="w-3.5 h-3.5 text-ink-soft/70" />
                      ) : isCurrentPlaying ? (
                        <PauseIconSVG className="w-3.5 h-3.5 text-blue" />
                      ) : (
                        <>
                          <span className="font-mono text-[10.5px] group-hover:hidden">
                            {String(track.trackNumber || idx + 1).padStart(2, '0')}
                          </span>
                          <PlayIconSVG className="w-3.5 h-3.5 hidden group-hover:block text-ink" />
                        </>
                      )}
                    </button>

                    {/* Title & Metadata */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-serif text-sm truncate ${
                            isCurrentPlaying
                              ? 'text-blue font-medium'
                              : 'text-ink'
                          }`}
                        >
                          {track.title}
                        </span>

                        {(album.isUpcoming || track.isStreamable === false) && (
                          <span
                            title="Locked until scheduled drop"
                            className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.2 border border-line text-ink-soft bg-canvas-deep flex items-center gap-1"
                          >
                            <LockIconSVG className="w-2.5 h-2.5" />
                            <span>Locked</span>
                          </span>
                        )}

                        {track.isExplicit && (
                          <span
                            title="Explicit Content"
                            className="font-mono text-[8.5px] uppercase tracking-widest px-1 py-0.2 border border-line text-ink-soft bg-canvas"
                          >
                            E
                          </span>
                        )}
                      </div>

                      {/* Featured Artists & Collaborators */}
                      {hasFeatured && (
                        <div className="font-mono text-[10px] text-ink-soft truncate flex items-center gap-1 mt-0.5">
                          <span>feat.</span>
                          {track.credits!
                            .filter((c) => c.role !== 'PRIMARY')
                            .map((c, i, arr) => (
                              <span key={c.artistId}>
                                <Link
                                  to="/artists/$idOrSlug"
                                  params={{ idOrSlug: c.slug }}
                                  className="hover:text-ink underline decoration-line"
                                >
                                  {c.stageName}
                                </Link>
                                {i < arr.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Plays, Duration & Track Like Button */}
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                    {track.genre && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-line bg-canvas text-ink-soft hidden md:inline-block">
                        {track.genre}
                      </span>
                    )}

                    <span className="font-mono text-[10.5px] text-ink-soft">
                      {formatDuration(track.durationSeconds)}
                    </span>

                    {/* Action Menu (Play Next, Add to Queue, Add to Playlist...) */}
                    <SongActionMenu track={toPlayerTrack(track)} />

                    {/* Like Heart */}
                    <button
                      type="button"
                      onClick={() => handleToggleTrackLike(track)}
                      aria-label="Like track"
                      className="p-1 cursor-pointer"
                    >
                      <HeartIconSVG
                        filled={likedSongIds.has(track.id)}
                        className={`w-3.5 h-3.5 transition-colors ${
                          likedSongIds.has(track.id)
                            ? 'text-red-500'
                            : 'text-ink-soft/40 hover:text-ink'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

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
