import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import type { AlbumDetail, EnrichedSong } from '../types/catalog'
import {
  VerifiedBadgeSVG,
  HeartIconSVG,
  CalendarIconSVG,
} from '../components/icons'
import { useAuthStore } from '../stores/auth.store'
import { useLikesStore } from '../stores/likes.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { ReleaseActionMenu } from '../components/common/ReleaseActionMenu'
import {
  CollectionActionBar,
  CollectionHeader,
} from '../components/collection'
import { Badge, IconButton } from '../components/ui'
import { Check, Share2 } from 'lucide-react'
import type { PlayerTrack } from '../types/player'
import { CommentSection } from '../components/comments/CommentSection'
import { SongRow } from '../components/common/SongRow'

export const Route = createFileRoute('/albums/$idOrSlug')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { shareToken?: string } => ({
    shareToken: (search.shareToken as string) || undefined,
  }),
  component: AlbumDetailComponent,
})

function AlbumDetailComponent() {
  const { idOrSlug } = Route.useParams()
  const { shareToken } = Route.useSearch()
  const { isAuthenticated, user } = useAuthStore()

  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['album', idOrSlug, shareToken, user?.id],
    [idOrSlug, shareToken, user?.id],
  )

  const {
    data: album,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey,
    queryFn: () => catalogApi.getAlbum(idOrSlug, shareToken),
    staleTime: 60 * 1000,
  })

  // Fast ownership check directly from album payload: 0 extra network calls!
  const isCreator = user?.role === 'ADMIN' || Boolean(album?.isOwner)

  // High-performance client-side likes store
  const likedAlbumIds = useLikesStore((s) => s.likedAlbumIds)
  const toggleAlbumLike = useLikesStore((s) => s.toggleAlbumLike)
  const hydrateAlbums = useLikesStore((s) => s.hydrateAlbums)
  const hydrateSongs = useLikesStore((s) => s.hydrateSongs)

  // High-performance client-side pre-saves store
  const preSavedAlbumIds = usePreSavesStore((s) => s.preSavedAlbumIds)
  const togglePreSaveStore = usePreSavesStore((s) => s.togglePreSave)
  const hydratePreSavedAlbums = usePreSavesStore((s) => s.hydrateAlbums)

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
  const contextUri = usePlayerStore((s) => s.contextUri)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Share feedback
  const [copiedLink, setCopiedLink] = useState(false)

  // Sync likes and pre-saves count & hydrate global stores when album updates
  useEffect(() => {
    if (!album) return

    setLikesCount(album.likesCount ?? 0)
    setPreSavesCount(album.preSavesCount ?? 0)

    if (album.isLiked) {
      hydrateAlbums([{ id: album.id, isLiked: true }])
    }
    if (album.isPreSaved) {
      hydratePreSavedAlbums([{ id: album.id, isPreSaved: true }])
    }
    if (album.tracks?.length) {
      hydrateSongs(album.tracks)
    }
  }, [album, hydrateAlbums, hydratePreSavedAlbums, hydrateSongs])

  // Live drop countdown timer
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
    totalMs: number
  } | null>(null)

  useEffect(() => {
    if (!album?.isUpcoming || !album?.scheduledReleaseAt) {
      setTimeLeft(null)
      return
    }

    const target = new Date(album.scheduledReleaseAt).getTime()

    const updateTimer = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 })
        // Auto-refresh album to unlock playback upon drop
        queryClient.invalidateQueries({ queryKey })
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((diff / (1000 * 60)) % 60)
      const seconds = Math.floor((diff / 1000) % 60)
      setTimeLeft({ days, hours, minutes, seconds, totalMs: diff })
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [album?.isUpcoming, album?.scheduledReleaseAt, queryClient, queryKey])

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
    const nextCount = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1

    // Optimistically update count in local state and React Query cache
    setLikesCount(nextCount)
    queryClient.setQueryData<AlbumDetail>(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        likesCount: nextCount,
        isLiked: !prevLiked,
      }
    })

    try {
      const res = await toggleAlbumLike(album.id)
      setLikesCount(res.likesCount)
      queryClient.setQueryData<AlbumDetail>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          likesCount: res.likesCount,
          isLiked: res.liked,
        }
      })
    } catch (err: any) {
      // Revert count on error
      setLikesCount(prevCount)
      queryClient.setQueryData<AlbumDetail>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          likesCount: prevCount,
          isLiked: prevLiked,
        }
      })
      alert(err.message || 'Could not update like status')
    } finally {
      setIsLikeLoading(false)
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
    const nextCount = willBePreSaved ? prevCount + 1 : Math.max(0, prevCount - 1)

    // Optimistic count update in local state and React Query cache
    setPreSavesCount(nextCount)
    queryClient.setQueryData<AlbumDetail>(queryKey, (old) => {
      if (!old) return old
      return {
        ...old,
        preSavesCount: nextCount,
        isPreSaved: willBePreSaved,
      }
    })

    try {
      const res = await togglePreSaveStore(album.id)
      setPreSavesCount(res.preSavesCount)
      queryClient.setQueryData<AlbumDetail>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          preSavesCount: res.preSavesCount,
          isPreSaved: res.preSaved,
        }
      })
    } catch (err: any) {
      // Rollback count on error
      setPreSavesCount(prevCount)
      queryClient.setQueryData<AlbumDetail>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          preSavesCount: prevCount,
          isPreSaved: !willBePreSaved,
        }
      })
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
    credits: song.credits,
    scope: song.scope || album?.scope || 'GLOBAL',
    isStreamable: isCreator
      ? true
      : song.isStreamable !== false && !album?.isUpcoming,
  })

  const handlePlaySong = (song: EnrichedSong, index: number) => {
    const isLocked =
      (album?.isUpcoming || song.isStreamable === false) && !isCreator
    if (isLocked) {
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
      album.title,
    )
  }

  const handlePlayAlbumFromStart = () => {
    if (album?.isUpcoming && !isCreator) {
      handleTogglePreSave()
      return
    }
    if (!album || !album.tracks || album.tracks.length === 0) return
    const firstPlayableIdx = album.tracks.findIndex(
      (t) => isCreator || t.isStreamable !== false,
    )
    if (firstPlayableIdx >= 0) {
      handlePlaySong(album.tracks[firstPlayableIdx], firstPlayableIdx)
    } else {
      alert('No streamable audio files found for this release yet.')
    }
  }

  const handleCopyShareLink = async () => {
    if (typeof window === 'undefined') return

    let shareUrl = window.location.href
    if (
      album?.visibility === 'UNLISTED' &&
      album.shareToken &&
      !window.location.search.includes('shareToken')
    ) {
      shareUrl = `${window.location.origin}/albums/${album.slug}?shareToken=${album.shareToken}`
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: album?.title,
          text: album
            ? `Listen to ${album.title} by ${album.artistStageName} on Groovy`
            : undefined,
          url: shareUrl,
        })
        return
      } catch {
        // Fallback to clipboard
      }
    }

    await navigator.clipboard.writeText(shareUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="py-32 text-center font-eyebrow text-caption uppercase tracking-wider text-muted-foreground animate-pulse">
        Retrieving master recording & liner notes...
      </div>
    )
  }

  if (queryError || !album) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-eyebrow text-caption uppercase tracking-widest text-primary block mb-2">
          404 Catalog Notice
        </span>
        <h1 className="font-serif italic text-3xl text-foreground">
          Release Not Found
        </h1>
        <p className="font-sans text-caption text-muted-foreground mt-3 leading-relaxed">
          The requested album identifier{' '}
          <span className="font-mono text-foreground">"{idOrSlug}"</span> could not be
          located in the master archive.
        </p>
        <Link
          to="/"
          className="inline-block mt-6 font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-card hover:bg-background text-foreground transition-colors rounded-control"
        >
          &larr; Return to Catalog
        </Link>
      </div>
    )
  }

  const releaseYear = album.releaseDate
    ? new Date(album.releaseDate).getFullYear()
    : new Date(album.createdAt).getFullYear()

  const totalPlays =
    album.totalPlays ??
    (album.tracks ?? []).reduce((acc, t) => acc + (t.playsCount || 0), 0)

  const albumContextUri = `album:${album.id}`
  const isAlbumActive = contextUri === albumContextUri
  const isAlbumPlaying = isAlbumActive && playbackStatus === 'playing'
  const hasTracks = (album.tracks ?? []).length > 0
  const isPreSavePrimary = album.isUpcoming && !isCreator

  const handleHeroPlay = () => {
    if (isAlbumActive) {
      togglePlay()
      return
    }
    handlePlayAlbumFromStart()
  }

  return (
    <div className="w-full pb-20">
      {/* ===================== COLLECTION HERO HEADER ===================== */}
      <CollectionHeader
        key={album.id}
        title={album.title}
        eyebrow={<Badge tone="brand">{album.albumType}</Badge>}
        badges={
          <>
            {album.scope === 'PERSONAL' ? (
              <Badge tone="neutral">Personal Collection</Badge>
            ) : null}
            {album.isUpcoming ? (
              <Badge tone="warning">Upcoming Drop</Badge>
            ) : null}
            {album.visibility === 'UNLISTED' ? (
              <Badge tone="neutral">Unlisted Link</Badge>
            ) : null}
          </>
        }
        cover={
          album.coverImageUrl ? (
            <img
              src={album.coverImageUrl}
              alt={album.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <ProceduralCover
              fill
              title={album.title}
              artistName={album.artistStageName}
              className="text-3xl"
            />
          )
        }
        backdropImageUrl={album.coverImageUrl || null}
        meta={
          <>
            <span className="font-sans text-caption">Master Recording</span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>{releaseYear}</span>
            </span>
            <span className="inline-flex max-w-full items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <Link
                to="/artists/$idOrSlug"
                params={{ idOrSlug: album.artistSlug }}
                className="inline-flex min-w-0 items-center gap-1.5 font-serif italic text-title text-foreground transition-colors hover:text-primary sm:text-lg"
              >
                <span className="truncate">{album.artistStageName}</span>
                {album.artistVerified ? (
                  <VerifiedBadgeSVG className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : null}
              </Link>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>
                {album.totalTracks}{' '}
                {album.totalTracks === 1 ? 'Track' : 'Tracks'}
              </span>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>{formatDuration(album.totalDurationSeconds)}</span>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>
                {totalPlays.toLocaleString()}{' '}
                {totalPlays === 1 ? 'stream' : 'streams'}
              </span>
            </span>
          </>
        }
        description={album.description || undefined}
        stickySubtitle={album.artistStageName}
        stickyThumbnail={
          album.coverImageUrl ? (
            <img
              src={album.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ProceduralCover
              fill
              title={album.title}
              artistName={album.artistStageName}
            />
          )
        }
      />

      {/* ===================== COLLECTION CONTROLS ===================== */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-3.5 pb-2 sm:px-8 md:pt-2 md:pb-5">
        <CollectionActionBar
          primaryAction={
            isPreSavePrimary ? (
              <button
                type="button"
                disabled={isPreSaveLoading}
                onClick={handleTogglePreSave}
                aria-label={
                  isPreSaved ? 'Remove pre-save' : 'Pre-save release'
                }
                title={isPreSaved ? 'Remove pre-save' : 'Pre-save release'}
                className={`group relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-raised transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
                  isPreSaved
                    ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
                    : 'border border-primary/40 bg-primary/10 text-primary hover:scale-105 active:scale-95'
                }`}
              >
                <CalendarIconSVG className="h-6 w-6" />
                {preSavesCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 font-mono text-eyebrow text-background">
                    {preSavesCount > 99 ? '99+' : preSavesCount}
                  </span>
                ) : null}
              </button>
            ) : undefined
          }
          onPlay={!isPreSavePrimary && hasTracks ? handleHeroPlay : undefined}
          isPlaying={isAlbumPlaying}
          playLabel={album.title}
          menu={
            <ReleaseActionMenu
              release={album}
              tracks={(album.tracks ?? []).map(toPlayerTrack)}
              hideGoToRelease
              buttonClassName="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground"
            />
          }
        >
          {!album.isUpcoming ? (
            <button
              type="button"
              disabled={isLikeLoading}
              onClick={handleToggleAlbumLike}
              aria-label={isLiked ? 'Unlike release' : 'Like release'}
              title={isLiked ? 'Unlike release' : 'Like release'}
              className={`group inline-flex h-11 items-center justify-center gap-1.5 rounded-control px-3 transition-colors hover:bg-secondary/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                isLiked
                  ? 'text-destructive'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <HeartIconSVG
                filled={isLiked}
                className="h-4 w-4 transition-transform duration-200 group-hover:scale-110 group-active:scale-90"
              />
              <span className="font-mono text-caption">
                {likesCount.toLocaleString()}
              </span>
            </button>
          ) : null}

          {album.scope !== 'PERSONAL' ? (
            <IconButton
              size="lg"
              className="group"
              onClick={handleCopyShareLink}
              aria-label="Share release"
              title="Share release"
            >
              {copiedLink ? (
                <Check className="h-5 w-5 text-success!" />
              ) : (
                <Share2 className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
              )}
            </IconButton>
          ) : null}
        </CollectionActionBar>
      </div>

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 sm:mt-10 space-y-8">
        {/* ===================== UPCOMING RELEASE BANNER ===================== */}
        {album.isUpcoming && (
          <div className="border border-primary/30 bg-primary/5 hover:border-primary/60 transition-colors rounded-lg p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-raised">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                <span>Upcoming Scheduled Drop &bull; Master Vault Locked</span>
              </div>
              <h2 className="font-serif italic text-lg sm:text-heading text-foreground font-semibold">
                Official Drop:{' '}
                {album.scheduledReleaseAt
                  ? new Date(album.scheduledReleaseAt).toLocaleString(
                      undefined,
                      {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      },
                    )
                  : 'Coming Soon'}
              </h2>
              {timeLeft && timeLeft.totalMs > 0 && (
                <div className="pt-1">
                  <div className="grid grid-cols-4 gap-2 max-w-xs">
                    <div className="border border-primary/30 bg-primary/10 p-2 text-center rounded-md">
                      <span className="font-mono text-title sm:text-lg font-bold text-primary block leading-none">
                        {timeLeft.days}
                      </span>
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                        Days
                      </span>
                    </div>
                    <div className="border border-primary/30 bg-primary/10 p-2 text-center rounded-md">
                      <span className="font-mono text-title sm:text-lg font-bold text-primary block leading-none">
                        {String(timeLeft.hours).padStart(2, '0')}
                      </span>
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                        Hours
                      </span>
                    </div>
                    <div className="border border-primary/30 bg-primary/10 p-2 text-center rounded-md">
                      <span className="font-mono text-title sm:text-lg font-bold text-primary block leading-none">
                        {String(timeLeft.minutes).padStart(2, '0')}
                      </span>
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                        Mins
                      </span>
                    </div>
                    <div className="border border-primary/30 bg-primary/10 p-2 text-center rounded-md">
                      <span className="font-mono text-title sm:text-lg font-bold text-primary block leading-none">
                        {String(timeLeft.seconds).padStart(2, '0')}
                      </span>
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                        Secs
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <p className="font-sans text-caption text-muted-foreground leading-relaxed max-w-xl">
                Lossless master audio streams unlock automatically on release
                date. Pre-save now to add this {album.albumType.toLowerCase()}{' '}
                to your library immediately upon drop.
              </p>
            </div>

            <div className="w-full md:w-auto shrink-0">
              <button
                type="button"
                disabled={isPreSaveLoading}
                onClick={handleTogglePreSave}
                className={`w-full md:w-auto rounded-control font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-6 border transition-all cursor-pointer font-semibold shadow-raised flex items-center justify-center gap-2 ${
                  isPreSaved
                    ? 'border-primary bg-primary text-background hover:opacity-90'
                    : 'border-foreground bg-foreground text-background hover:opacity-90'
                }`}
              >
                <span>
                  {isPreSaved ? '✓ Pre-Saved to Library' : '✦ Pre-Save Release'}
                </span>
                <span className="opacity-75 font-mono text-eyebrow">
                  ({preSavesCount})
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ===================== TRACKLIST SECTION ===================== */}
        <div className="space-y-3 px-1">
          <div className="flex justify-between items-baseline border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-serif italic text-heading sm:text-2xl text-foreground font-semibold">
                Master Tracklist
              </h2>
            </div>
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
              {(album.tracks ?? []).length}{' '}
              {(album.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {(album.tracks ?? []).length === 0 ? (
            <div className="p-8 border border-dashed border-border bg-card/30 text-center rounded-md">
              <p className="font-serif italic text-title text-foreground">
                No tracks uploaded to this release yet.
              </p>
              <p className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mt-1">
                Check back soon as the master tape transfers complete.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-md overflow-clip bg-card divide-y divide-border/60 shadow-raised">
              {/* Desktop Tracklist Column Header */}
              <div className="hidden sm:flex items-center justify-between gap-4 px-5 sm:px-6 py-2.5 border-b border-border/60 bg-background/40 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="w-6 text-center">#</span>
                  <span>Title &amp; Credits</span>
                </div>
                <div className="w-24 text-right">Streams</div>
                <div className="flex items-center justify-end gap-3 sm:gap-4 shrink-0 min-w-30 pr-2">
                  <span>Duration</span>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {(album.tracks ?? []).map((track, idx) => {
                  const primaryCredits =
                    track.credits?.filter((c) => c.role === 'PRIMARY') || []
                  const featuredCredits =
                    track.credits?.filter((c) => c.role === 'FEATURED') || []
                  const producerCredits =
                    track.credits?.filter((c) => c.role === 'PRODUCER') || []

                  return (
                    <SongRow
                      key={track.id}
                      track={toPlayerTrack(track)}
                      index={idx}
                      trackNumberDisplay={track.trackNumber || idx + 1}
                      variant="album"
                      playsCount={track.playsCount}
                      primaryCredits={primaryCredits}
                      featuredCredits={featuredCredits}
                      producerCredits={producerCredits}
                      scheduledReleaseAt={
                        album.isUpcoming && !isCreator
                          ? album.scheduledReleaseAt
                          : undefined
                      }
                      isPersonal={album.scope === 'PERSONAL' || track.scope === 'PERSONAL'}
                      onPlay={() => handlePlaySong(track, idx)}
                      hideGoToAlbum={true}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sibling Releases: More by this Artist */}
        {album.moreByArtist && album.moreByArtist.length > 0 && (
          <div className="space-y-4 px-1 mt-10 pt-8 border-t border-border">
            <div className="flex justify-between items-baseline border-b border-border pb-2">
              <h2 className="font-serif italic text-heading sm:text-2xl text-foreground font-semibold">
                More by {album.artistStageName}
              </h2>
              <Link
                to="/artists/$idOrSlug"
                params={{ idOrSlug: album.artistSlug || album.artistId }}
                className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline"
              >
                View Discography &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {album.moreByArtist.map((sibling) => (
                <Link
                  key={sibling.id}
                  to="/albums/$idOrSlug"
                  params={{ idOrSlug: sibling.slug || sibling.id }}
                  className="group block space-y-2"
                >
                  <div className="aspect-square w-full rounded-control bg-muted border border-border overflow-hidden relative shadow-raised group-hover:border-primary/50 transition-colors">
                    {sibling.coverImageUrl ? (
                      <img
                        src={sibling.coverImageUrl}
                        alt={sibling.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <ProceduralCover
                        fill
                        title={sibling.title}
                        artistName={sibling.artistStageName}
                        className="text-lg"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-sans font-semibold text-body text-foreground truncate group-hover:text-primary transition-colors">
                      {sibling.title}
                    </h4>
                    <div className="flex items-center gap-1.5 font-sans text-caption text-muted-foreground truncate mt-0.5">
                      <span>{sibling.albumType}</span>
                      {sibling.releaseDate && (
                        <>
                          <span>&bull;</span>
                          <span>{new Date(sibling.releaseDate).getFullYear()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
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
