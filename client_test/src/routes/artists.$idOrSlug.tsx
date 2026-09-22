import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { artistsApi } from '../lib/artists.api'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import type { ArtistProfile } from '../types/artist'
import type {
  DiscographyResponse,
  EnrichedSong,
  PersonalCollectionTrack,
} from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { ProceduralCover } from '../components/common/ProceduralCover'
import {
  VerifiedBadgeSVG,
  ExternalLinkSVG,
  SvgArtworkSpiral,
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  DiscIconSVG,
  CalendarIconSVG,
} from '../components/icons'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { useFollowsStore } from '../stores/follows.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { SongActionMenu } from '../components/player/SongActionMenu'

export const Route = createFileRoute('/artists/$idOrSlug')({
  component: ArtistPublicProfileComponent,
})

function ArtistPublicProfileComponent() {
  const { idOrSlug } = Route.useParams()
  const { user, isAuthenticated } = useAuthStore()

  // Player integration
  const { currentTrack, playbackStatus, playTrack, togglePlay } =
    usePlayerStore()

  // Likes & Follows store integration
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds)
  const toggleFollow = useFollowsStore((s) => s.toggleFollow)
  const hydrateArtists = useFollowsStore((s) => s.hydrateArtists)

  // Pre-saves store integration
  const preSavedAlbumIds = usePreSavesStore((s) => s.preSavedAlbumIds)
  const togglePreSaveStore = usePreSavesStore((s) => s.togglePreSave)
  const hydratePreSavedAlbums = usePreSavesStore((s) => s.hydrateAlbums)
  const [preSavingAlbumId, setPreSavingAlbumId] = useState<string | null>(null)

  const [artist, setArtist] = useState<ArtistProfile | null>(null)
  const [discography, setDiscography] = useState<DiscographyResponse | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Follow state
  const isFollowing = artist ? followedArtistIds.has(artist.id) : false
  const [followersCount, setFollowersCount] = useState(0)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  // Copy link feedback
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setErrorMsg(null)

    Promise.all([
      artistsApi.getByIdOrSlug(idOrSlug),
      catalogApi.getArtistDiscography(idOrSlug).catch(() => null),
    ])
      .then(([artistData, discoData]) => {
        if (!isMounted) return
        setArtist(artistData)
        setDiscography(discoData)
        setFollowersCount(artistData.followersCount ?? 0)

        // Hydrate follows store
        if (artistData.isFollowing) {
          hydrateArtists([{ id: artistData.id, isFollowing: true }])
        }

        // Hydrate likes store from popular tracks
        if (discoData?.topTracks?.length) {
          hydrateSongs(discoData.topTracks)
        }

        // Hydrate pre-saves store from upcoming releases
        if (discoData?.upcoming?.length) {
          hydratePreSavedAlbums(
            discoData.upcoming
              .filter((u: any) => u.isPreSaved)
              .map((u: any) => ({ id: u.id, isPreSaved: true }))
          )
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setErrorMsg(err.message || 'Failed to load artist profile')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [idOrSlug, hydrateSongs, hydrateArtists, hydratePreSavedAlbums])

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

    // Optimistic count update in discography state
    setDiscography((prev) => {
      if (!prev || !prev.upcoming) return prev
      return {
        ...prev,
        upcoming: prev.upcoming.map((u) =>
          u.id === album.id
            ? {
                ...u,
                preSavesCount: isCurrentlyPreSaved
                  ? Math.max(0, prevCount - 1)
                  : prevCount + 1,
              }
            : u,
        ),
      }
    })

    try {
      const res = await togglePreSaveStore(album.id)
      setDiscography((prev) => {
        if (!prev || !prev.upcoming) return prev
        return {
          ...prev,
          upcoming: prev.upcoming.map((u) =>
            u.id === album.id ? { ...u, preSavesCount: res.preSavesCount } : u,
          ),
        }
      })
    } catch (err: any) {
      // Rollback count on error
      setDiscography((prev) => {
        if (!prev || !prev.upcoming) return prev
        return {
          ...prev,
          upcoming: prev.upcoming.map((u) =>
            u.id === album.id ? { ...u, preSavesCount: prevCount } : u,
          ),
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

    // Optimistically update count
    setFollowersCount(
      prevFollowing ? Math.max(0, prevCount - 1) : prevCount + 1,
    )

    try {
      const res = await toggleFollow(artist.id)
      setFollowersCount(res.followersCount)
    } catch (err: any) {
      // Rollback count on failure
      setFollowersCount(prevCount)
      alert(err.message || 'Could not update follow status')
    } finally {
      setIsFollowLoading(false)
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

    // Optimistic track count update in topTracks
    setDiscography((prev) => {
      if (!prev) return null
      return {
        ...prev,
        topTracks: prev.topTracks.map((t) =>
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
      setDiscography((prev) => {
        if (!prev) return null
        return {
          ...prev,
          topTracks: prev.topTracks.map((t) =>
            t.id === track.id ? { ...t, likesCount: res.likesCount } : t,
          ),
        }
      })
    } catch {
      // Rollback on failure
      setDiscography((prev) => {
        if (!prev) return null
        return {
          ...prev,
          topTracks: prev.topTracks.map((t) =>
            t.id === track.id ? { ...t, likesCount: prevCount } : t,
          ),
        }
      })
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

  const handlePlayLockerSong = (
    track: PersonalCollectionTrack,
    index: number,
  ) => {
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    const lockerTracks = discography?.inYourCollection || []
    const contextTracks: PlayerTrack[] = lockerTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artistId: artist?.id || '',
      artistName: t.artistName || artist?.stageName || 'Unknown Artist',
      artistSlug: artist?.slug,
      albumTitle: t.albumTitle || undefined,
      coverImageUrl: t.coverImageUrl || undefined,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      hlsManifestUrl: t.hlsManifestUrl,
      rawAudioKey: t.rawAudioKey,
      isExplicit: false,
    }))

    playTrack(
      contextTracks[index],
      contextTracks,
      index,
      `personal:artist:${artist?.id || idOrSlug}`,
      `Your Personal Collection — ${artist?.stageName || 'Artist'}`,
    )
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
        Retrieving artist catalog & recordings...
      </div>
    )
  }

  if (errorMsg || !artist) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-blue block mb-2">
          404 Archive Notice
        </span>
        <h1 className="font-serif italic text-3xl text-ink">
          Artist Profile Not Found
        </h1>
        <p className="font-sans text-xs text-ink-soft mt-3 leading-relaxed">
          The requested artist identifier{' '}
          <span className="font-mono text-ink">"{idOrSlug}"</span> could not be
          located in the registered roster.
        </p>
        <Link
          to="/artists"
          className="inline-block mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors"
        >
          &larr; Return to Roster
        </Link>
      </div>
    )
  }

  const isOwner = user?.id === artist.userId
  const hasUpcoming = Boolean(discography?.upcoming && discography.upcoming.length > 0)
  const hasAlbums = discography?.albums && discography.albums.length > 0
  const hasMixtapes = discography?.mixtapes && discography.mixtapes.length > 0
  const hasEpsOrSingles =
    (discography?.eps && discography.eps.length > 0) ||
    (discography?.singles && discography.singles.length > 0)
  const hasTopTracks =
    discography?.topTracks && discography.topTracks.length > 0
  const hasAppearsOn =
    discography?.appearsOn && discography.appearsOn.length > 0
  const hasInYourCollection =
    discography?.inYourCollection && discography.inYourCollection.length > 0

  return (
    <div className="w-full pb-20">
      {/* ===================== HERO BANNER ===================== */}
      <div className="w-full h-64 sm:h-80 md:h-96 relative bg-canvas-deep border-b border-line overflow-hidden">
        {artist.bannerUrl ? (
          <img
            src={artist.bannerUrl}
            alt={artist.stageName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full relative flex items-center justify-center">
            <SvgArtworkSpiral />
            <span className="font-serif italic text-5xl sm:text-7xl text-ink-soft/20 select-none">
              {artist.stageName}
            </span>
          </div>
        )}

        {/* Ambient Gradient Overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-canvas via-canvas/40 to-transparent" />

        {/* Top Controls Overlay */}
        <div className="absolute top-4 left-4 right-4 max-w-6xl mx-auto flex items-center justify-between pointer-events-none">
          <Link
            to="/artists"
            className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 bg-canvas/80 backdrop-blur-xs border border-line text-ink hover:bg-canvas transition-colors shadow-2xs"
          >
            &larr; Roster
          </Link>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 bg-canvas/80 backdrop-blur-xs border border-line text-ink hover:bg-canvas transition-colors shadow-2xs cursor-pointer"
          >
            {copiedLink ? '✓ Copied URL' : 'Share Profile'}
          </button>
        </div>
      </div>

      {/* ===================== ARTIST IDENTITY BAR ===================== */}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 -mt-16 sm:-mt-20 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-line">
          {/* Identity & Badges */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-serif italic text-3xl sm:text-5xl text-ink tracking-tight">
                {artist.stageName}
              </h1>
              {artist.verified && (
                <div
                  title="Verified Creator"
                  className="inline-flex items-center gap-1 py-0.5 px-2 bg-blue/10 border border-blue/20 rounded-full font-mono text-[9px] uppercase tracking-[0.14em] text-blue font-semibold"
                >
                  <VerifiedBadgeSVG className="w-3.5 h-3.5" />
                  <span>Verified</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 text-ink-soft font-mono text-xs">
              <span>@{artist.slug}</span>
              <span>•</span>
              <span>
                {artist.monthlyListeners.toLocaleString()} monthly listeners
              </span>
              <span>•</span>
              <span>{followersCount.toLocaleString()} followers</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            {hasTopTracks && (
              <button
                type="button"
                onClick={handlePlayArtistFromStart}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 bg-blue text-canvas hover:opacity-90 transition-opacity font-semibold shadow-2xs flex items-center gap-2 cursor-pointer"
              >
                <PlayIconSVG className="w-3.5 h-3.5" />
                <span>Play</span>
              </button>
            )}

            {isOwner ? (
              <Link
                to="/studio"
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity"
              >
                ✦ Manage in Studio
              </Link>
            ) : (
              <button
                type="button"
                disabled={isFollowLoading}
                onClick={handleToggleFollow}
                className={`font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 transition-all cursor-pointer ${
                  isFollowing
                    ? 'border border-line bg-panel hover:border-red-400 hover:text-red-500 text-ink'
                    : 'bg-ink text-canvas hover:opacity-90'
                }`}
              >
                {isFollowLoading
                  ? 'Updating...'
                  : isFollowing
                    ? 'Following'
                    : 'Follow Artist'}
              </button>
            )}
          </div>
        </div>

        {/* ===================== BIOGRAPHY & SOCIALS ===================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-10">
          {/* Left Column: Discography & Popular Tracks */}
          <div className="md:col-span-2 space-y-10">
            {/* About Blurb */}
            {artist.bio && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft block mb-2">
                  About
                </span>
                <p className="font-sans text-xs text-ink leading-relaxed whitespace-pre-line">
                  {artist.bio}
                </p>
              </div>
            )}

            {/* Top Tracks Section */}
            {hasTopTracks && (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <h2 className="font-serif italic text-xl text-ink">
                    Popular Master Tracks
                  </h2>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    Ranked by Plays
                  </span>
                </div>

                <div className="border border-line bg-panel divide-y divide-line/60 shadow-2xs">
                  {discography!.topTracks.map((track, idx) => {
                    const isCurrentPlaying =
                      currentTrack?.id === track.id &&
                      playbackStatus === 'playing'
                    const isCurrentLoaded = currentTrack?.id === track.id
                    const isLocked = track.isStreamable === false

                    return (
                      <div
                        key={track.id}
                        className={`px-4 py-3 flex items-center justify-between hover:bg-canvas-deep transition-colors group ${
                          isCurrentPlaying ? 'bg-blue/5' : ''
                        } ${isLocked ? 'opacity-65 bg-line/10' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                          <button
                            type="button"
                            onClick={() => handlePlaySong(track, idx)}
                            aria-label={
                              isCurrentPlaying ? 'Pause' : 'Play track'
                            }
                            className="w-6 h-6 flex items-center justify-center text-ink-soft group-hover:text-ink cursor-pointer shrink-0"
                          >
                            {isCurrentPlaying ? (
                              <PauseIconSVG className="w-3.5 h-3.5 text-blue" />
                            ) : (
                              <>
                                <span
                                  className={`font-mono text-[10.5px] ${
                                    isCurrentLoaded ? 'text-blue font-bold' : ''
                                  } group-hover:hidden`}
                                >
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <PlayIconSVG className="w-3.5 h-3.5 hidden group-hover:block text-ink" />
                              </>
                            )}
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-serif text-sm truncate ${
                                  isCurrentPlaying
                                    ? 'text-blue font-medium'
                                    : isCurrentLoaded
                                      ? 'text-blue'
                                      : 'text-ink'
                                }`}
                              >
                                {track.title}
                              </span>
                              {track.isExplicit && (
                                <span className="font-mono text-[8.5px] px-1 py-0.2 border border-line text-ink-soft bg-canvas">
                                  E
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[9px] text-ink-soft">
                              {track.playsCount.toLocaleString()} plays
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {!isLocked && (
                            <SongActionMenu track={toPlayerTrack(track)} />
                          )}

                          <span className="font-mono text-[10.5px] text-ink-soft">
                            {formatDuration(track.durationSeconds)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleTrackLike(track)}
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
              </div>
            )}

            {/* Upcoming Pre-Savable Releases Shelf */}
            {hasUpcoming && (
              <div className="space-y-4">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-serif italic text-xl text-ink">
                      Upcoming Releases
                    </h2>
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-blue/40 bg-blue/10 text-blue font-semibold flex items-center gap-1">
                      <CalendarIconSVG className="w-2.5 h-2.5" />
                      <span>Pre-Save Available</span>
                    </span>
                  </div>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                    {discography!.upcoming!.length}{' '}
                    {discography!.upcoming!.length === 1 ? 'Upcoming Drop' : 'Upcoming Drops'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {discography!.upcoming!.map((up) => {
                    const isPreSaved = preSavedAlbumIds.has(up.id)
                    const dropDateStr = up.scheduledReleaseAt
                      ? new Date(up.scheduledReleaseAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Coming Soon'

                    return (
                      <Link
                        key={up.id}
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: up.slug }}
                        className="border-2 border-blue/40 bg-blue/5 p-4 shadow-2xs hover:border-blue transition-colors group text-inherit no-underline flex flex-col justify-between relative overflow-hidden"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-24 h-24 sm:w-28 sm:h-28 bg-canvas-deep border border-line shrink-0 overflow-hidden relative shadow-xs">
                            {up.coverImageUrl ? (
                              <img
                                src={up.coverImageUrl}
                                alt={up.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <ProceduralCover
                                size="md"
                                title={up.title}
                                artistName={artist.stageName}
                                className="w-full h-full rounded-none"
                              />
                            )}
                            <div className="absolute top-1 left-1 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 bg-canvas/90 backdrop-blur-xs border border-line text-blue font-semibold">
                              {up.albumType}
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-blue font-semibold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue animate-ping" />
                              <span>Drops {dropDateStr}</span>
                            </div>

                            <h3 className="font-serif italic font-medium text-base text-ink group-hover:text-blue transition-colors truncate">
                              {up.title}
                            </h3>

                            <p className="font-mono text-[10px] text-ink-soft">
                              {up.totalTracks} {up.totalTracks === 1 ? 'Cut' : 'Cuts'} &bull; Master Audio Locked
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-blue/20 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            disabled={preSavingAlbumId === up.id}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleTogglePreSave(up)
                            }}
                            className={`font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 border transition-all cursor-pointer flex items-center gap-1.5 font-semibold shadow-2xs ${
                              isPreSaved
                                ? 'border-blue bg-blue text-canvas hover:opacity-90'
                                : 'border-ink bg-ink text-canvas hover:opacity-90'
                            }`}
                          >
                            <span>{isPreSaved ? '✓ Pre-Saved' : '✦ Pre-Save'}</span>
                            <span className="opacity-80 font-mono text-[9px]">({up.preSavesCount ?? 0})</span>
                          </button>

                          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1">
                            <span>Liner Notes</span>
                            <span>&rarr;</span>
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Full Albums Grid */}
            {hasAlbums && (
              <div className="space-y-4">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <h2 className="font-serif italic text-xl text-ink">Albums</h2>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    {discography!.albums.length} Releases
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                  {discography!.albums.map((album) => (
                    <Link
                      key={album.id}
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: album.slug }}
                      className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-colors group text-inherit no-underline"
                    >
                      <div className="aspect-square bg-canvas-deep border border-line mb-3 overflow-hidden relative">
                        {album.coverImageUrl ? (
                          <img
                            src={album.coverImageUrl}
                            alt={album.title}
                            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <DiscIconSVG className="w-10 h-10 text-ink-soft/40" />
                          </div>
                        )}
                      </div>
                      <div className="font-serif italic font-medium text-sm text-ink truncate group-hover:text-blue transition-colors">
                        {album.title}
                      </div>
                      <div className="font-mono text-[9.5px] text-ink-soft mt-0.5">
                        {album.releaseDate
                          ? new Date(album.releaseDate).getFullYear()
                          : 'Recent'}{' '}
                        &bull; {album.totalTracks} cuts
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Mixtapes Grid */}
            {hasMixtapes && (
              <div className="space-y-4">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <h2 className="font-serif italic text-xl text-ink">
                    Mixtapes
                  </h2>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                    {discography!.mixtapes!.length}{' '}
                    {discography!.mixtapes!.length === 1
                      ? 'Release'
                      : 'Releases'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                  {discography!.mixtapes!.map((mix) => (
                    <Link
                      key={mix.id}
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: mix.slug }}
                      className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-colors group text-inherit no-underline"
                    >
                      <div className="aspect-square bg-canvas-deep border border-line mb-3 overflow-hidden relative">
                        {mix.coverImageUrl ? (
                          <img
                            src={mix.coverImageUrl}
                            alt={mix.title}
                            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <DiscIconSVG className="w-10 h-10 text-ink-soft/40" />
                          </div>
                        )}
                      </div>
                      <div className="font-serif italic font-medium text-sm text-ink truncate group-hover:text-blue transition-colors">
                        {mix.title}
                      </div>
                      <div className="font-mono text-[9.5px] text-ink-soft mt-0.5">
                        <span className="uppercase">Mixtape</span> &bull;{' '}
                        {mix.releaseDate
                          ? new Date(mix.releaseDate).getFullYear()
                          : 'Recent'}{' '}
                        &bull; {mix.totalTracks} cuts
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* EPs & Singles Grid */}
            {hasEpsOrSingles && (
              <div className="space-y-4">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <h2 className="font-serif italic text-xl text-ink">
                    Singles & EPs
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                  {[
                    ...(discography?.eps || []),
                    ...(discography?.singles || []),
                  ].map((rel) => (
                    <Link
                      key={rel.id}
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: rel.slug }}
                      className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-colors group text-inherit no-underline"
                    >
                      <div className="aspect-square bg-canvas-deep border border-line mb-3 overflow-hidden relative">
                        {rel.coverImageUrl ? (
                          <img
                            src={rel.coverImageUrl}
                            alt={rel.title}
                            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <DiscIconSVG className="w-10 h-10 text-ink-soft/40" />
                          </div>
                        )}
                      </div>
                      <div className="font-serif italic font-medium text-sm text-ink truncate group-hover:text-blue transition-colors">
                        {rel.title}
                      </div>
                      <div className="font-mono text-[9.5px] text-ink-soft mt-0.5">
                        <span className="uppercase">{rel.albumType}</span>{' '}
                        &bull;{' '}
                        {rel.releaseDate
                          ? new Date(rel.releaseDate).getFullYear()
                          : 'Recent'}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* In Your Cloud Locker Shelf */}
            {hasInYourCollection && (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-serif italic text-xl text-ink">
                      In Your Personal Collection
                    </h2>
                    <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full font-semibold">
                      Personal Vault
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                      {discography!.inYourCollection!.length} Offline{' '}
                      {discography!.inYourCollection!.length === 1
                        ? 'Track'
                        : 'Tracks'}
                    </span>
                    <Link
                      to="/collection"
                      className="font-mono text-[9px] uppercase tracking-[0.14em] text-blue hover:underline"
                    >
                      Vault &rarr;
                    </Link>
                  </div>
                </div>

                <div className="border border-line bg-panel divide-y divide-line/60 shadow-2xs">
                  {discography!.inYourCollection!.map((track, idx) => {
                    const isCurrentPlaying =
                      currentTrack?.id === track.id &&
                      playbackStatus === 'playing'

                    return (
                      <div
                        key={track.id}
                        className={`px-4 py-3 flex items-center justify-between hover:bg-canvas-deep transition-colors group ${
                          currentTrack?.id === track.id ? 'bg-panel-deep' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                          <button
                            type="button"
                            onClick={() => handlePlayLockerSong(track, idx)}
                            className="w-8 h-8 rounded-full border border-line flex items-center justify-center font-mono text-xs text-ink-soft hover:border-ink hover:text-ink transition-colors shrink-0 cursor-pointer bg-canvas"
                            title={isCurrentPlaying ? 'Pause' : 'Play'}
                          >
                            {isCurrentPlaying ? (
                              <PauseIconSVG className="w-3.5 h-3.5" />
                            ) : (
                              <PlayIconSVG className="w-3.5 h-3.5 ml-0.5" />
                            )}
                          </button>

                          <div className="w-9 h-9 bg-canvas-deep border border-line shrink-0 overflow-hidden relative">
                            {track.coverImageUrl ? (
                              <img
                                src={track.coverImageUrl}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ProceduralCover
                                size="sm"
                                title={track.title}
                                artistName={track.artistName}
                                className="w-full h-full rounded-none text-[10px]"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-serif italic text-sm text-ink truncate font-medium">
                                {track.title}
                              </span>
                              <span className="font-mono text-[8.5px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded font-semibold shrink-0">
                                Personal Collection
                              </span>
                            </div>
                            {track.albumTitle && (
                              <span className="font-sans text-xs text-ink-soft truncate block">
                                {track.albumTitle}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-[10.5px] text-ink-soft">
                            {formatDuration(track.durationSeconds)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Appears On (Featured / Producer Collaborations) */}
            {hasAppearsOn && (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline border-b border-line pb-2">
                  <h2 className="font-serif italic text-xl text-ink">
                    Appears On & Collaborations
                  </h2>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    Cross-Artist Credits
                  </span>
                </div>

                <div className="border border-line bg-panel divide-y divide-line/60 shadow-2xs">
                  {discography!.appearsOn.map((item) => (
                    <div
                      key={item.songId}
                      className="px-4 py-3 flex items-center justify-between hover:bg-canvas-deep transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-serif text-sm text-ink truncate">
                          {item.songTitle}
                        </div>
                        <div className="font-mono text-[10px] text-ink-soft truncate">
                          with{' '}
                          <Link
                            to="/artists/$idOrSlug"
                            params={{ idOrSlug: item.primaryArtistSlug }}
                            className="hover:text-ink underline decoration-line"
                          >
                            {item.primaryArtistName}
                          </Link>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-line bg-canvas text-blue font-semibold">
                          {item.role}
                        </span>
                        <span className="font-mono text-[10.5px] text-ink-soft">
                          {formatDuration(item.songDuration)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* If no discography yet */}
            {!hasAlbums &&
              !hasMixtapes &&
              !hasEpsOrSingles &&
              !hasTopTracks &&
              !hasAppearsOn &&
              !hasInYourCollection && (
                <div className="p-8 border border-dashed border-line bg-panel/30 text-center">
                  <p className="font-serif italic text-base text-ink">
                    Master Tracks & Albums In Preparation
                  </p>
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft mt-1">
                    No public releases have been published to this catalog yet.
                  </p>
                </div>
              )}
          </div>

          {/* Right Column: Social Channels & Telemetry */}
          <div className="flex flex-col gap-6">
            {/* Social Links Pill List */}
            <div className="p-5 border border-line bg-panel">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft block mb-3">
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
                      className="flex items-center justify-between py-2 px-3 border border-line-soft bg-canvas hover:border-ink text-ink font-mono text-xs transition-colors group"
                    >
                      <span className="capitalize">{platform}</span>
                      <ExternalLinkSVG className="w-3.5 h-3.5 text-ink-soft group-hover:text-ink transition-colors" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="font-sans text-xs text-ink-soft italic">
                  No social profiles linked.
                </p>
              )}
            </div>

            {/* Registration Metadata */}
            <div className="p-5 border border-line-soft bg-canvas-deep/50 text-ink-soft font-mono text-[10px] flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>Member Since:</span>
                <span className="text-ink">
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
                    artist.verified
                      ? 'text-blue font-semibold'
                      : 'text-ink-soft'
                  }
                >
                  {artist.verificationStatus}
                </span>
              </div>
              {discography && (
                <div className="flex justify-between pt-1 border-t border-line-soft">
                  <span>Releases:</span>
                  <span className="text-ink">
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
    </div>
  )
}
