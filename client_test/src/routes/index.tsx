import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePlayerStore } from '../stores/player.store'
import { SvgArtworkSpiral } from '../components/icons'
import { catalogApi } from '../lib/catalog.api'
import {
  recommendationsApi,
  type PersonalizedHomeFeed,
  type ScoredRecommendationTrack,
  type RadioMixCard,
} from '../lib/recommendations.api'
import type { Album, EnrichedSong } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { RecentlyPlayedShelf } from '../components/player/RecentlyPlayedShelf'
import { MediaTile } from '../components/common/MediaTile'
import { SongRow } from '../components/common/SongRow'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  // High-performance client-side likes store
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  // Player integration
  const { currentTrack, playTrack, togglePlay } = usePlayerStore()

  // Authenticated Personalized Feed State
  const [feed, setFeed] = useState<PersonalizedHomeFeed | null>(null)
  const [isLoadingFeed, setIsLoadingFeed] = useState(false)

  // Unauthenticated Catalog State
  const [liveAlbums, setLiveAlbums] = useState<
    (Album & { artistStageName?: string; artistSlug?: string })[]
  >([])
  const [liveSongs, setLiveSongs] = useState<EnrichedSong[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)

  useEffect(() => {
    let isMounted = true

    if (isAuthenticated) {
      setIsLoadingFeed(true)
      recommendationsApi
        .getHomeFeed()
        .then((data) => {
          if (!isMounted) return
          setFeed(data)
          // Hydrate likes store with all recommended tracks
          const allTracks: { id: string; isLiked?: boolean }[] = [
            ...(data.globalHits || []),
            ...(data.moreLikeArtist?.tracks || []),
            ...(data.moreLikeSong?.tracks || []),
            ...(data.heavyRotation || []),
            ...(data.forYou || []),
          ]
          if (allTracks.length > 0) {
            hydrateSongs(allTracks)
          }
        })
        .catch((err) => {
          console.warn('[HomeComponent] Failed to load home feed:', err)
        })
        .finally(() => {
          if (isMounted) setIsLoadingFeed(false)
        })
    } else if (!isAuthLoading) {
      setIsLoadingCatalog(true)
      Promise.all([
        catalogApi.searchAlbums({ limit: 8 }).catch(() => null),
        catalogApi
          .searchSongs({ orderBy: 'plays', limit: 10 })
          .catch(() => null),
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
    }

    return () => {
      isMounted = false
    }
  }, [isAuthenticated, isAuthLoading, hydrateSongs])

  // Conversion Helpers
  const scoredToPlayerTrack = (s: ScoredRecommendationTrack): PlayerTrack => ({
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
  })

  const catalogToPlayerTrack = (song: EnrichedSong): PlayerTrack => ({
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

  // Playback handlers
  const handlePlayScoredSong = (
    song: ScoredRecommendationTrack,
    contextTrackList: ScoredRecommendationTrack[],
    contextUri: string,
    contextTitle: string,
  ) => {
    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    const contextTracks = contextTrackList.map(scoredToPlayerTrack)
    const targetTrack = scoredToPlayerTrack(song)
    const targetIdx = contextTracks.findIndex((t) => t.id === targetTrack.id)

    playTrack(
      targetTrack,
      contextTracks,
      targetIdx >= 0 ? targetIdx : 0,
      contextUri,
      contextTitle,
    )
  }

  const handlePlayMix = (mix: RadioMixCard) => {
    if (!mix.previewTracks || mix.previewTracks.length === 0) return

    const firstTrack = mix.previewTracks[0]
    if (currentTrack?.id === firstTrack.id) {
      togglePlay()
      return
    }

    const contextTracks = mix.previewTracks.map(scoredToPlayerTrack)
    playTrack(
      scoredToPlayerTrack(firstTrack),
      contextTracks,
      0,
      `home:mix:${mix.seedSongId}`,
      mix.title,
    )
  }

  const handlePlayCatalogSong = (song: EnrichedSong, index?: number) => {
    if (song.isStreamable === false) {
      alert('This cut is scheduled and locked until release.')
      return
    }

    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    const validTracks = liveSongs.filter((t) => t.isStreamable !== false)
    const contextTracks = validTracks.map(catalogToPlayerTrack)
    const targetTrack = catalogToPlayerTrack(song)
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
    <div className="space-y-6 px-2 py-4 max-w-7xl mx-auto">
      {/* ------------------------------------------------------------ */}
      {/* Editorial Hero Section (Unauthenticated Visitors)             */}
      {/* ------------------------------------------------------------ */}
      {!isAuthenticated && !isAuthLoading && (
        <section className="border border-border bg-card p-8 sm:p-12 shadow-xs relative overflow-hidden">
          <div className="font-eyebrow text-[11px] uppercase tracking-widest text-primary-strong mb-3">
            Introduction · Meaning of groove
          </div>
          <h1 className="font-serif italic font-normal text-3xl sm:text-5xl text-foreground leading-[1.08] mb-4 max-w-2xl">
            A collection of sounds, Straight to your ears.
          </h1>
          <p className="font-sans text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed mb-8">
            Crafted for uninterrupted listening. Powered by the community of
            listeners, curators and creators. Explore and experience the sound
            with never-before-felt experience.
          </p>

          <div className="flex flex-wrap items-center gap-4 relative z-10">
            <Link
              to="/login"
              search={{ redirect: '/' }}
              className="bg-foreground text-background border border-foreground py-3 px-6 font-eyebrow text-[11px] uppercase tracking-wider font-medium transition-all hover:bg-background hover:text-foreground shadow-2xs"
            >
              Enter the collective &rarr;
            </Link>
            <Link
              to="/register"
              search={{ redirect: '/' }}
              className="border border-border bg-card hover:bg-muted text-foreground py-3 px-6 font-eyebrow text-[11px] uppercase tracking-wider transition-all shadow-2xs"
            >
              Join the Collective
            </Link>
          </div>

          <SvgArtworkSpiral />
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* AUTHENTICATED USER STREAMING HOME FEED                        */}
      {/* ------------------------------------------------------------ */}
      {isAuthenticated && (
        <>
          {/* 1. Recently Played Shelf (Current one, kept untouched) */}
          <RecentlyPlayedShelf limit={12} />
          {/* 4. Global Hits Matching Your Taste */}
          {feed?.globalHits && feed.globalHits.length > 0 && (
            <section className="space-y-3">
              <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                <div>
                  <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                    Global Hits For You
                  </h2>
                  <p className="font-sans text-xs text-muted-foreground mt-0.5">
                    Trending cuts in your favorite genres
                  </p>
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {feed.globalHits.map((track) => (
                  <div key={track.id} className="w-35 sm:w-42.5 shrink-0">
                    <MediaTile
                      to={track.albumSlug ? '/albums/$idOrSlug' : undefined}
                      params={
                        track.albumSlug
                          ? { idOrSlug: track.albumSlug }
                          : undefined
                      }
                      title={track.title}
                      subtitle={track.artistStageName}
                      imageUrl={track.coverImageUrl}
                      artistName={track.artistStageName}
                      onClick={
                        !track.albumSlug
                          ? () =>
                              handlePlayScoredSong(
                                track,
                                feed.globalHits,
                                'home:hits',
                                'Global Hits For You',
                              )
                          : undefined
                      }
                      onPlay={() =>
                        handlePlayScoredSong(
                          track,
                          feed.globalHits,
                          'home:hits',
                          'Global Hits For You',
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2. New Releases For You */}
          {feed?.newReleasesForYou && feed.newReleasesForYou.length > 0 && (
            <section className="space-y-3">
              <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                <div>
                  <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                    New Releases For You
                  </h2>
                  <p className="font-sans text-xs text-muted-foreground mt-0.5">
                    Fresh albums & singles matching your sonic profile
                  </p>
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {feed.newReleasesForYou.map((album) => (
                  <div key={album.id} className="w-35 sm:w-42.5 shrink-0">
                    <MediaTile
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: album.slug }}
                      title={album.title}
                      subtitle={`${album.artistStageName || 'Groovy Artist'} · ${album.albumType}`}
                      imageUrl={album.coverImageUrl}
                      artistName={album.artistStageName}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2. New Releases From Followed Artists (Release Radar) */}
          {feed?.artistRadar && feed.artistRadar.length > 0 && (
            <section className="space-y-3">
              <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                <div>
                  <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                    Release Radar
                  </h2>
                  <p className="font-sans text-xs text-muted-foreground mt-0.5">
                    New drops from artists you follow
                  </p>
                </div>
                <Link
                  to="/releases"
                  className="font-eyebrow text-[11px] hover:underline uppercase tracking-wider text-muted-foreground shrink-0"
                >
                  Release Archive
                </Link>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {feed.artistRadar.map((album) => (
                  <div key={album.id} className="w-35 sm:w-42.5 shrink-0">
                    <MediaTile
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: album.slug }}
                      title={album.title}
                      subtitle={`${album.artistStageName || 'Groovy Artist'} · ${album.albumType}`}
                      imageUrl={album.coverImageUrl}
                      artistName={album.artistStageName}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Similar Artists */}
          {feed?.similarArtists?.seedArtist &&
            feed.similarArtists.artists &&
            feed.similarArtists.artists.length > 0 && (
              <section className="space-y-3">
                <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                  <div>
                    <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                      Similar to {feed.similarArtists.seedArtist.stageName}
                    </h2>
                    <p className="font-sans text-xs text-muted-foreground mt-0.5">
                      Curated artists sharing soundscapes, energy, and
                      subculture
                    </p>
                  </div>
                  <Link
                    to="/artists"
                    className="font-eyebrow hover:underline text-[11px] uppercase tracking-wider text-muted-foreground shrink-0"
                  >
                    Explore Artists
                  </Link>
                </div>

                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {feed.similarArtists.artists.map((artist) => (
                    <div
                      key={artist.id}
                      className="w-35 sm:w-42.5 shrink-0 text-center"
                    >
                      <MediaTile
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: artist.slug }}
                        title={artist.stageName}
                        subtitle={
                          <span className="flex items-center justify-center gap-1">
                            <span>{artist.primaryGenre || 'Artist'}</span>
                            {artist.verified && (
                              <span
                                className="text-primary font-bold text-[11px]"
                                title="Verified Artist"
                              >
                                ✓
                              </span>
                            )}
                          </span>
                        }
                        imageUrl={artist.avatarUrl}
                        artistName={artist.stageName}
                        isRoundImage={true}
                        fallbackInitials={artist.stageName
                          .slice(0, 2)
                          .toUpperCase()}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* 6. More Like Favorite Song */}
          {feed?.moreLikeSong?.seedSong &&
            feed.moreLikeSong.tracks &&
            feed.moreLikeSong.tracks.length > 0 && (
              <section className="space-y-3">
                <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                  <div>
                    <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                      More Like "{feed.moreLikeSong.seedSong.title}"
                    </h2>
                    <p className="font-sans text-xs text-muted-foreground mt-0.5">
                      Harmonic continuity matching your repeat spin
                    </p>
                  </div>
                  <Link
                    to="/search"
                    className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground shrink-0"
                  >
                    Explore more
                  </Link>
                </div>

                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {feed.moreLikeSong.tracks.map((track) => (
                    <div key={track.id} className="w-35 sm:w-42.5 shrink-0">
                      <MediaTile
                        to={track.albumSlug ? '/albums/$idOrSlug' : undefined}
                        params={
                          track.albumSlug
                            ? { idOrSlug: track.albumSlug }
                            : undefined
                        }
                        title={track.title}
                        subtitle={track.artistStageName}
                        imageUrl={track.coverImageUrl}
                        artistName={track.artistStageName}
                        onClick={
                          !track.albumSlug
                            ? () =>
                                handlePlayScoredSong(
                                  track,
                                  feed.moreLikeSong!.tracks,
                                  `home:song:${feed.moreLikeSong!.seedSong!.id}`,
                                  `More Like "${feed.moreLikeSong!.seedSong!.title}"`,
                                )
                            : undefined
                        }
                        onPlay={() =>
                          handlePlayScoredSong(
                            track,
                            feed.moreLikeSong!.tracks,
                            `home:song:${feed.moreLikeSong!.seedSong!.id}`,
                            `More Like "${feed.moreLikeSong!.seedSong!.title}"`,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* 7. My Saved or Created Playlists */}
          {feed?.userPlaylists && feed.userPlaylists.length > 0 && (
            <section className="space-y-3">
              <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                <div>
                  <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                    Your Playlists
                  </h2>
                  <p className="font-sans text-xs text-muted-foreground mt-0.5">
                    Jump back into your personal and saved playlists
                  </p>
                </div>
                <span className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
                  Library
                </span>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {feed.userPlaylists.map((pl) => (
                  <div key={pl.id} className="w-35 sm:w-42.5 shrink-0">
                    <MediaTile
                      to="/playlists/$id"
                      params={{ id: pl.id }}
                      title={pl.title}
                      subtitle={`${pl.totalTracks} tracks · ${pl.isOwner ? 'By you' : pl.ownerName}`}
                      imageUrl={pl.coverImageUrl}
                      fallbackInitials={pl.title.slice(0, 2).toUpperCase()}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 8. Radio Mixes (Kept at the end as requested) */}
          {feed?.radioMixes && feed.radioMixes.length > 0 && (
            <section className="space-y-3">
              <div className="flex justify-between items-baseline border-b border-border pb-2.5">
                <div>
                  <h2 className="font-serif italic font-medium text-lg sm:text-xl text-foreground">
                    Personalized Radio Mixes
                  </h2>
                  <p className="font-sans text-xs text-muted-foreground mt-0.5">
                    Infinite flow seeded from 5 diverse songs in your rotation
                  </p>
                </div>
              </div>

              <div className="flex gap-3.5 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {feed.radioMixes.map((mix) => (
                  <div key={mix.id} className="w-40 sm:w-47.5 shrink-0">
                    <MediaTile
                      to="/radio/$songId"
                      params={{ songId: mix.seedSongId }}
                      title={mix.title}
                      subtitle={mix.subtitle}
                      imageUrl={mix.coverImageUrl}
                      artistName={mix.seedArtistName}
                      badge={
                        <span className="px-1.5 py-0.5 rounded text-xs font-eyebrow tracking-wider uppercase bg-foreground/40 text-accent font-bold shadow-xs">
                          RADIO
                        </span>
                      }
                      onPlay={() => handlePlayMix(mix)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Loading indicator if feed is still fetching */}
          {isLoadingFeed && (
            <div className="py-12 text-center font-mono text-xs text-muted-foreground animate-pulse">
              Curating your personalized groove stream...
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------ */}
      {/* UNAUTHENTICATED VISITOR CATALOG FALLBACK                      */}
      {/* ------------------------------------------------------------ */}
      {!isAuthenticated && !isAuthLoading && (
        <>
          {/* Featured Master Releases Row */}
          <section className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-serif italic font-medium text-xl text-foreground">
                  Featured Master Releases
                </h2>
              </div>
              <span className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground">
                Archive MMXXVI
              </span>
            </div>

            {isLoadingCatalog ? (
              <div className="py-8 text-center font-mono text-xs text-muted-foreground animate-pulse">
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
              <div className="border border-border bg-card divide-y divide-border/60">
                <h3 className="font-serif font-medium text-sm text-foreground p-5">
                  No releases found
                </h3>
              </div>
            )}
          </section>

          {/* Master Tapes Correspondence Slip */}
          <section className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-border pb-3">
              <h2 className="font-serif italic font-medium text-xl text-foreground">
                Correspondence Slip &bull; Master Recordings
              </h2>
              <span className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground">
                {liveSongs.length > 0
                  ? `${liveSongs.length} Master Works`
                  : '6 Showcase Works'}
              </span>
            </div>

            {liveSongs.length > 0 ? (
              <div className="border border-border rounded-lg overflow-clip bg-card divide-y divide-border/60 shadow-xs">
                {liveSongs.map((t, idx) => (
                  <SongRow
                    key={t.id}
                    track={catalogToPlayerTrack(t)}
                    index={idx}
                    variant="standard"
                    onPlay={() => handlePlayCatalogSong(t, idx)}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-border bg-card divide-y divide-border/60">
                <h3 className="font-serif font-medium text-sm text-foreground p-5">
                  No tracks found
                </h3>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
