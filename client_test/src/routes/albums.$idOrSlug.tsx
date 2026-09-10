import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import type { AlbumDetail, EnrichedSong } from '../types/catalog'
import {
  VerifiedBadgeSVG,
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  DiscIconSVG,
  SvgArtworkSpiral,
} from '../components/icons'
import { useAuthStore } from '../stores/auth.store'

export const Route = createFileRoute('/albums/$idOrSlug')({
  component: AlbumDetailComponent,
})

function AlbumDetailComponent() {
  const { idOrSlug } = Route.useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  const [album, setAlbum] = useState<AlbumDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Likes state
  const [isLiked, setIsLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [isLikeLoading, setIsLikeLoading] = useState(false)

  // Track playback state
  const [playingSongId, setPlayingSongId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Share feedback
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setErrorMsg(null)

    catalogApi
      .getAlbum(idOrSlug)
      .then((data) => {
        if (!isMounted) return
        setAlbum(data)
        setIsLiked(!!data.isLiked)
        setLikesCount(data.likesCount ?? 0)
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
  }, [idOrSlug])

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  const handleToggleAlbumLike = async () => {
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }
    if (!album || isLikeLoading) return

    setIsLikeLoading(true)
    const prevLiked = isLiked
    const prevCount = likesCount

    // Optimistic toggle
    setIsLiked(!prevLiked)
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1)

    try {
      const res = await catalogApi.toggleAlbumLike(album.id)
      setIsLiked(res.liked)
      setLikesCount(res.likesCount)
    } catch (err: any) {
      // Rollback
      setIsLiked(prevLiked)
      setLikesCount(prevCount)
      alert(err.message || 'Could not update like status')
    } finally {
      setIsLikeLoading(false)
    }
  }

  const handleToggleTrackLike = async (track: EnrichedSong) => {
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }

    const prevLiked = !!track.isLiked
    const prevCount = track.likesCount

    // Optimistic track update
    setAlbum((prev) => {
      if (!prev) return null
      return {
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                isLiked: !prevLiked,
                likesCount: prevLiked
                  ? Math.max(0, prevCount - 1)
                  : prevCount + 1,
              }
            : t,
        ),
      }
    })

    try {
      const res = await catalogApi.toggleSongLike(track.id)
      setAlbum((prev) => {
        if (!prev) return null
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === track.id
              ? { ...t, isLiked: res.liked, likesCount: res.likesCount }
              : t,
          ),
        }
      })
    } catch {
      // Rollback on error
      setAlbum((prev) => {
        if (!prev) return null
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === track.id
              ? { ...t, isLiked: prevLiked, likesCount: prevCount }
              : t,
          ),
        }
      })
    }
  }

  const handlePlaySong = (song: EnrichedSong) => {
    if (!song.audioUrl) {
      alert('Audio stream for this master track is currently processing.')
      return
    }

    if (playingSongId === song.id) {
      if (isPlaying) {
        audioRef.current?.pause()
        setIsPlaying(false)
      } else {
        audioRef.current?.play()
        setIsPlaying(true)
      }
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.onended = () => {
        setIsPlaying(false)
      }
      audioRef.current.onerror = () => {
        setIsPlaying(false)
        alert('Playback error. Cloudflare R2 audio may still be syncing.')
      }
    }

    audioRef.current.src = song.audioUrl
    audioRef.current
      .play()
      .then(() => {
        setPlayingSongId(song.id)
        setIsPlaying(true)
      })
      .catch((err) => {
        console.error('Playback error:', err)
        setIsPlaying(false)
      })
  }

  const handlePlayAlbumFromStart = () => {
    if (!album || !album.tracks || album.tracks.length === 0) return
    const firstPlayable = album.tracks.find((t) => !!t.audioUrl)
    if (firstPlayable) {
      handlePlaySong(firstPlayable)
    } else {
      alert('No streamable audio files found for this release yet.')
    }
  }

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
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
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2.5 py-0.5 border border-line bg-canvas text-blue font-semibold">
                {album.albumType}
              </span>
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
              <button
                type="button"
                onClick={handlePlayAlbumFromStart}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-all cursor-pointer flex items-center gap-2 shadow-2xs font-semibold"
              >
                <PlayIconSVG className="w-3.5 h-3.5" />
                <span>Play Release</span>
              </button>

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
            {album.tracks.length} {album.tracks.length === 1 ? 'Cut' : 'Cuts'}
          </span>
        </div>

        {album.tracks.length === 0 ? (
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
            {album.tracks.map((track, idx) => {
              const isCurrentPlaying =
                playingSongId === track.id && isPlaying
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
                    {/* Play Button or Track Index */}
                    <button
                      type="button"
                      onClick={() => handlePlaySong(track)}
                      aria-label={isCurrentPlaying ? 'Pause track' : 'Play track'}
                      className="w-6 h-6 flex items-center justify-center text-ink-soft group-hover:text-ink cursor-pointer shrink-0"
                    >
                      {isCurrentPlaying ? (
                        <PauseIconSVG className="w-3.5 h-3.5 text-blue" />
                      ) : (
                        <span className="font-mono text-[10.5px] group-hover:hidden">
                          {String(track.trackNumber || idx + 1).padStart(2, '0')}
                        </span>
                      )}
                      {!isCurrentPlaying && (
                        <PlayIconSVG className="w-3.5 h-3.5 hidden group-hover:block text-ink" />
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

                    {/* Like Heart */}
                    <button
                      type="button"
                      onClick={() => handleToggleTrackLike(track)}
                      aria-label="Like track"
                      className="p-1 cursor-pointer"
                    >
                      <HeartIconSVG
                        filled={!!track.isLiked}
                        className={`w-3.5 h-3.5 transition-colors ${
                          track.isLiked
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
      </div>
    </div>
  )
}
