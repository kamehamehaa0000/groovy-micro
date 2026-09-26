import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { SvgArtworkSpiral } from '../components/icons'
import { catalogApi } from '../lib/catalog.api'
import type { Album, EnrichedSong } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { usePlayerStore } from '../stores/player.store'
import { RecentlyPlayedShelf } from '../components/player/RecentlyPlayedShelf'
import { SongRow } from '../components/common/SongRow'
import { MediaTile } from '../components/common/MediaTile'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  const { isAuthenticated, isLoading } = useAuthStore()

  // High-performance client-side likes store
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  const [liveAlbums, setLiveAlbums] = useState<
    (Album & { artistStageName?: string; artistSlug?: string })[]
  >([])
  const [liveSongs, setLiveSongs] = useState<EnrichedSong[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)

  // Player integration
  const { currentTrack, playTrack, togglePlay } = usePlayerStore()

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
    credits: song.credits,
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

  return (
    <div className="space-y-10">
      {/* Editorial Hero Section */}

      {!isAuthenticated && !isLoading && (
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
          </div>

          {/* Vinyl Rings Watermark Background */}
          <SvgArtworkSpiral />
        </section>
      )}

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
            {liveAlbums.slice(0, 6).map((album) => (
              <MediaTile
                key={album.id}
                to="/albums/$idOrSlug"
                params={{ idOrSlug: album.slug }}
                title={album.title}
                subtitle={`${album.artistStageName || 'Groovy Artist'} · ${album.albumType}`}
                imageUrl={album.coverImageUrl}
                artistName={album.artistStageName}
              />
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
          <div className="border border-line rounded-lg overflow-clip bg-panel divide-y divide-line/60 shadow-xs">
            {liveSongs.map((t, idx) => (
              <SongRow
                key={t.id}
                track={toPlayerTrack(t)}
                index={idx}
                variant="standard"
                onPlay={() => handlePlaySong(t, idx)}
              />
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
    </div>
  )
}
