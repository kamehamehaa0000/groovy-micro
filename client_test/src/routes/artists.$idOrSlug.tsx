import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { artistsApi, type ArtistOverviewResponse } from '../lib/artists.api'
import { formatDuration } from '../lib/catalog.api'
import type {
  EnrichedSong,
  PersonalCollectionTrack,
} from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { MediaTile } from '../components/common/MediaTile'
import {
  VerifiedBadgeSVG,
  ExternalLinkSVG,
  SvgArtworkSpiral,
  PlayIconSVG,
  GridIconSVG,
  ListIconSVG,
} from '../components/icons'
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

  // Player integration
  const { currentTrack, playTrack, togglePlay } = usePlayerStore()

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
  const [showAllTopTracks, setShowAllTopTracks] = useState(false)

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

  const toPlayerTrack = (song: EnrichedSong): PlayerTrack => ({
    id: song.id,
    title: song.title,
    artistId: artist?.id || song.artistId || '',
    artistName: artist?.stageName || song.artistStageName || 'Unknown Artist',
    artistSlug: artist?.slug || song.artistSlug,
    albumId: song.albumId || undefined,
    albumTitle: song.albumTitle || undefined,
    albumSlug: song.albumSlug || undefined,
    coverImageUrl:
      song.coverImageUrl || song.albumCoverImageUrl || artist?.bannerUrl,
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
      `artist:${artist?.id || idOrSlug}:top-tracks`,
      `${artist?.stageName || 'Artist'} — Top Tracks`,
    )
  }

  const handlePlayArtistFromStart = () => {
    if (!discography?.topTracks || discography.topTracks.length === 0) return
    const firstPlayableIdx = discography.topTracks.findIndex(
      (t) => t.isStreamable !== false,
    )
    if (firstPlayableIdx >= 0) {
      handlePlaySong(discography.topTracks[firstPlayableIdx], firstPlayableIdx)
    } else {
      alert('No streamable tracks available for this artist.')
    }
  }

  const toPlayerTrackFromPersonal = (
    track: PersonalCollectionTrack,
  ): PlayerTrack => ({
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
  })

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
      await navigator.share({
        title: artist?.stageName,
        text: artist ? `Listen to ${artist.stageName} on Groovy` : undefined,
        url,
      })
      return
    }

    await navigator.clipboard.writeText(url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const isOwner = Boolean(user?.id && artist?.userId && user.id === artist.userId)
  const hasUpcoming = Boolean(
    discography?.upcoming && discography.upcoming.length > 0,
  )
  const hasTopTracks = Boolean(
    discography?.topTracks && discography.topTracks.length > 0,
  )
  const hasInYourCollection = Boolean(
    discography?.inYourCollection && discography.inYourCollection.length > 0,
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
      <div className="py-32 text-center font-eyebrow text-caption uppercase tracking-wider text-muted-foreground animate-pulse">
        Retrieving artist catalog & recordings...
      </div>
    )
  }

  if (queryError || !artist) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-eyebrow text-caption uppercase tracking-widest text-primary block mb-2">
          404 Archive Notice
        </span>
        <h1 className="font-serif italic text-3xl text-foreground">
          Artist Profile Not Found
        </h1>
        <p className="font-sans text-caption text-muted-foreground mt-3 leading-relaxed">
          The requested artist identifier{' '}
          <span className="font-mono text-foreground">"{idOrSlug}"</span> could not be
          located in the registered roster.
        </p>
        <Link
          to="/artists"
          className="inline-block mt-6 font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-card hover:bg-background text-foreground transition-colors"
        >
          &larr; Return to Roster
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full pb-20 ">
      {/* ===================== ARTIST HEADER ===================== */}
      <section className="relative overflow-hidden border-b border-border bg-background">
        {/* Banner */}
        <div className="relative h-56 sm:h-72 md:h-80 lg:h-96 overflow-hidden bg-muted">
          {artist.bannerUrl ? (
            <img
              src={artist.bannerUrl}
              alt={artist.stageName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full relative flex items-center justify-center">
              <SvgArtworkSpiral />
              <span className="font-serif italic text-5xl sm:text-7xl md:text-8xl text-muted-foreground/20 select-none">
                {artist.stageName}
              </span>
            </div>
          )}

          {/* Editorial gradient */}
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent" />

          {/* Share */}
          <div className="absolute top-4 left-4 right-4 flex justify-end pointer-events-none">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="
            pointer-events-auto
            inline-flex items-center justify-center
            min-h-9
            px-3.5
            border border-border
            bg-background/80
            backdrop-blur-xs
            font-mono text-eyebrow
            uppercase tracking-wider
            text-foreground
            hover:bg-background
            transition-colors
            shadow-raised
            cursor-pointer
          "
            >
              {copiedLink ? '✓ Copied' : 'Share'}
            </button>
          </div>
        </div>

        {/* ===================== IDENTITY ===================== */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div
            className=" relative flex flex-col md:flex-row md:items-end md:justify-between gap-5 md:gap-8 py-6 md:py-7
        "
          >
            {/* Identity */}
            <div className="min-w-0 flex-1">
              {/* Verification */}
              <div className="flex items-center gap-2 mb-2">
                {artist.verified && (
                  <span
                    title="Verified Creator"
                    className="
                  inline-flex items-center gap-1.5
                  text-primary
                  font-mono text-eyebrow
                  uppercase tracking-wider
                  font-semibold
                "
                  >
                    <VerifiedBadgeSVG className="w-3.5 h-3.5" />
                    Verified creator
                  </span>
                )}
              </div>

              {/* Artist name */}
              <h1
                className="
              font-serif italic
              text-[2.25rem]
              sm:text-5xl
              md:text-6xl
              leading-[0.95]
              tracking-[-0.03em]
              text-foreground
              max-w-4xl
              wrap-break-words
            "
              >
                {artist.stageName}
              </h1>

              {/* Metadata */}
              <div
                className="
              flex flex-wrap
              items-center
              gap-x-2.5
              gap-y-1.5
              mt-3
              font-mono
              text-eyebrow
              text-muted-foreground
            "
              >
                <span className="truncate max-w-full">@{artist.slug}</span>

                <span className="text-muted-foreground/50">·</span>

                <span>
                  {artist.monthlyListeners.toLocaleString()} monthly listeners
                </span>

                <span className="text-muted-foreground/50">·</span>

                <span>{followersCount.toLocaleString()} followers</span>
              </div>
            </div>

            {/* ===================== ACTIONS ===================== */}
            <div
              className="
            grid
            grid-cols-[minmax(0,1fr)_auto]
            sm:flex
            items-center
            gap-2
            shrink-0
          "
            >
              {hasTopTracks && (
                <button
                  type="button"
                  onClick={handlePlayArtistFromStart}
                  className="rounded-control inline-flex items-center justify-center gap-2 min-h-10 px-5 sm:px-6 bg-primary text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold hover:opacity-90 transition-opacity shadow-raised cursor-pointer
              "
                >
                  <PlayIconSVG className="w-3.5 h-3.5" />
                  Play
                </button>
              )}
              {isOwner ? (
                <Link
                  to="/studio"
                  className="rounded-control inline-flex items-center justify-center min-h-10 px-4 sm:px-5 bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider hover:opacity-90 transition-opacity whitespace-nowrap
              "
                >
                  <span className="sm:hidden">Studio</span>
                  <span className="hidden sm:inline">✦ Manage in Studio</span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isFollowLoading}
                  onClick={handleToggleFollow}
                  className={`rounded-control inline-flex items-center justify-center min-h-10 px-4 sm:px-6 font-eyebrow text-eyebrow uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap
                ${
                  isFollowing
                    ? ` border border-border bg-card text-foreground hover:border-destructive hover:text-destructive`
                    : ` bg-foreground text-background hover:opacity-90`
                }
              `}
                >
                  {isFollowLoading
                    ? 'Updating...'
                    : isFollowing
                      ? 'Following'
                      : 'Follow'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== BIOGRAPHY & SOCIALS ===================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-10">
        {/* Left Column: Discography & Popular Tracks */}
        <div className="md:col-span-2 space-y-10">
          {/* Top Tracks Section */}
          {hasTopTracks && (
            <div className="space-y-3 px-1">
              <div className="flex justify-between items-baseline border-b border-border-soft pb-2">
                <h2 className="font-serif font-semibold  italic text-heading text-foreground">
                  Popular Tracks
                </h2>
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                  Ranked by Plays
                </span>
              </div>

              <div className="border border-border rounded-md overflow-clip bg-card divide-y divide-border/60 shadow-raised">
                {discography!.topTracks
                  .slice(0, showAllTopTracks ? undefined : 5)
                  .map((track, idx) => (
                    <SongRow
                      key={track.id}
                      track={toPlayerTrack(track)}
                      index={idx}
                      trackNumberDisplay={idx + 1}
                      variant="artist"
                      playsCount={track.playsCount}
                      onPlay={() => handlePlaySong(track, idx)}
                      hideGoToArtist={true}
                    />
                  ))}
              </div>
              {discography!.topTracks.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllTopTracks((showAll) => !showAll)}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:text-foreground transition-colors cursor-pointer"
                >
                  {showAllTopTracks ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {/* Upcoming Pre-Savable Releases Shelf */}
          {hasUpcoming && (
            <div className="space-y-3 px-1">
              <div className="flex justify-between items-baseline border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif italic text-lg sm:text-heading text-foreground font-semibold">
                    Upcoming Releases
                  </h2>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-semibold">
                    Pre-Save
                  </span>
                </div>
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                  {discography!.upcoming!.length}{' '}
                  {discography!.upcoming!.length === 1
                    ? 'Scheduled Drop'
                    : 'Scheduled Drops'}
                </span>
              </div>

              <div className="space-y-2.5">
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
                      className="border border-primary/30 bg-primary/5 hover:border-primary/60 transition-colors rounded-lg p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-raised group"
                    >
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: up.slug }}
                        className="flex items-center gap-3.5 min-w-0 flex-1 text-inherit no-underline"
                      >
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
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
                              className="w-full h-full rounded-none"
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
                            {up.totalTracks === 1 ? 'Cut' : 'Cuts'} &bull; Master
                            Audio Locked
                          </p>
                        </div>
                      </Link>

                      <div className="flex items-center justify-end sm:justify-start shrink-0">
                        <button
                          type="button"
                          disabled={preSavingAlbumId === up.id}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleTogglePreSave(up)
                          }}
                          className={`font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3.5 rounded-control border transition-all cursor-pointer flex items-center gap-1.5 font-semibold shadow-raised whitespace-nowrap ${
                            isPreSaved
                              ? 'border-primary bg-primary text-background hover:opacity-90'
                              : 'border-foreground bg-foreground text-background hover:opacity-90'
                          }`}
                        >
                          <span>
                            {isPreSaved ? '✓ Pre-Saved' : '✦ Pre-Save'}
                          </span>
                          <span className="opacity-80 font-mono text-eyebrow">
                            ({up.preSavesCount ?? 0})
                          </span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Consolidated Discography Section */}
          {hasAnyDiscography && (
            <div className="space-y-4 px-1">
              {/* Header with Title & View Mode Toggle */}
              <div className="flex items-end justify-between border-b border-border pb-3">
                <div>
                  <p className="mb-1 text-eyebrow font-eyebrow uppercase tracking-widest text-muted-foreground">
                    Catalog
                  </p>
                  <h2 className="font-serif italic text-2xl sm:text-3xl text-foreground font-normal">
                    Discography
                  </h2>
                </div>

                {/* Grid / List Mode Toggle */}
                <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-card">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-background text-foreground shadow-raised'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <GridIconSVG className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    title="List view"
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-background text-foreground shadow-raised'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ListIconSVG className="w-3.5 h-3.5" />
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
                          ? 'bg-foreground text-background font-semibold shadow-xs'
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
                        className="flex items-center gap-3.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-all group text-inherit no-underline"
                      >
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
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
                              className="w-full h-full rounded-none"
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
                            {item.albumTitle ? `${item.albumTitle} · ` : ''}with{' '}
                            {item.primaryArtistName} &bull;{' '}
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
                  const visibleReleases = currentReleases.slice(0, visibleCount)

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
                          className="flex items-center gap-3.5 p-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-all group text-inherit no-underline"
                        >
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
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
                                className="w-full h-full rounded-none"
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
                      <button
                        type="button"
                        onClick={() => setVisibleCount((prev) => prev + 8)}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer rounded-md font-medium"
                      >
                        See More ({totalInActiveTab - visibleCount} remaining)
                      </button>
                    </div>
                  )
                }

                if (totalInActiveTab > 8) {
                  return (
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setVisibleCount(8)}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        Show Less
                      </button>
                    </div>
                  )
                }

                return null
              })()}
            </div>
          )}

          {/* In Your Personal Collection (Vault) Shelf */}
          {hasInYourCollection && (
            <div className="space-y-3 px-1">
              <div className="flex justify-between items-baseline border-b border-border pb-2">
                <div className="flex items-center gap-2.5">
                  <h2 className="font-serif italic text-heading text-foreground font-semibold">
                    In Your Personal Collection
                  </h2>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full font-semibold">
                    Personal Vault
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                    {discography!.inYourCollection!.length}{' '}
                    {discography!.inYourCollection!.length === 1
                      ? 'Track'
                      : 'Tracks'}
                  </span>
                  <Link
                    to="/vault"
                    className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline"
                  >
                    Vault &rarr;
                  </Link>
                </div>
              </div>

              <div className="border border-border rounded-md overflow-clip bg-card divide-y divide-border/60 shadow-raised">
                {discography!.inYourCollection!.map((track, idx) => (
                  <SongRow
                    key={track.id}
                    track={toPlayerTrackFromPersonal(track)}
                    index={idx}
                    trackNumberDisplay={idx + 1}
                    variant="artist"
                    isPersonal={true}
                    playsCount={track.playsCount}
                    onPlay={() => handlePlayLockerSong(track, idx)}
                    hideGoToArtist={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Collaborated Artists Shelf */}
          {collaboratedArtists.length > 0 && (
            <div className="space-y-3 px-1">
              <div className="flex justify-between items-baseline border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif italic text-lg sm:text-heading text-foreground font-semibold">
                    Collaborators &amp; Features
                  </h2>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-full font-semibold">
                    Cross-Artist
                  </span>
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
                    className="p-3 rounded-lg border border-border bg-card hover:bg-muted transition-all group text-inherit no-underline flex items-center gap-3 shadow-raised"
                  >
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs flex items-center justify-center">
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

          {/* Similar Artists Shelf (Fans Also Like) - Strictly Global Variant */}
          {similarArtists.length > 0 && (
            <div className="space-y-3 px-1">
              <div className="flex justify-between items-baseline border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif italic text-lg sm:text-heading text-foreground font-semibold">
                    Fans Also Like
                  </h2>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-full font-semibold">
                    Similar Artists
                  </span>
                </div>
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                  {similarArtists.length}{' '}
                  {similarArtists.length === 1 ? 'Artist' : 'Artists'}
                </span>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {similarArtists.map((simArtist) => (
                  <div key={simArtist.id} className="w-[140px] sm:w-[160px] shrink-0 text-center">
                    <MediaTile
                      to="/artists/$idOrSlug"
                      params={{ idOrSlug: simArtist.slug }}
                      title={simArtist.stageName}
                      subtitle={
                        <span className="flex items-center justify-center gap-1">
                          <span>{simArtist.primaryGenre || 'Artist'}</span>
                          {simArtist.verified && (
                            <span className="text-primary font-bold text-eyebrow" title="Verified Artist">✓</span>
                          )}
                        </span>
                      }
                      imageUrl={simArtist.avatarUrl}
                      artistName={simArtist.stageName}
                      isRoundImage={true}
                      fallbackInitials={simArtist.stageName.slice(0, 2).toUpperCase()}
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
              <div className="p-8 border border-dashed border-border bg-card/30 text-center">
                <p className="font-serif italic text-title text-foreground">
                  Master Tracks & Albums In Preparation
                </p>
                <p className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mt-1">
                  No public releases have been published to this catalog yet.
                </p>
              </div>
            )}
        </div>

        {/* Right Column: Social Channels & Telemetry */}
        <div className="flex flex-col gap-6">
          {/* ===================== ARTIST SPOTLIGHT / LATEST RELEASE ===================== */}
          {pinnedRelease && (
            <div className="border border-border rounded-md bg-card p-4 sm:p-5 shadow-raised space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border-soft pb-2.5">
                <div className="flex items-center gap-2">
                  {isCustomPick && artist.avatarUrl && (
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-border bg-background shrink-0">
                      <img
                        src={artist.avatarUrl}
                        alt={artist.stageName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-semibold flex items-center gap-1.5">
                    <span>{isCustomPick ? '✦ Artist Pick' : '✦ Latest Drop'}</span>
                  </span>
                </div>
                {pinnedRelease.albumType && (
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control border border-border bg-background text-muted-foreground">
                    {pinnedRelease.albumType}
                  </span>
                )}
              </div>

              {isCustomPick && artist.pinnedComment && (
                <p className="font-serif italic text-caption text-foreground/90 leading-relaxed bg-background/60 p-2.5 rounded-control border border-border-soft">
                  "{artist.pinnedComment}"
                </p>
              )}

              <Link
                to="/albums/$idOrSlug"
                params={{ idOrSlug: pinnedRelease.slug || pinnedRelease.id }}
                className="flex items-center gap-3.5 group text-inherit no-underline"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
                  {pinnedRelease.coverImageUrl ? (
                    <img
                      src={pinnedRelease.coverImageUrl}
                      alt={pinnedRelease.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <ProceduralCover
                      size="sm"
                      title={pinnedRelease.title}
                      artistName={artist.stageName}
                      className="w-full h-full rounded-none"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-sans font-semibold text-body sm:text-title text-foreground group-hover:text-primary transition-colors truncate">
                    {pinnedRelease.title}
                  </h3>
                  <p className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                    {pinnedRelease.releaseDate
                      ? new Date(pinnedRelease.releaseDate).getFullYear()
                      : 'Recent'}{' '}
                    &bull; {pinnedRelease.totalTracks}{' '}
                    {pinnedRelease.totalTracks === 1 ? 'cut' : 'cuts'}
                  </p>
                </div>
              </Link>
            </div>
          )}

          {/* Social Links Pill List */}

          <div className="p-5 border border-border bg-card rounded-md">
            {/* About Blurb */}
            {artist.bio && (
              <div className="mb-5">
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block mb-2">
                  About Artist
                </span>
                <p className="font-sans text-caption text-foreground leading-relaxed whitespace-pre-line">
                  {artist.bio}
                </p>
              </div>
            )}

            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block mb-3">
              Official Links & Press
            </span>

            {artist.socialLinks &&
            Object.keys(artist.socialLinks).length > 0 ? (
              <div className="flex flex-col gap-2">
                {Object.entries(artist.socialLinks).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between py-2 px-3 border border-border-soft bg-background hover:border-foreground text-foreground font-mono text-caption transition-colors group"
                  >
                    <span className="capitalize">{platform}</span>
                    <ExternalLinkSVG className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="font-sans text-caption text-muted-foreground italic">
                No social profiles linked.
              </p>
            )}
          </div>

          {/* Registration Metadata */}
          <div className="p-5 border border-border-soft bg-muted/50 text-muted-foreground font-mono text-eyebrow flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span>Member Since:</span>
              <span className="text-foreground">
                {new Date(artist.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Verification:</span>
              <span
                className={
                  artist.verified ? 'text-primary font-semibold' : 'text-muted-foreground'
                }
              >
                {artist.verificationStatus}
              </span>
            </div>
            {discography && (
              <div className="flex justify-between pt-1 border-t border-border-soft">
                <span>Releases:</span>
                <span className="text-foreground">
                  {(discography.albums?.length || 0) +
                    (discography.mixtapes?.length || 0) +
                    (discography.eps?.length || 0) +
                    (discography.singles?.length || 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
