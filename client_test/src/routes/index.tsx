import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePlayerStore } from '../stores/player.store'
import { SvgArtworkSpiral } from '../Components/Icons'
import { catalogApi } from '../lib/catalog.api'
import {
  recommendationsApi,
  type PersonalizedHomeFeed,
  type ScoredRecommendationTrack,
  type RadioMixCard,
} from '../lib/recommendations.api'
import type { Album, EnrichedSong } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { toPlayerTrack } from '../lib/player-track'
import { RecentlyPlayedShelf } from '../Components/player/RecentlyPlayedShelf'
import { MediaTile } from '../Components/common/MediaTile'
import { ArtistCard } from '../Components/artists/ArtistCard'
import { SongRow } from '../Components/common/SongRow'
import { ShelfSection, TrackCarousel } from '../Components/home/ShelfSection'
import { RadioSection } from '../Components/home/RadioSection'
import { MediaGrid } from '../Components/media/MediaGrid'
import { EmptyState, ErrorState } from '../Components/ui/EmptyState'
import { notify } from '../lib/toast'
import { H1, H3, H4 } from '../Components/ui/typography'

const CURATED_RADIO_MIXES = [
  {
    id: 'curated-after-hours',
    title: 'After Hours',
    subtitle: 'Late night energy',
    coverImageUrl:
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=500&h=300&fit=crop',
  },
  {
    id: 'curated-indie-waves',
    title: 'Indie Waves',
    subtitle: 'Alternative discoveries',
    coverImageUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=300&fit=crop',
  },
  {
    id: 'curated-golden-hour',
    title: 'Golden Hour',
    subtitle: 'Warm & mellow',
    coverImageUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=300&fit=crop',
  },
]

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  // High-performance client-side likes store
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  // Player integration — selected slices only, so a playback tick does not
  // re-render the whole home page.
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Authenticated Personalized Feed State
  const [feed, setFeed] = useState<PersonalizedHomeFeed | null>(null)
  const [isLoadingFeed, setIsLoadingFeed] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)

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
      setFeedError(null)
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
          if (!isMounted) return
          // The feed is the page: without it there is nothing to show, so the
          // failure has to be visible rather than silently blank.
          console.warn('[HomeComponent] Failed to load home feed:', err)
          setFeedError(
            err instanceof Error
              ? err.message
              : 'Your personalized stream could not be loaded.',
          )
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
  const scoredToPlayerTrack = (s: ScoredRecommendationTrack): PlayerTrack =>
    toPlayerTrack({
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

  const catalogToPlayerTrack = (song: EnrichedSong): PlayerTrack =>
    toPlayerTrack({
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

  const handlePlayMix = (mix: RadioMixCard | any) => {
    if (mix.previewTracks && mix.previewTracks.length > 0) {
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
    } else if (liveSongs.length > 0) {
      handlePlayCatalogSong(liveSongs[0], 0)
    }
  }

  const handlePlayCatalogSong = (song: EnrichedSong, index?: number) => {
    if (song.isStreamable === false) {
      notify.info('This cut is scheduled and locked until release.')
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

  // True when at least one personalized shelf has something to render.
  const hasFeedContent =
    !!feed &&
    ((feed.globalHits?.length ?? 0) > 0 ||
      (feed.newReleasesForYou?.length ?? 0) > 0 ||
      (feed.artistRadar?.length ?? 0) > 0 ||
      (feed.similarArtists?.artists?.length ?? 0) > 0 ||
      (feed.moreLikeSong?.tracks?.length ?? 0) > 0 ||
      (feed.userPlaylists?.length ?? 0) > 0 ||
      (feed.radioMixes?.length ?? 0) > 0)

  const curatedRadioMixes = useMemo(() => {
    return CURATED_RADIO_MIXES.map((mix, idx) => {
      const matchedSong = liveSongs[idx]
      return {
        ...mix,
        seedSongId: matchedSong?.id,
        to: matchedSong ? '/radio/$songId' : '/search',
        params: matchedSong ? { songId: matchedSong.id } : undefined,
      }
    })
  }, [liveSongs])

  const radioMixesToShow =
    feed?.radioMixes && feed.radioMixes.length > 0
      ? feed.radioMixes
      : curatedRadioMixes

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ */}
      {/* Initial Auth-Checking Skeleton (Prevents Blank Screen)        */}
      {/* ------------------------------------------------------------ */}
      {isAuthLoading && (
        <div className="space-y-6 animate-pulse">
          <section className="border border-border bg-card p-8 sm:p-12 shadow-xs relative overflow-hidden">
            <div className="h-3 w-40 bg-muted rounded-control mb-4" />
            <div className="h-10 sm:h-12 w-3/4 max-w-xl bg-muted rounded-control mb-4" />
            <div className="h-4 w-full max-w-md bg-muted rounded-control mb-2" />
            <div className="h-4 w-2/3 max-w-sm bg-muted rounded-control mb-8" />
            <div className="flex gap-4">
              <div className="h-11 w-44 bg-muted rounded-control" />
              <div className="h-11 w-40 bg-muted rounded-control" />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex justify-between border-b border-border pb-3">
              <div className="h-6 w-48 bg-muted rounded-control" />
              <div className="h-3 w-28 bg-muted rounded-control" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="aspect-square w-full bg-muted rounded-md" />
                  <div className="h-3.5 w-3/4 bg-muted rounded-control" />
                  <div className="h-3 w-1/2 bg-muted rounded-control" />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Editorial Hero Section (Unauthenticated Visitors)             */}
      {/* ------------------------------------------------------------ */}
      {!isAuthenticated && !isAuthLoading && (
        <section className="p-8 sm:p-12 rounded-lg shadow-xs relative overflow-hidden">
          <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary-strong mb-3">
            Introduction · Meaning of groove
          </div>
          <H1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mb-4 max-w-2xl">
            A collection of sounds, Straight to your ears.
          </H1>
          <p className="font-sans text-caption sm:text-body text-muted-foreground max-w-xl leading-relaxed mb-8">
            Crafted for uninterrupted listening. Powered by the community of
            listeners, curators and creators. Explore and experience the sound
            with never-before-felt experience.
          </p>

          <div className="flex flex-wrap items-center gap-4 relative z-10">
            <Link
              to="/register"
              search={{ redirect: '/' }}
              className="rounded-full border border-border bg-card hover:bg-background text-foreground py-3 px-6 font-eyebrow text-eyebrow uppercase tracking-wider transition-all shadow-raised"
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
          {/* The shelves below are the page; this keeps the document outline
              sane for screen readers and search engines. */}
          <h1 className="sr-only">Home</h1>

          {/* 1. Recently Played Shelf (Current one, kept untouched) */}
          <RecentlyPlayedShelf limit={9} />

          {/* 4. Global Hits Matching Your Taste */}
          {feed?.globalHits && feed.globalHits.length > 0 && (
            <ShelfSection
              title="Global Hits For You"
              subtitle="Trending cuts in your favorite genres"
            >
              <TrackCarousel>
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
              </TrackCarousel>
            </ShelfSection>
          )}

          {/* 2. New Releases For You */}
          {feed?.newReleasesForYou && feed.newReleasesForYou.length > 0 && (
            <ShelfSection
              title="New Releases For You"
              subtitle="Fresh albums & singles matching your sonic profile"
            >
              <TrackCarousel>
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
              </TrackCarousel>
            </ShelfSection>
          )}

          {/* 2. New Releases From Followed Artists (Release Radar) */}
          {feed?.artistRadar && feed.artistRadar.length > 0 && (
            <ShelfSection
              title="Release Radar"
              subtitle="New drops from artists you follow"
              action={{ label: 'Release Archive', to: '/releases' }}
            >
              <TrackCarousel>
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
              </TrackCarousel>
            </ShelfSection>
          )}

          {/* 5. Similar Artists */}
          {feed?.similarArtists?.seedArtist &&
            feed.similarArtists.artists &&
            feed.similarArtists.artists.length > 0 && (
              <ShelfSection
                title={'Similar to ' + feed.similarArtists.seedArtist.stageName}
                subtitle="Curated artists sharing soundscapes, energy, and subculture"
                action={{ label: 'Explore Artists', to: '/artists' }}
              >
                <TrackCarousel>
                  {feed.similarArtists.artists.map((artist) => (
                    <div key={artist.id} className="w-35 sm:w-42.5 shrink-0">
                      <ArtistCard
                        name={artist.stageName}
                        slug={artist.slug}
                        imageUrl={artist.avatarUrl}
                        subtitle={artist.primaryGenre || 'Artist'}
                        isVerified={artist.verified}
                      />
                    </div>
                  ))}
                </TrackCarousel>
              </ShelfSection>
            )}

          {/* 6. More Like Favorite Song */}
          {feed?.moreLikeSong?.seedSong &&
            feed.moreLikeSong.tracks &&
            feed.moreLikeSong.tracks.length > 0 && (
              <ShelfSection
                title={'More Like "' + feed.moreLikeSong.seedSong.title + '"'}
                subtitle="Harmonic continuity matching your repeat spin"
                action={{ label: 'Explore more', to: '/search' }}
              >
                <TrackCarousel>
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
                </TrackCarousel>
              </ShelfSection>
            )}

          {/* 7. My Saved or Created Playlists */}
          {feed?.userPlaylists && feed.userPlaylists.length > 0 && (
            <ShelfSection
              title="Your Playlists"
              subtitle="Jump back into your personal and saved playlists"
            >
              <TrackCarousel>
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
              </TrackCarousel>
            </ShelfSection>
          )}

          {/* Radio Mixes Section */}
          <RadioSection
            mixes={radioMixesToShow}
            currentTrackId={currentTrack?.id}
            onPlayMix={handlePlayMix}
          />

          {/* The feed failed — say so, and offer a way back. */}
          {feedError && (
            <ErrorState
              title="Your stream could not be loaded"
              description={feedError}
              onRetry={() => window.location.reload()}
            />
          )}

          {/* Empty personalized feed — keeps / from rendering a blank page */}
          {!isLoadingFeed && !feedError && feed && !hasFeedContent && (
            <EmptyState
              icon={
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 15V9l8-2v6" />
                  <circle cx="6" cy="17" r="2" />
                  <circle cx="14" cy="15" r="2" />
                </svg>
              }
              title="Your stream is warming up"
              description="Play a few tracks, like what you love, or follow an artist and your personalized shelves will appear here."
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/search"
                    className="font-eyebrow text-caption uppercase tracking-widest px-6 py-2.5 bg-foreground text-background rounded-full hover:opacity-90 transition-opacity"
                  >
                    Explore the catalog
                  </Link>
                  <Link
                    to="/artists"
                    className="font-eyebrow text-caption uppercase tracking-widest px-6 py-2.5 border border-border bg-background text-foreground rounded-full hover:bg-muted transition-colors"
                  >
                    Find artists
                  </Link>
                </div>
              }
            />
          )}

          {/* Loading indicator if feed is still fetching */}
          {isLoadingFeed && (
            <div className="py-12 text-center font-mono text-caption text-muted-foreground animate-pulse">
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
                <H3 className="text-title font-semibold tracking-tight text-foreground sm:text-lg">
                  Featured Master Releases
                </H3>
              </div>
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                Archive MMXXVI
              </span>
            </div>

            {isLoadingCatalog ? (
              <div className="py-8 text-center font-mono text-caption text-muted-foreground animate-pulse">
                Loading master releases...
              </div>
            ) : liveAlbums.length > 0 ? (
              <MediaGrid maxColumns={6}>
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
              </MediaGrid>
            ) : (
              <EmptyState
                title="No releases found"
                description="Nothing has been published yet. Check back soon."
              />
            )}
          </section>

          {/* Radio Mixes Section */}
          <RadioSection
            mixes={curatedRadioMixes}
            currentTrackId={currentTrack?.id}
            onPlayMix={handlePlayMix}
          />

          {/* Master Tapes Correspondence Slip */}
          <section className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-border pb-3">
              <H3 className="text-title font-semibold tracking-tight text-foreground sm:text-lg">
                Newly Released Master Cuts
              </H3>
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                {liveSongs.length > 0
                  ? `${liveSongs.length} Master Works`
                  : '6 Showcase Works'}
              </span>
            </div>

            {liveSongs.length > 0 ? (
              <div className="overflow-clip shadow-xs">
                {liveSongs.map((t, idx) => (
                  <SongRow
                    key={t.id}
                    track={catalogToPlayerTrack(t)}
                    index={idx}
                    variant="standard"
                    onPlay={() => handlePlayCatalogSong(t, idx)}
                    surface="transparent"
                  />
                ))}
              </div>
            ) : (
              <div className="border border-border bg-card divide-y divide-border/60">
                <H4 className="text-body font-semibold text-foreground p-5">
                  No tracks found
                </H4>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
