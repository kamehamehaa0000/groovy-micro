import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  ExternalLink,
  Grid,
  List,
  Radio,
  Share2,
  Shuffle,
  Sparkles,
  Verified,
} from 'lucide-react'
import { artistsApi, type ArtistOverviewResponse } from '../lib/artists.api'
import { formatDuration } from '../lib/catalog.api'
import { shuffleArray } from '../lib/shuffle'
import type { EnrichedSong, PersonalCollectionTrack } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { MediaTile } from '../components/common/MediaTile'
import { CollectionActionBar, CollectionHeader } from '../components/collection'
import { Badge, Button, Eyebrow, IconButton } from '../components/ui'
import { cn } from '../components/ui/cn'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { useFollowsStore } from '../stores/follows.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { SongRow } from '../components/common/SongRow'

export const Route = createFileRoute('/artists/$idOrSlug')({
  component: ArtistPublicProfileComponent,
})

function ArtistPublicProfileComponent() {
  const { idOrSlug } = Route.useParams()
  const { user, isAuthenticated } = useAuthStore()

  // Player store integration
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const contextUri = usePlayerStore((s) => s.contextUri)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Likes & Follows store integration
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds)
  const toggleFollow = useFollowsStore((s) => s.toggleFollow)
  const hydrateArtists = useFollowsStore((s) => s.hydrateArtists)

  // Pre-saves store integration
  const preSavedAlbumIds = usePreSavesStore((s) => s.preSavedAlbumIds)
  const togglePreSaveStore = usePreSavesStore((s) => s.togglePreSave)
  const hydratePreSavedAlbums = usePreSavesStore((s) => s.hydrateAlbums)
  const [preSavingAlbumId, setPreSavingAlbumId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['artist-overview', idOrSlug, user?.id],
    [idOrSlug, user?.id],
  )

  const {
    data: overview,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey,
    queryFn: () => artistsApi.getArtistOverview(idOrSlug),
    staleTime: 60 * 1000,
  })

  const artist = overview?.profile || null
  const discography = overview?.discography || null
  const similarArtists = overview?.similarArtists || []

  // UI state
  const [showAllTopTracks, setShowAllTopTracks] = useState(false)
  const [showAllPersonalTracks, setShowAllPersonalTracks] = useState(false)
  const [isShuffleOn, setIsShuffleOn] = useState(false)

  // Discography tabs & pagination
  const [activeTab, setActiveTab] = useState<
    'all' | 'albums' | 'singles' | 'featured'
  >('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [visibleCount, setVisibleCount] = useState<number>(8)

  // Follow state
  const isFollowing = artist ? followedArtistIds.has(artist.id) : false
  const [followersCount, setFollowersCount] = useState(0)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  // Sync followersCount when overview.profile loads or changes
  useEffect(() => {
    if (overview?.profile) {
      setFollowersCount(overview.profile.followersCount ?? 0)
    }
  }, [overview?.profile?.id, overview?.profile?.followersCount])

  // Copy link feedback
  const [copiedLink, setCopiedLink] = useState(false)

  // Hydrate global Zustand stores (follows, likes, pre-saves)
  useEffect(() => {
    if (!overview) return

    // Hydrate follows store
    if (overview.profile.isFollowing) {
      hydrateArtists([{ id: overview.profile.id, isFollowing: true }])
    }

    // Hydrate likes store from popular tracks
    if (overview.discography?.topTracks?.length) {
      hydrateSongs(overview.discography.topTracks)
    }

    // Hydrate pre-saves store from upcoming releases
    if (overview.discography?.upcoming?.length) {
      hydratePreSavedAlbums(
        overview.discography.upcoming
          .filter((u: any) => u.isPreSaved)
          .map((u: any) => ({ id: u.id, isPreSaved: true })),
      )
    }
  }, [overview, hydrateSongs, hydrateArtists, hydratePreSavedAlbums])

  const handleTogglePreSave = async (album: any) => {
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

    if (preSavingAlbumId === album.id) return
    setPreSavingAlbumId(album.id)

    const isCurrentlyPreSaved = preSavedAlbumIds.has(album.id)
    const prevCount = album.preSavesCount ?? 0

    // Optimistic count update in React Query cache
    queryClient.setQueryData<ArtistOverviewResponse>(queryKey, (old) => {
      if (!old || !old.discography?.upcoming) return old
      return {
        ...old,
        discography: {
          ...old.discography,
          upcoming: old.discography.upcoming.map((u) =>
            u.id === album.id
              ? {
                  ...u,
                  preSavesCount: isCurrentlyPreSaved
                    ? Math.max(0, prevCount - 1)
                    : prevCount + 1,
                }
              : u,
          ),
        },
      }
    })

    try {
      const res = await togglePreSaveStore(album.id)
      queryClient.setQueryData<ArtistOverviewResponse>(queryKey, (old) => {
        if (!old || !old.discography?.upcoming) return old
        return {
          ...old,
          discography: {
            ...old.discography,
            upcoming: old.discography.upcoming.map((u) =>
              u.id === album.id
                ? { ...u, preSavesCount: res.preSavesCount }
                : u,
            ),
          },
        }
      })
    } catch (err: any) {
      // Rollback count on error
      queryClient.setQueryData<ArtistOverviewResponse>(queryKey, (old) => {
        if (!old || !old.discography?.upcoming) return old
        return {
          ...old,
          discography: {
            ...old.discography,
            upcoming: old.discography.upcoming.map((u) =>
              u.id === album.id ? { ...u, preSavesCount: prevCount } : u,
            ),
          },
        }
      })
      alert(err.message || 'Could not update pre-save status')
    } finally {
      setPreSavingAlbumId(null)
    }
  }

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Artist Community',
        subtitle: 'Artists',
        title: 'Follow this artist.',
        description:
          'Sign in or create an account to follow your favorite artists and get updates when they drop new music.',
      })
      return
    }
    if (!artist || isFollowLoading) return

    setIsFollowLoading(true)
    const prevFollowing = isFollowing
    const prevCount = followersCount
    const nextCount = prevFollowing ? Math.max(0, prevCount - 1) : prevCount + 1

    // Optimistically update count
    setFollowersCount(nextCount)
    queryClient.setQueryData<ArtistOverviewResponse>(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        profile: {
          ...old.profile,
          followersCount: nextCount,
          isFollowing: !prevFollowing,
        },
      }
    })

    try {
      const res = await toggleFollow(artist.id)
      setFollowersCount(res.followersCount)
      queryClient.setQueryData<ArtistOverviewResponse>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          profile: {
            ...old.profile,
            followersCount: res.followersCount,
            isFollowing: res.following,
          },
        }
      })
    } catch (err: any) {
      // Rollback count on failure
      setFollowersCount(prevCount)
      queryClient.setQueryData<ArtistOverviewResponse>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          profile: {
            ...old.profile,
            followersCount: prevCount,
            isFollowing: prevFollowing,
          },
        }
      })
      alert(err.message || 'Could not update follow status')
    } finally {
      setIsFollowLoading(false)
    }
  }

  const toPlayerTrack = useCallback(
    (song: EnrichedSong): PlayerTrack => ({
      id: song.id,
      title: song.title,
      artistId: artist?.id || song.artistId || '',
      artistName: artist?.stageName || song.artistStageName || 'Unknown Artist',
      artistSlug: artist?.slug || song.artistSlug,
      albumId: song.albumId || undefined,
      albumTitle: song.albumTitle || undefined,
      albumSlug: song.albumSlug || undefined,
      coverImageUrl:
        song.coverImageUrl || song.albumCoverImageUrl || artist?.avatarUrl,
      durationSeconds: song.durationSeconds,
      audioUrl: song.audioUrl,
      hlsManifestUrl: song.hlsManifestUrl,
      rawAudioKey: song.rawAudioKey,
      isExplicit: song.isExplicit,
      credits: song.credits,
    }),
    [artist],
  )

  const toPlayerTrackFromPersonal = useCallback(
    (track: PersonalCollectionTrack): PlayerTrack => ({
      id: track.id,
      title: track.title,
      artistId: artist?.id || '',
      artistName: track.artistName || artist?.stageName || 'Unknown Artist',
      artistSlug: artist?.slug,
      albumId: track.albumId || null,
      albumTitle: track.albumTitle || undefined,
      albumSlug: track.albumSlug || undefined,
      coverImageUrl: track.coverImageUrl || undefined,
      durationSeconds: track.durationSeconds,
      audioUrl: track.audioUrl,
      hlsManifestUrl: track.hlsManifestUrl,
      rawAudioKey: track.rawAudioKey,
      isExplicit: false,
      scope: 'PERSONAL',
    }),
    [artist],
  )

  const artistContextUri = `artist:${artist?.id || idOrSlug}:top-tracks`
  const isArtistActive = contextUri === artistContextUri
  const isArtistPlaying = isArtistActive && playbackStatus === 'playing'

  const handleHeroPlay = useCallback(() => {
    if (isArtistPlaying) {
      togglePlay()
      return
    }
    if (!discography?.topTracks || discography.topTracks.length === 0) return

    const validTracks = discography.topTracks.filter(
      (t) => t.isStreamable !== false,
    )
    if (validTracks.length === 0) {
      alert('No streamable tracks available for this artist.')
      return
    }

    const ordered = validTracks.map(toPlayerTrack)
    const queue = isShuffleOn ? shuffleArray(ordered) : ordered
    playTrack(
      queue[0],
      queue,
      0,
      artistContextUri,
      `${artist?.stageName || 'Artist'} — Top Tracks`,
    )
  }, [
    isArtistPlaying,
    discography?.topTracks,
    isShuffleOn,
    artistContextUri,
    artist?.stageName,
    playTrack,
    togglePlay,
    toPlayerTrack,
  ])

  const handlePlaySong = (song: EnrichedSong, index?: number) => {
    if (song.isStreamable === false) {
      alert('This cut is scheduled and locked until release.')
      return
    }

    if (currentTrack?.id === song.id) {
      togglePlay()
      return
    }

    if (!discography?.topTracks) return
    const validTracks = discography.topTracks.filter(
      (t) => t.isStreamable !== false,
    )
    const contextTracks = validTracks.map(toPlayerTrack)
    const targetTrack = toPlayerTrack(song)
    const targetIdx = contextTracks.findIndex((t) => t.id === targetTrack.id)

    playTrack(
      targetTrack,
      contextTracks,
      targetIdx >= 0 ? targetIdx : (index ?? 0),
      artistContextUri,
      `${artist?.stageName || 'Artist'} — Top Tracks`,
    )
  }

  const handlePlayLockerSong = (
    track: PersonalCollectionTrack,
    index: number,
  ) => {
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    const lockerTracks = discography?.inYourCollection || []
    const contextTracks: PlayerTrack[] = lockerTracks.map(
      toPlayerTrackFromPersonal,
    )

    playTrack(
      contextTracks[index],
      contextTracks,
      index,
      `personal:artist:${artist?.id || idOrSlug}`,
      `Your Personal Collection — ${artist?.stageName || 'Artist'}`,
    )
  }

  const handleCopyShareLink = async () => {
    if (typeof window === 'undefined') return

    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: artist?.stageName,
          text: artist ? `Listen to ${artist.stageName} on Groovy` : undefined,
          url,
        })
        return
      } catch {
        // Fallback to clipboard
      }
    }

    await navigator.clipboard.writeText(url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const isOwner = Boolean(
    user?.id && artist?.userId && user.id === artist.userId,
  )
  const isPersonalArtist = Boolean(artist?.scope === 'PERSONAL')
  const hasUpcoming = Boolean(
    discography?.upcoming && discography.upcoming.length > 0,
  )
  const hasTopTracks = Boolean(
    discography?.topTracks && discography.topTracks.length > 0,
  )
  const hasInYourCollection = Boolean(
    !isPersonalArtist &&
    discography?.inYourCollection &&
    discography.inYourCollection.length > 0,
  )

  const albumsAndCompilations = useMemo(() => {
    const list = [
      ...(discography?.albums || []),
      ...(discography?.mixtapes || []),
      ...(discography?.eps || []),
    ]
    return list.sort((a, b) => {
      const timeA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const timeB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      return timeB - timeA
    })
  }, [discography?.albums, discography?.mixtapes, discography?.eps])

  const singles = useMemo(() => {
    return [...(discography?.singles || [])].sort((a, b) => {
      const timeA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const timeB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      return timeB - timeA
    })
  }, [discography?.singles])

  const allReleases = useMemo(() => {
    const list = [
      ...(discography?.albums || []),
      ...(discography?.mixtapes || []),
      ...(discography?.eps || []),
      ...(discography?.singles || []),
    ]
    return list.sort((a, b) => {
      const timeA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const timeB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      return timeB - timeA
    })
  }, [
    discography?.albums,
    discography?.mixtapes,
    discography?.eps,
    discography?.singles,
  ])

  const pinnedRelease = useMemo(() => {
    if (artist?.pinnedReleaseId) {
      const found = allReleases.find((r) => r.id === artist.pinnedReleaseId)
      if (found) return found
    }
    return allReleases[0] || null
  }, [artist?.pinnedReleaseId, allReleases])

  const isCustomPick = Boolean(
    artist?.pinnedReleaseId &&
    allReleases.some((r) => r.id === artist.pinnedReleaseId),
  )

  const appearsOn = useMemo(() => {
    return discography?.appearsOn || []
  }, [discography?.appearsOn])

  const collaboratedArtists = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string
        slug: string
        name: string
        avatarUrl?: string | null
        count: number
      }
    >()

    for (const credit of appearsOn) {
      const key =
        credit.primaryArtistSlug ||
        credit.primaryArtistId ||
        credit.primaryArtistName
      if (!key) continue
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        if (!existing.avatarUrl && credit.primaryArtistAvatarUrl) {
          existing.avatarUrl = credit.primaryArtistAvatarUrl
        }
      } else {
        map.set(key, {
          id: credit.primaryArtistId || credit.primaryArtistSlug,
          slug: credit.primaryArtistSlug,
          name: credit.primaryArtistName,
          avatarUrl: credit.primaryArtistAvatarUrl,
          count: 1,
        })
      }
    }

    return Array.from(map.values())
  }, [appearsOn])

  const hasAnyDiscography = allReleases.length > 0 || appearsOn.length > 0

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-32 text-center font-eyebrow text-caption uppercase tracking-wider text-muted-foreground animate-pulse sm:px-8">
        Retrieving artist catalog &amp; recordings...
      </div>
    )
  }

  if (queryError || !artist) {
    return (
      <div className="mx-auto max-w-xl py-24 px-6 text-center">
        <span className="font-eyebrow text-caption uppercase tracking-widest text-primary block mb-2">
          404 Archive Notice
        </span>
        <h1 className="font-serif italic text-3xl text-foreground">
          Artist Profile Not Found
        </h1>
        <p className="font-sans text-caption text-muted-foreground mt-3 leading-relaxed">
          The requested artist identifier{' '}
          <span className="font-mono text-foreground">"{idOrSlug}"</span> could
          not be located in the registered roster.
        </p>
        <Link
          to="/artists"
          className="inline-block mt-6 font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-card hover:bg-background text-foreground transition-colors rounded-control"
        >
          &larr; Return to Roster
        </Link>
      </div>
    )
  }

  const personalTracks = discography?.inYourCollection || []
  const visiblePersonalTracks = showAllPersonalTracks
    ? personalTracks
    : personalTracks.slice(0, 5)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 select-none sm:px-8 sm:pt-10">
      {/* ===================== COLLECTION HERO HEADER ===================== */}
      <CollectionHeader
        className="-mx-4 sm:-mx-8"
        stickyClassName="-mx-4 sm:-mx-8"
        title={artist.stageName}
        eyebrow={
          <Eyebrow
            as="span"
            tone="brand"
            className="font-semibold tracking-widest"
          >
            Artist
          </Eyebrow>
        }
        badges={
          <>
            {artist.verified ? (
              <Badge tone="brand">Verified Creator</Badge>
            ) : null}
            {isPersonalArtist ? (
              <Badge tone="neutral">Personal Vault</Badge>
            ) : null}
          </>
        }
        cover={
          artist.avatarUrl ? (
            <img
              src={artist.avatarUrl}
              alt={artist.stageName}
              className="h-full w-full object-cover"
            />
          ) : (
            <ProceduralCover
              title={artist.stageName}
              artistName={artist.stageName}
              fill
            />
          )
        }
        backdropImageUrl={artist.bannerUrl || artist.avatarUrl || null}
        description={artist.bio || undefined}
        meta={
          <>
            <span className="inline-flex items-center whitespace-nowrap">
              {artist.monthlyListeners.toLocaleString()} Monthly Listeners
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>{followersCount.toLocaleString()} Followers</span>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>@{artist.slug}</span>
            </span>
            {allReleases.length > 0 ? (
              <span className="inline-flex items-center whitespace-nowrap">
                <span aria-hidden="true" className="mr-2 text-border">
                  &bull;
                </span>
                <span>
                  {allReleases.length}{' '}
                  {allReleases.length === 1 ? 'Release' : 'Releases'}
                </span>
              </span>
            ) : null}
          </>
        }
        stickySubtitle={`@${artist.slug} · ${artist.monthlyListeners.toLocaleString()} monthly listeners`}
        stickyThumbnail={
          artist.avatarUrl ? (
            <img
              src={artist.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ProceduralCover
              title={artist.stageName}
              artistName={artist.stageName}
              fill
            />
          )
        }
      />

      {/* ===================== COLLECTION CONTROLS ===================== */}
      <CollectionActionBar
        className="pt-3.5 pb-2 md:pt-2 md:pb-5"
        onPlay={hasTopTracks ? handleHeroPlay : undefined}
        isPlaying={isArtistPlaying}
        playLabel={artist.stageName}
        adjacentAction={
          <IconButton
            size="lg"
            className={
              isShuffleOn ? 'group text-primary! hover:text-primary!' : 'group'
            }
            aria-label={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
            title={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
            aria-pressed={isShuffleOn}
            disabled={!hasTopTracks}
            onClick={() => setIsShuffleOn((prev) => !prev)}
          >
            <Shuffle
              className={`h-5 w-5 transition-transform duration-300 ease-out group-hover:scale-110 group-active:scale-90 ${
                isShuffleOn ? 'rotate-180' : 'rotate-0'
              }`}
            />
          </IconButton>
        }
      >
        {isOwner ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => window.location.assign('/studio')}
            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          >
            Studio
          </Button>
        ) : (
          <Button
            size="sm"
            variant={isFollowing ? 'outline' : 'primary'}
            disabled={isFollowLoading}
            onClick={handleToggleFollow}
          >
            {isFollowLoading
              ? 'Updating...'
              : isFollowing
                ? 'Following'
                : 'Follow'}
          </Button>
        )}

        <IconButton
          size="lg"
          onClick={handleCopyShareLink}
          aria-label="Share artist"
          title="Share artist"
        >
          {copiedLink ? (
            <Check className="h-5 w-5 text-success!" />
          ) : (
            <Share2 className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
          )}
        </IconButton>

        {hasTopTracks && discography?.topTracks?.[0] ? (
          <Link
            to="/radio/$songId"
            params={{ songId: discography.topTracks[0].id }}
            className="text-inherit no-underline"
          >
            <IconButton
              size="lg"
              aria-label="Start artist radio"
              title="Start artist radio"
            >
              <Radio className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
            </IconButton>
          </Link>
        ) : null}
      </CollectionActionBar>

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="mt-6 space-y-10 sm:mt-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-10">
          {/* ==================== LEFT COLUMN: POPULAR, DISCOGRAPHY, PERSONAL ==================== */}
          <div className="lg:col-span-2 space-y-10 min-w-0">
            {/* Top Tracks Section */}
            {hasTopTracks && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 border-b border-border-soft pb-2.5">
                  <h2 className="font-sans text-heading font-semibold text-foreground">
                    Popular Tracks
                  </h2>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                    Ranked by Plays
                  </span>
                </div>

                <div className="overflow-hidden rounded-surface">
                  {/* Desktop Tracklist Column Header */}
                  <div className="hidden items-center justify-between gap-4 border-b border-border/60 px-2 py-2.5 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground sm:flex sm:px-3">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <span className="w-6 text-center">#</span>
                      <span>Title &amp; Credits</span>
                    </div>
                    <div className="w-24 text-right">Streams</div>
                    <div className="flex min-w-30 shrink-0 items-center justify-end gap-3 pr-2 sm:gap-4">
                      <span>Duration</span>
                    </div>
                  </div>

                  <div className="relative space-y-0.5">
                    {discography!.topTracks
                      .slice(0, showAllTopTracks ? undefined : 5)
                      .map((track, idx) => (
                        <SongRow
                          key={track.id}
                          track={toPlayerTrack(track)}
                          index={idx}
                          trackNumberDisplay={idx + 1}
                          variant="artist"
                          surface="transparent"
                          density="compact"
                          playsCount={track.playsCount}
                          onPlay={() => handlePlaySong(track, idx)}
                          hideGoToArtist={true}
                        />
                      ))}
                  </div>
                </div>

                {discography!.topTracks.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllTopTracks((prev) => !prev)}
                    className="mt-1"
                  >
                    {showAllTopTracks ? 'Show less' : 'Show more'}
                  </Button>
                )}
              </div>
            )}

            {/* Upcoming Pre-Savable Releases Shelf */}
            {hasUpcoming && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-sans text-heading font-semibold text-foreground">
                      Upcoming Releases
                    </h2>
                    <Badge tone="brand">Pre-Save</Badge>
                  </div>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                    {discography!.upcoming!.length}{' '}
                    {discography!.upcoming!.length === 1
                      ? 'Scheduled Drop'
                      : 'Scheduled Drops'}
                  </span>
                </div>

                <div className="space-y-3">
                  {discography!.upcoming!.map((up) => {
                    const isPreSaved = preSavedAlbumIds.has(up.id)
                    const dropDateStr = up.scheduledReleaseAt
                      ? new Date(up.scheduledReleaseAt).toLocaleDateString(
                          undefined,
                          {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          },
                        )
                      : 'Coming Soon'

                    return (
                      <div
                        key={up.id}
                        className="rounded-surface border border-primary/30 bg-primary/5 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-raised transition-colors hover:border-primary/60 group"
                      >
                        <Link
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: up.slug }}
                          className="flex items-center gap-3.5 min-w-0 flex-1 text-inherit no-underline"
                        >
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-inset bg-muted border border-border shrink-0 overflow-hidden relative shadow-raised">
                            {up.coverImageUrl ? (
                              <img
                                src={up.coverImageUrl}
                                alt={up.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <ProceduralCover
                                size="sm"
                                title={up.title}
                                artistName={artist.stageName}
                                className="w-full h-full"
                              />
                            )}
                            <div className="absolute top-0.5 left-0.5 font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 bg-background/90 backdrop-blur-xs border border-border text-primary font-semibold rounded-control">
                              {up.albumType}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5 mb-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                              <span>Drops {dropDateStr}</span>
                            </div>
                            <h3 className="font-sans font-semibold text-body sm:text-title text-foreground group-hover:text-primary transition-colors truncate">
                              {up.title}
                            </h3>
                            <p className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                              {up.totalTracks}{' '}
                              {up.totalTracks === 1 ? 'Cut' : 'Cuts'} &bull;
                              Master Audio Locked
                            </p>
                          </div>
                        </Link>

                        <div className="flex items-center justify-end sm:justify-start shrink-0">
                          <Button
                            size="sm"
                            variant={isPreSaved ? 'brand' : 'primary'}
                            disabled={preSavingAlbumId === up.id}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleTogglePreSave(up)
                            }}
                          >
                            <span>
                              {isPreSaved ? '✓ Pre-Saved' : '✦ Pre-Save'}
                            </span>
                            <span className="opacity-80 font-mono text-eyebrow">
                              ({up.preSavesCount ?? 0})
                            </span>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pinned Artist Pick / Latest Drop (Mobile / Tablet - displayed above Discography) */}
            {pinnedRelease ? (
              <ArtistSpotlightCard
                pinnedRelease={pinnedRelease}
                artist={artist}
                isCustomPick={isCustomPick}
                className="block lg:hidden"
              />
            ) : null}

            {/* Consolidated Discography Section */}
            {hasAnyDiscography && (
              <div className="space-y-4">
                {/* Header with Title & View Mode Toggle */}
                <div className="flex items-end justify-between border-b border-border pb-3">
                  <div>
                    <p className="mb-0.5 text-eyebrow font-eyebrow uppercase tracking-widest text-muted-foreground">
                      Catalog
                    </p>
                    <h2 className="font-sans text-heading font-semibold text-foreground">
                      Discography
                    </h2>
                  </div>

                  {/* Grid / List Mode Toggle */}
                  <div className="flex items-center gap-1 border border-border rounded-control p-0.5 bg-card">
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      title="Grid view"
                      aria-label="Grid view"
                      className={`p-1.5 rounded-control transition-colors cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-background text-foreground shadow-raised'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      title="List view"
                      aria-label="List view"
                      className={`p-1.5 rounded-control transition-colors cursor-pointer ${
                        viewMode === 'list'
                          ? 'bg-background text-foreground shadow-raised'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Pill Tabs: All, Albums & Compilations, Singles, Featured On */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: 'all', label: 'All', count: allReleases.length },
                    {
                      id: 'albums',
                      label: 'Albums & Compilations',
                      count: albumsAndCompilations.length,
                    },
                    { id: 'singles', label: 'Singles', count: singles.length },
                    {
                      id: 'featured',
                      label: 'Featured On',
                      count: appearsOn.length,
                    },
                  ]
                    .filter((tab) => tab.count > 0 || tab.id === 'all')
                    .map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.id as any)
                          setVisibleCount(8)
                        }}
                        className={`font-eyebrow text-eyebrow uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                          activeTab === tab.id
                            ? 'bg-foreground text-background font-semibold shadow-raised'
                            : 'bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
                        }`}
                      >
                        {tab.label}
                        <span className="ml-1.5 opacity-60 text-eyebrow">
                          ({tab.count})
                        </span>
                      </button>
                    ))}
                </div>

                {/* Discography Items Container */}
                {activeTab === 'featured' ? (
                  /* Featured On / Collaborations Tab */
                  viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                      {appearsOn.slice(0, visibleCount).map((item) => (
                        <MediaTile
                          key={item.songId}
                          to={
                            item.albumSlug || item.albumId
                              ? '/albums/$idOrSlug'
                              : '/artists/$idOrSlug'
                          }
                          params={{
                            idOrSlug:
                              item.albumSlug ||
                              item.albumId ||
                              item.primaryArtistSlug,
                          }}
                          title={item.songTitle}
                          subtitle={`${item.role} · with ${item.primaryArtistName}`}
                          imageUrl={item.coverImageUrl}
                          artistName={item.primaryArtistName}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {appearsOn.slice(0, visibleCount).map((item) => (
                        <Link
                          key={item.songId}
                          to={
                            item.albumSlug || item.albumId
                              ? '/albums/$idOrSlug'
                              : '/artists/$idOrSlug'
                          }
                          params={{
                            idOrSlug:
                              item.albumSlug ||
                              item.albumId ||
                              item.primaryArtistSlug,
                          }}
                          className="flex items-center gap-3.5 p-2.5 rounded-surface border border-border bg-card hover:bg-muted transition-all group text-inherit no-underline shadow-raised"
                        >
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-inset bg-muted border border-border shrink-0 overflow-hidden relative shadow-raised">
                            {item.coverImageUrl ? (
                              <img
                                src={item.coverImageUrl}
                                alt={item.songTitle}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <ProceduralCover
                                size="sm"
                                title={item.songTitle}
                                artistName={item.primaryArtistName}
                                className="w-full h-full"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-sans font-semibold text-body sm:text-title text-foreground group-hover:text-primary transition-colors truncate">
                                {item.songTitle}
                              </h3>
                              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control border border-primary/30 bg-primary/10 text-primary shrink-0 font-semibold">
                                {item.role}
                              </span>
                            </div>
                            <p className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                              {item.albumTitle ? `${item.albumTitle} · ` : ''}
                              with {item.primaryArtistName} &bull;{' '}
                              {formatDuration(item.songDuration)}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )
                ) : (
                  /* Releases: All, Albums & Compilations, or Singles */
                  (() => {
                    const currentReleases =
                      activeTab === 'albums'
                        ? albumsAndCompilations
                        : activeTab === 'singles'
                          ? singles
                          : allReleases
                    const visibleReleases = currentReleases.slice(
                      0,
                      visibleCount,
                    )

                    return viewMode === 'grid' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                        {visibleReleases.map((album) => (
                          <MediaTile
                            key={album.id}
                            to="/albums/$idOrSlug"
                            params={{ idOrSlug: album.slug }}
                            title={album.title}
                            subtitle={`${album.albumType ? `${album.albumType} · ` : ''}${album.releaseDate ? new Date(album.releaseDate).getFullYear() : 'Recent'}${album.totalTracks > 1 ? ` · ${album.totalTracks} tracks` : ''}`}
                            imageUrl={album.coverImageUrl}
                            artistName={artist?.stageName}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {visibleReleases.map((album) => (
                          <Link
                            key={album.id}
                            to="/albums/$idOrSlug"
                            params={{ idOrSlug: album.slug }}
                            className="flex items-center gap-3.5 p-2.5 rounded-surface border border-border bg-card hover:bg-muted transition-all group text-inherit no-underline shadow-raised"
                          >
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-inset bg-muted border border-border shrink-0 overflow-hidden relative shadow-raised">
                              {album.coverImageUrl ? (
                                <img
                                  src={album.coverImageUrl}
                                  alt={album.title}
                                  loading="lazy"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <ProceduralCover
                                  size="sm"
                                  title={album.title}
                                  artistName={artist?.stageName}
                                  className="w-full h-full"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-sans font-semibold text-body sm:text-title text-foreground group-hover:text-primary transition-colors truncate">
                                  {album.title}
                                </h3>
                                {album.albumType && (
                                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control border border-border bg-background text-muted-foreground shrink-0">
                                    {album.albumType}
                                  </span>
                                )}
                              </div>
                              <p className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                                {album.releaseDate
                                  ? new Date(album.releaseDate).getFullYear()
                                  : 'Recent'}
                                {album.totalTracks
                                  ? ` · ${album.totalTracks} ${album.totalTracks === 1 ? 'cut' : 'cuts'}`
                                  : ''}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )
                  })()
                )}

                {/* Pagination: See More / Show Less */}
                {(() => {
                  const totalInActiveTab =
                    activeTab === 'albums'
                      ? albumsAndCompilations.length
                      : activeTab === 'singles'
                        ? singles.length
                        : activeTab === 'featured'
                          ? appearsOn.length
                          : allReleases.length
                  const hasMore = totalInActiveTab > visibleCount

                  if (hasMore) {
                    return (
                      <div className="pt-2 flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVisibleCount((prev) => prev + 8)}
                        >
                          See More ({totalInActiveTab - visibleCount} remaining)
                        </Button>
                      </div>
                    )
                  }

                  if (totalInActiveTab > 8) {
                    return (
                      <div className="pt-2 flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setVisibleCount(8)}
                        >
                          Show Less
                        </Button>
                      </div>
                    )
                  }

                  return null
                })()}
              </div>
            )}

            {/* In Your Personal Collection (Vault) Shelf - Only shown on GLOBAL artists */}
            {hasInYourCollection && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-sans text-heading font-semibold text-foreground">
                      In Your Personal Collection{' '}
                      {personalTracks.length > 0
                        ? `(${personalTracks.length})`
                        : ''}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to="/vault"
                      className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline"
                    >
                      Vault
                      <ChevronRight className="h-4 w-4 inline" />
                    </Link>
                  </div>
                </div>

                <div className="overflow-hidden rounded-surface">
                  {/* Desktop Tracklist Column Header */}
                  <div className="hidden items-center justify-between gap-4 border-b border-border/60 px-2 py-2.5 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground sm:flex sm:px-3">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <span className="w-6 text-center">#</span>
                      <span>Title &amp; Credits</span>
                    </div>
                    <div className="w-24 text-right">Streams</div>
                    <div className="flex min-w-30 shrink-0 items-center justify-end gap-3 pr-2 sm:gap-4">
                      <span>Duration</span>
                    </div>
                  </div>

                  <div className="relative space-y-0.5">
                    {visiblePersonalTracks.map((track, idx) => (
                      <SongRow
                        key={track.id}
                        track={toPlayerTrackFromPersonal(track)}
                        index={idx}
                        trackNumberDisplay={idx + 1}
                        variant="artist"
                        surface="transparent"
                        density="compact"
                        isPersonal={true}
                        playsCount={track.playsCount}
                        onPlay={() => handlePlayLockerSong(track, idx)}
                        hideGoToArtist={true}
                      />
                    ))}
                  </div>
                </div>

                {personalTracks.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllPersonalTracks((prev) => !prev)}
                    className="mt-1"
                  >
                    {showAllPersonalTracks
                      ? 'Show less'
                      : `Show all ${personalTracks.length} tracks`}
                  </Button>
                )}
              </div>
            )}

            {/* Collaborated Artists Shelf */}
            {collaboratedArtists.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-sans text-heading font-semibold text-foreground">
                      Collaborators &amp; Features
                    </h2>
                    <Badge tone="neutral">Cross-Artist</Badge>
                  </div>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                    {collaboratedArtists.length}{' '}
                    {collaboratedArtists.length === 1 ? 'Artist' : 'Artists'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {collaboratedArtists.map((collab) => (
                    <Link
                      key={collab.slug || collab.id}
                      to="/artists/$idOrSlug"
                      params={{ idOrSlug: collab.slug || collab.id }}
                      className="p-3 rounded-surface border border-border bg-card hover:bg-muted transition-all group text-inherit no-underline flex items-center gap-3 shadow-raised"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted border border-border shrink-0 overflow-hidden relative">
                        {collab.avatarUrl ? (
                          <img
                            src={collab.avatarUrl}
                            alt={collab.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center font-serif italic text-body font-semibold text-muted-foreground">
                            {collab.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-sans font-semibold text-body text-foreground group-hover:text-primary transition-colors truncate">
                          {collab.name}
                        </h4>
                        <p className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                          {collab.count}{' '}
                          {collab.count === 1
                            ? 'collaboration'
                            : 'collaborations'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Similar Artists Shelf (Fans Also Like) */}
            {similarArtists.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-sans text-heading font-semibold text-foreground">
                      Fans Also Like
                    </h2>
                    <Badge tone="neutral">Similar</Badge>
                  </div>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                    {similarArtists.length}{' '}
                    {similarArtists.length === 1 ? 'Artist' : 'Artists'}
                  </span>
                </div>

                <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {similarArtists.map((simArtist) => (
                    <div
                      key={simArtist.id}
                      className="w-35 sm:w-40 shrink-0 text-center"
                    >
                      <MediaTile
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: simArtist.slug }}
                        title={simArtist.stageName}
                        subtitle={
                          <span className="flex items-center justify-center gap-1">
                            <span>{simArtist.primaryGenre || 'Artist'}</span>
                            {simArtist.verified && (
                              <span
                                className="text-primary font-bold text-eyebrow"
                                title="Verified Artist"
                              >
                                <Verified className="h-4 w-4" />
                              </span>
                            )}
                          </span>
                        }
                        imageUrl={simArtist.avatarUrl}
                        artistName={simArtist.stageName}
                        isRoundImage={true}
                        fallbackInitials={simArtist.stageName
                          .slice(0, 2)
                          .toUpperCase()}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* If no discography yet */}
            {!hasAnyDiscography &&
              !hasTopTracks &&
              !hasInYourCollection &&
              !hasUpcoming &&
              collaboratedArtists.length === 0 &&
              similarArtists.length === 0 && (
                <div className="p-8 border border-dashed border-border bg-card/30 rounded-surface text-center">
                  <p className="font-serif italic text-title text-foreground">
                    Master Tracks &amp; Albums In Preparation
                  </p>
                  <p className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mt-1">
                    No public releases have been published to this catalog yet.
                  </p>
                </div>
              )}
          </div>

          {/* ==================== RIGHT COLUMN: SPOTLIGHT & ABOUT ==================== */}
          <div className="flex flex-col gap-6">
            {/* Pinned Artist Pick / Latest Drop (Desktop) */}
            {pinnedRelease ? (
              <ArtistSpotlightCard
                pinnedRelease={pinnedRelease}
                artist={artist}
                isCustomPick={isCustomPick}
                className="hidden lg:block"
              />
            ) : null}

            {/* About & Socials Card */}
            <ArtistAboutCard artist={artist} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   SUB-COMPONENTS
   ========================================================================= */

interface ArtistSpotlightCardProps {
  pinnedRelease: any
  artist: any
  isCustomPick: boolean
  className?: string
}

function ArtistSpotlightCard({
  pinnedRelease,
  artist,
  isCustomPick,
  className,
}: ArtistSpotlightCardProps) {
  if (!pinnedRelease) return null

  return (
    <div
      className={cn(
        'group rounded-surface border border-border bg-card/60 p-4 shadow-raised transition-all duration-200 hover:border-border hover:bg-card hover:shadow-floating sm:p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-soft pb-3">
        <div className="flex items-center gap-2">
          {isCustomPick && artist.avatarUrl ? (
            <div className="h-5 w-5 shrink-0 overflow-hidden rounded-full border border-border bg-background">
              <img
                src={artist.avatarUrl}
                alt={artist.stageName}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
          <span className="font-eyebrow text-eyebrow font-semibold uppercase tracking-widest text-primary">
            {isCustomPick ? '✦ Artist Pick' : '✦ Latest Drop'}
          </span>
        </div>
        {pinnedRelease.albumType ? (
          <Badge tone="neutral">{pinnedRelease.albumType}</Badge>
        ) : null}
      </div>

      {isCustomPick && artist.pinnedComment ? (
        <p className="mt-3 font-serif italic text-caption leading-relaxed text-muted-foreground">
          &ldquo;{artist.pinnedComment}&rdquo;
        </p>
      ) : null}

      <Link
        to="/albums/$idOrSlug"
        params={{ idOrSlug: pinnedRelease.slug || pinnedRelease.id }}
        className="mt-3.5 flex items-center gap-3.5 text-inherit no-underline"
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-inset border border-border bg-muted shadow-raised sm:h-16 sm:w-16">
          {pinnedRelease.coverImageUrl ? (
            <img
              src={pinnedRelease.coverImageUrl}
              alt={pinnedRelease.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <ProceduralCover
              size="sm"
              title={pinnedRelease.title}
              artistName={artist.stageName}
              className="h-full w-full"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-sans text-body font-semibold text-foreground transition-colors group-hover:text-primary sm:text-title">
            {pinnedRelease.title}
          </h3>
          <p className="mt-0.5 truncate font-sans text-caption text-muted-foreground">
            {pinnedRelease.releaseDate
              ? new Date(pinnedRelease.releaseDate).getFullYear()
              : 'Recent'}{' '}
            &bull; {pinnedRelease.totalTracks}{' '}
            {pinnedRelease.totalTracks === 1 ? 'cut' : 'cuts'}
          </p>
        </div>
      </Link>
    </div>
  )
}

interface ArtistAboutCardProps {
  artist: any
  className?: string
}

function ArtistAboutCard({ artist, className }: ArtistAboutCardProps) {
  const hasBio = Boolean(artist?.bio)
  const socialEntries = Object.entries(artist?.socialLinks || {}).filter(
    ([, url]) => Boolean(url),
  )
  const hasSocials = socialEntries.length > 0

  if (!hasBio && !hasSocials) return null

  return (
    <div
      className={cn(
        'rounded-surface border border-border bg-card/60 p-4 shadow-raised sm:p-5 space-y-4',
        className,
      )}
    >
      {hasBio ? (
        <div className={hasSocials ? 'border-b border-border-soft pb-4' : ''}>
          <p className="mb-2 font-eyebrow text-eyebrow font-semibold uppercase tracking-widest text-muted-foreground">
            About
          </p>
          <p className="font-sans text-caption leading-relaxed text-foreground whitespace-pre-line">
            {artist.bio}
          </p>
        </div>
      ) : null}

      {hasSocials ? (
        <div>
          <p className="mb-2.5 font-eyebrow text-eyebrow font-semibold uppercase tracking-widest text-muted-foreground">
            Connect &amp; Links
          </p>
          <div className="flex flex-wrap gap-2">
            {socialEntries.map(([platform, url]) => (
              <a
                key={platform}
                href={url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/30 px-3 py-1 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-all duration-150 hover:border-foreground hover:bg-secondary/60 hover:text-foreground active:scale-95"
              >
                <span className="capitalize">{platform}</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
