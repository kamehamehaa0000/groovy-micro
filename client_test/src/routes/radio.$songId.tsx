import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePlayerStore } from '../stores/player.store'
import { useLikesStore } from '../stores/likes.store'
import { useAuthStore } from '../stores/auth.store'
import { playlistsApi } from '../lib/playlists.api'
import {
  recommendationsApi,
  type ScoredRecommendationTrack,
} from '../lib/recommendations.api'
import type { PlayerTrack } from '../types/player'
import { SongRow } from '../components/common/SongRow'
import { ProceduralCover } from '../components/common/ProceduralCover'
import {
  PlayIconSVG,
  PauseIconSVG,
  PlusIconSVG,
  DiscIconSVG,
  SvgArtworkSpiral,
} from '../components/icons'

export const Route = createFileRoute('/radio/$songId')({
  component: RadioMixPage,
})

function formatTotalDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0 min'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours} hr ${minutes} min`
  }
  return `${minutes} min`
}

function RadioMixPage() {
  const { songId } = Route.useParams()
  const { isAuthenticated } = useAuthStore()

  const [seedSong, setSeedSong] = useState<ScoredRecommendationTrack | null>(null)
  const [tracks, setTracks] = useState<ScoredRecommendationTrack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

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

    recommendationsApi
      .getTrackRadio(songId, 25)
      .then((data) => {
        if (!isMounted) return
        setSeedSong(data.seedSong)
        setTracks(data.tracks)

        const all = data.seedSong ? [data.seedSong, ...data.tracks] : data.tracks
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
  }, [songId, hydrateSongs])

  const fullQueue = useMemo<ScoredRecommendationTrack[]>(() => {
    if (!seedSong) return tracks
    return [seedSong, ...tracks]
  }, [seedSong, tracks])

  const totalDurationSeconds = useMemo(() => {
    return fullQueue.reduce((acc, t) => acc + (t.durationSeconds || 0), 0)
  }, [fullQueue])

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
    []
  )

  const handlePlayAll = useCallback(() => {
    if (fullQueue.length === 0) return

    if (isRadioPlaying) {
      togglePlay()
      return
    }

    if (contextUri === `radio:${songId}` && currentTrack) {
      togglePlay()
      return
    }

    const contextTracks = fullQueue.map(toPlayerTrack)
    playTrack(
      contextTracks[0],
      contextTracks,
      0,
      `radio:${songId}`,
      `${seedSong?.title || 'Track'} Radio`
    )
  }, [fullQueue, isRadioPlaying, contextUri, songId, currentTrack, togglePlay, playTrack, seedSong, toPlayerTrack])

  const handlePlayTrackAtIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= fullQueue.length) return
      const target = fullQueue[index]

      if (currentTrack?.id === target.id) {
        togglePlay()
        return
      }

      const contextTracks = fullQueue.map(toPlayerTrack)
      playTrack(
        toPlayerTrack(target),
        contextTracks,
        index,
        `radio:${songId}`,
        `${seedSong?.title || 'Track'} Radio`
      )
    },
    [fullQueue, currentTrack, togglePlay, toPlayerTrack, playTrack, songId, seedSong]
  )

  const handleSaveAsPlaylist = async () => {
    if (!isAuthenticated) {
      alert('Please sign in to save this radio mix to your playlist library.')
      return
    }

    if (fullQueue.length === 0 || isSavingPlaylist) return

    try {
      setIsSavingPlaylist(true)
      const title = `${seedSong?.title || 'Music'} Radio Mix`
      const description = `Dynamic radio mix based on ${seedSong?.title} by ${seedSong?.artistStageName}`

      const newPl = await playlistsApi.createPlaylist({
        title,
        description,
      })

      // Add all tracks to new playlist
      if (fullQueue.length > 0) {
        await playlistsApi.addTracks(
          newPl.id,
          fullQueue.map((t) => t.id)
        )
      }

      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 4000)
    } catch (err) {
      console.error('[RadioMixPage] Failed to save playlist:', err)
      alert('Could not save playlist. Please try again.')
    } finally {
      setIsSavingPlaylist(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 select-none">
      {/* ===================== HERO HEADER ===================== */}
      <div className="border border-line bg-panel p-6 sm:p-10 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-8 relative z-10">
          {/* Artwork Container */}
          <div className="w-44 h-44 sm:w-52 sm:h-52 shrink-0 border border-line shadow-md overflow-hidden relative rounded-xl bg-canvas-deep flex items-center justify-center select-none">
            {seedSong?.coverImageUrl ? (
              <img
                src={seedSong.coverImageUrl}
                alt={seedSong.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <ProceduralCover
                title={seedSong?.title || 'Radio'}
                artistName={seedSong?.artistStageName || 'Groovy'}
                size="lg"
                className="w-full h-full rounded-xl"
              />
            )}
            <div className="absolute top-3 right-3 z-10">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono tracking-wider uppercase bg-primary text-primary-foreground font-bold shadow-xs">
                RADIO
              </span>
            </div>
          </div>

          {/* Meta Info */}
          <div className="space-y-3 flex-1 min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-widest text-primary-strong font-semibold">
              Personalized Dynamic Mix &bull; Continuous Flow
            </div>

            <h1 className="font-serif italic font-normal text-3xl sm:text-5xl text-ink leading-tight truncate">
              {seedSong ? `${seedSong.title} Radio` : 'Radio Mix'}
            </h1>

            <p className="font-sans text-xs sm:text-sm text-ink-soft line-clamp-2 max-w-2xl leading-relaxed">
              Harmonic queue seeded from{' '}
              <span className="font-semibold text-ink">
                {seedSong?.title || 'selected cut'}
              </span>{' '}
              by{' '}
              <span className="font-semibold text-ink">
                {seedSong?.artistStageName || 'Groovy Artist'}
              </span>
              . Continuously generated based on tempo, mood alignment, and playlist co-occurrences.
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft pt-1">
              <span>{fullQueue.length} Works</span>
              <span>&bull;</span>
              <span>{formatTotalDuration(totalDurationSeconds)}</span>
              <span>&bull;</span>
              <span className="text-primary font-medium">Auto-refreshed</span>
            </div>
          </div>
        </div>

        <SvgArtworkSpiral />
      </div>

      {/* ===================== ACTION CONTROLS ===================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          {/* Big Play / Pause Button */}
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={isLoading || fullQueue.length === 0}
            className="w-13 h-13 rounded-full bg-primary hover:bg-primary-strong text-primary-foreground flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-md cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            aria-label={isRadioPlaying ? 'Pause Radio' : 'Play Radio'}
          >
            {isRadioPlaying ? (
              <PauseIconSVG className="w-5 h-5 fill-current" />
            ) : (
              <PlayIconSVG className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Save as Playlist Button */}
          <button
            type="button"
            onClick={handleSaveAsPlaylist}
            disabled={isSavingPlaylist || fullQueue.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-panel hover:bg-canvas-deep text-ink font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
          >
            <PlusIconSVG className="w-3.5 h-3.5" />
            <span>{savedSuccess ? 'Saved to Playlists!' : isSavingPlaylist ? 'Saving...' : 'Save as Playlist'}</span>
          </button>
        </div>

        <div className="font-mono text-xs text-ink-soft">
          Seeded by: {seedSong?.artistStageName || 'Catalog'}
        </div>
      </div>

      {/* ===================== TRACKLIST SECTION ===================== */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-16 border border-line/40 bg-panel/50 animate-pulse rounded-lg"
            />
          ))}
        </div>
      ) : errorMsg ? (
        <div className="p-6 border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-mono text-xs rounded-lg">
          {errorMsg}
        </div>
      ) : fullQueue.length === 0 ? (
        <div className="border border-line bg-panel p-12 text-center space-y-4 rounded-xl">
          <div className="w-12 h-12 mx-auto rounded-full bg-canvas-deep flex items-center justify-center text-ink-soft">
            <DiscIconSVG className="w-6 h-6" />
          </div>
          <h3 className="font-serif italic text-lg text-ink">
            No radio tracks found
          </h3>
          <p className="font-sans text-xs text-ink-soft max-w-sm mx-auto">
            We could not find matching continuous cuts for this song right now.
          </p>
          <Link
            to="/"
            className="inline-block mt-2 font-mono text-xs uppercase tracking-wider py-2 px-5 border border-line bg-canvas hover:bg-canvas-deep text-ink cursor-pointer transition-colors"
          >
            Return to Home
          </Link>
        </div>
      ) : (
        <div className="border border-line bg-panel rounded-xl overflow-hidden shadow-2xs divide-y divide-line/40">
          {fullQueue.map((track, idx) => (
            <SongRow
              key={`${track.id}-${idx}`}
              track={toPlayerTrack(track)}
              index={idx}
              variant="standard"
              onPlay={() => handlePlayTrackAtIndex(idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
