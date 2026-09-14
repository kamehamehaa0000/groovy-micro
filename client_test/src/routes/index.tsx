import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import {
  SvgArtworkSpiral,
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  DiscIconSVG,
} from '../components/icons'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import type { Album, EnrichedSong } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { SongActionMenu } from '../components/player/SongActionMenu'
import { RecentlyPlayedShelf } from '../components/player/RecentlyPlayedShelf'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  const { isAuthenticated, isLoading } = useAuthStore()

  // High-performance client-side likes store
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  const [liveAlbums, setLiveAlbums] = useState<
    (Album & { artistStageName?: string; artistSlug?: string })[]
  >([])
  const [liveSongs, setLiveSongs] = useState<EnrichedSong[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)

  // Player integration
  const { currentTrack, playbackStatus, playTrack, togglePlay } =
    usePlayerStore()

  useEffect(() => {
    let isMounted = true
    setIsLoadingCatalog(true)

    Promise.all([
      catalogApi.searchAlbums({ limit: 6 }).catch(() => null),
      catalogApi.searchSongs({ orderBy: 'plays', limit: 8 }).catch(() => null),
    ])
      .then(([albumRes, songRes]) => {
        if (!isMounted) return
        if (albumRes?.data) setLiveAlbums(albumRes.data)
        if (songRes?.data) {
          setLiveSongs(songRes.data)
          hydrateSongs(songRes.data)
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingCatalog(false)
      })

    return () => {
      isMounted = false
    }
  }, [hydrateSongs])

  const toPlayerTrack = (song: EnrichedSong): PlayerTrack => ({
    id: song.id,
    title: song.title,
    artistId: song.artistId || '',
    artistName: song.artistStageName || 'Unknown Artist',
    artistSlug: song.artistSlug,
    albumId: song.albumId || undefined,
    albumTitle: song.albumTitle || undefined,
    albumSlug: song.albumSlug || undefined,
    coverImageUrl: song.coverImageUrl || song.albumCoverImageUrl,
    durationSeconds: song.durationSeconds,
    audioUrl: song.audioUrl,
    hlsManifestUrl: song.hlsManifestUrl,
    rawAudioKey: song.rawAudioKey,
    isExplicit: song.isExplicit,
  })

  const handlePlaySong = (song: EnrichedSong, index?: number) => {
    if (song.isStreamable === false) {
      alert('This cut is scheduled and locked until release.')
      return
    }

    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    const validTracks = liveSongs.filter((t) => t.isStreamable !== false)
    const contextTracks = validTracks.map(toPlayerTrack)
    const targetTrack = toPlayerTrack(song)
    const targetIdx = contextTracks.findIndex((t) => t.id === targetTrack.id)

    playTrack(
      targetTrack,
      contextTracks,
      targetIdx >= 0 ? targetIdx : (index ?? 0),
      'home:curated',
      'Curated Master Cuts',
    )
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

    setLiveSongs((prev) =>
      prev.map((t) =>
        t.id === track.id
          ? {
              ...t,
              likesCount: wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
            }
          : t,
      ),
    )

    try {
      const res = await toggleSongLike(track.id)
      setLiveSongs((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, likesCount: res.likesCount } : t,
        ),
      )
    } catch {
      setLiveSongs((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, likesCount: prevCount } : t,
        ),
      )
    }
  }

  return (
    <div className="space-y-10">
      {/* Editorial Hero Section */}
      <section className="border border-line bg-panel p-8 sm:p-12 shadow-xs relative overflow-hidden">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-3">
          Introduction · Meaning of groove
        </div>
        <h1 className="font-serif italic font-normal text-3xl sm:text-5xl text-ink leading-[1.08] mb-4 max-w-2xl">
          A collection of sounds, Straight to your ears.
        </h1>
        <p className="font-sans text-xs sm:text-sm text-ink-soft max-w-xl leading-relaxed mb-8">
          Crafted for uninterrupted listening. Powered by the community of
          listeners, curators and creators. Explore and experience the sound
          with never-before-felt experience.
        </p>

        <div className="flex flex-wrap items-center gap-4 relative z-10">
          {!isAuthenticated && !isLoading ? (
            <>
              <Link
                to="/login"
                className="bg-ink text-canvas border border-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink shadow-2xs"
              >
                Enter the collective &rarr;
              </Link>
              <Link
                to="/register"
                className="border border-line bg-panel hover:bg-canvas-deep text-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] transition-all shadow-2xs"
              >
                Join the Collective
              </Link>
            </>
          ) : (
            <Link
              to="/profile"
              className="bg-ink text-canvas border border-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink shadow-2xs"
            >
              Curator Profile & Vault &rarr;
            </Link>
          )}
        </div>

        {/* Vinyl Rings Watermark Background */}
        <SvgArtworkSpiral />
      </section>

      {/* Recently Played History Shelf (Authenticated) */}
      <RecentlyPlayedShelf />

      {/* Featured Master Releases Row */}
      <section className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-serif italic font-medium text-xl text-ink">
              Featured Master Releases
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
              Lossless Master Architecture
            </span>
          </div>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
            Archive MMXXVI
          </span>
        </div>

        {isLoadingCatalog ? (
          <div className="py-8 text-center font-mono text-xs text-ink-soft animate-pulse">
            Loading master releases...
          </div>
        ) : liveAlbums.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {liveAlbums.slice(0, 3).map((album) => (
              <Link
                key={album.id}
                to="/albums/$idOrSlug"
                params={{ idOrSlug: album.slug }}
                className="border border-line bg-panel p-5 shadow-xs hover:border-ink transition-colors group text-inherit no-underline"
              >
                <div className="aspect-square bg-canvas-deep border border-line mb-4 relative flex items-center justify-center overflow-hidden">
                  {album.coverImageUrl ? (
                    <img
                      src={album.coverImageUrl}
                      alt={album.title}
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                    />
                  ) : (
                    <DiscIconSVG className="w-12 h-12 text-ink-soft/40" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-canvas/60">
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2.5 py-1 bg-ink text-canvas">
                      Inspect Master
                    </span>
                  </div>
                </div>
                <div className="font-serif font-medium text-sm text-ink mb-0.5 truncate group-hover:text-blue transition-colors">
                  {album.title}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-ink-soft truncate">
                  {album.artistStageName || 'Groovy Artist'} &bull;{' '}
                  {album.albumType}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-line bg-panel divide-y divide-line/60">
            <h3 className="font-serif font-medium text-sm text-ink p-5">
              No tracks found
            </h3>
          </div>
        )}
      </section>

      {/* Master Tapes Correspondence Slip */}
      <section className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-line pb-3">
          <h2 className="font-serif italic font-medium text-xl text-ink">
            Correspondence Slip &bull; Master Recordings
          </h2>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
            {liveSongs.length > 0
              ? `${liveSongs.length} Master Works`
              : '6 Showcase Works'}
          </span>
        </div>

        {liveSongs.length > 0 ? (
          <div className="border border-line bg-panel divide-y divide-line/60 shadow-xs">
            {liveSongs.map((t, idx) => {
              const isCurrentPlaying =
                currentTrack?.id === t.id && playbackStatus === 'playing'
              const isCurrentLoaded = currentTrack?.id === t.id

              return (
                <div
                  key={t.id}
                  className={`px-5 py-3.5 flex items-center justify-between hover:bg-canvas-deep transition-colors group ${
                    isCurrentPlaying ? 'bg-blue/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
                    <button
                      type="button"
                      onClick={() => handlePlaySong(t, idx)}
                      aria-label={isCurrentPlaying ? 'Pause' : 'Play'}
                      className="w-6 h-6 flex items-center justify-center text-ink-soft group-hover:text-ink cursor-pointer shrink-0"
                    >
                      {isCurrentPlaying ? (
                        <PauseIconSVG className="w-3.5 h-3.5 text-blue" />
                      ) : (
                        <span
                          className={`font-mono text-[10px] ${
                            isCurrentLoaded ? 'text-blue font-bold' : ''
                          } group-hover:hidden`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                      )}
                      {!isCurrentPlaying && (
                        <PlayIconSVG className="w-3.5 h-3.5 hidden group-hover:block text-ink" />
                      )}
                    </button>

                    <div className="truncate">
                      <div
                        className={`font-serif font-medium text-sm truncate ${
                          isCurrentPlaying
                            ? 'text-blue font-medium'
                            : isCurrentLoaded
                              ? 'text-blue'
                              : 'text-ink'
                        }`}
                      >
                        {t.title}
                      </div>
                      <div className="font-mono text-[10px] text-ink-soft truncate">
                        {t.artistStageName || 'Groovy Artist'} &bull;{' '}
                        {t.genre || 'Master Cut'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pl-3">
                    {t.isExplicit && (
                      <span className="font-mono text-[8px] px-1 border border-line text-ink-soft bg-canvas">
                        E
                      </span>
                    )}

                    <span className="font-mono text-[10.5px] text-ink-soft">
                      {formatDuration(t.durationSeconds)}
                    </span>

                    <SongActionMenu track={toPlayerTrack(t)} />

                    <button
                      type="button"
                      onClick={() => handleToggleTrackLike(t)}
                      className="p-1 cursor-pointer"
                    >
                      <HeartIconSVG
                        filled={likedSongIds.has(t.id)}
                        className={`w-3.5 h-3.5 ${
                          likedSongIds.has(t.id)
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
        ) : (
          <div className="border border-line bg-panel divide-y divide-line/60">
            <h3 className="font-serif font-medium text-sm text-ink p-5">
              No tracks found
            </h3>
          </div>
        )}
      </section>
    </div>
  )
}
