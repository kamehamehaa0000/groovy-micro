import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { usePlayerStore } from '../stores/player.store'
import { playerApi, type FriendActivityItem } from '../lib/player.api'
import {
  socialApi,
  type FeedItem,
  type SocialFeedResponse,
  type IncomingFollowRequest,
  type UserSummary,
} from '../lib/social.api'
import type { PlayerTrack } from '../types/player'

export const Route = createFileRoute('/feed')({
  component: UnifiedFeedComponent,
})

function formatRelativeTime(dateStr: string): string {
  const timestamp = new Date(dateStr).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000))

  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatElapsed(progressMs: number): string {
  const totalSec = Math.floor(progressMs / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function UnifiedFeedComponent() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const addToQueue = usePlayerStore((s) => s.addToQueue)

  // Mobile View Switcher Tab State: "stream" | "live" | "network"
  const [mobileTab, setMobileTab] = useState<'stream' | 'live' | 'network'>(
    'stream',
  )

  // Stream Feed State
  const [streamFilter, setStreamFilter] = useState<
    'all' | 'releases' | 'playlists' | 'friends'
  >('all')
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedCursor, setFeedCursor] = useState<string | null>(null)
  const [hasMoreFeed, setHasMoreFeed] = useState(false)
  const [isLoadingFeed, setIsLoadingFeed] = useState(true)
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)

  // Live Friends Activity State
  const [liveActivities, setLiveActivities] = useState<FriendActivityItem[]>([])
  const [isLoadingLive, setIsLoadingLive] = useState(true)

  // Pending Incoming Requests State
  const [incomingRequests, setIncomingRequests] = useState<
    IncomingFollowRequest[]
  >([])
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null,
  )

  // Directory / Community Discovery State
  const [directoryUsers, setDirectoryUsers] = useState<UserSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchingUsers, setIsSearchingUsers] = useState(false)
  const [actingUserId, setActingUserId] = useState<string | null>(null)

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 1. Fetch Timeline Stream
  const fetchFeed = useCallback(
    async (isInitial = true, cursorToUse?: string) => {
      if (!isAuthenticated) return
      if (isInitial) {
        setIsLoadingFeed(true)
        setFeedError(null)
      } else {
        setIsLoadingMoreFeed(true)
      }

      try {
        const res: SocialFeedResponse = await socialApi.getFeed({
          filter: streamFilter,
          cursor: cursorToUse,
          limit: 20,
        })

        if (isInitial) {
          setFeedItems(res.items)
        } else {
          setFeedItems((prev) => [...prev, ...res.items])
        }
        setFeedCursor(res.nextCursor)
        setHasMoreFeed(res.hasMore)
      } catch (err: any) {
        setFeedError(err.message || 'Failed to load activity stream')
      } finally {
        setIsLoadingFeed(false)
        setIsLoadingMoreFeed(false)
      }
    },
    [isAuthenticated, streamFilter],
  )

  // 2. Fetch Live Friends Playback Activity
  const fetchLiveActivities = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await playerApi.getFriendsActivity()
      setLiveActivities(res.activities || [])
    } catch (err) {
      console.warn('[Feed] Failed to load live activities:', err)
    } finally {
      setIsLoadingLive(false)
    }
  }, [isAuthenticated])

  // 3. Fetch Incoming Follow Requests
  const fetchRequests = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await socialApi.getIncomingRequests()
      setIncomingRequests(res.requests || [])
    } catch (err) {
      console.warn('[Feed] Failed to load follow requests:', err)
    }
  }, [isAuthenticated])

  // 4. Search / Load Community Members
  const searchCommunity = useCallback(
    async (q = '') => {
      if (!isAuthenticated) return
      setIsSearchingUsers(true)
      try {
        const res = await socialApi.searchUsers(q)
        setDirectoryUsers(res.users || [])
      } catch (err) {
        console.warn('[Feed] Failed to load community directory:', err)
      } finally {
        setIsSearchingUsers(false)
      }
    },
    [isAuthenticated],
  )

  // Initial load
  useEffect(() => {
    if (!isAuthenticated) return
    fetchFeed(true)
    fetchLiveActivities()
    fetchRequests()
    searchCommunity()

    // Routine presence pulse every 12 seconds
    pollTimerRef.current = setInterval(() => {
      fetchLiveActivities()
    }, 12000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [
    isAuthenticated,
    fetchFeed,
    fetchLiveActivities,
    fetchRequests,
    searchCommunity,
  ])

  // Handle Play Feed Song
  const handlePlayFeedSong = (item: FeedItem) => {
    if (item.target.type !== 'song' || !item.target.audioUrl) {
      if (item.target.type === 'album' && item.target.slug) {
        navigate({
          to: '/albums/$idOrSlug',
          params: { idOrSlug: item.target.slug },
        })
      } else if (item.target.type === 'playlist') {
        navigate({ to: '/playlists/$id', params: { id: item.target.id } })
      }
      return
    }

    if (currentTrack?.id === item.target.id) {
      togglePlay()
      return
    }

    const playerTrack: PlayerTrack = {
      id: item.target.id,
      title: item.target.title,
      artistId: item.actor.id,
      artistName: item.actor.name,
      artistSlug: item.actor.slug || '',
      albumId: '',
      albumTitle: '',
      coverImageUrl: item.target.coverImageUrl,
      durationSeconds: item.target.durationSeconds || 180,
      audioUrl: item.target.audioUrl,
      isExplicit: item.target.isExplicit || false,
    }

    playTrack(playerTrack, [playerTrack], 0, `feed:${item.id}`, 'Social Feed')
  }

  // Handle Add to Queue
  const handleQueueFeedTrack = (item: FeedItem) => {
    if (item.target.type !== 'song' || !item.target.audioUrl) return

    const playerTrack: PlayerTrack = {
      id: item.target.id,
      title: item.target.title,
      artistId: item.actor.id,
      artistName: item.actor.name,
      artistSlug: item.actor.slug || '',
      albumId: '',
      albumTitle: '',
      coverImageUrl: item.target.coverImageUrl,
      durationSeconds: item.target.durationSeconds || 180,
      audioUrl: item.target.audioUrl,
      isExplicit: item.target.isExplicit || false,
    }

    addToQueue(playerTrack)
  }

  // Handle 1-Click Listen Along
  const handleListenAlong = (item: FriendActivityItem) => {
    const isCurrent = currentTrack?.id === item.activity.songId
    if (isCurrent) {
      togglePlay()
      return
    }

    const playerTrack: PlayerTrack = {
      id: item.activity.songId,
      title: item.activity.trackTitle,
      artistId: '',
      artistName: item.activity.artistName,
      coverImageUrl: item.activity.coverImageUrl || undefined,
      durationSeconds: item.activity.durationMs
        ? Math.floor(item.activity.durationMs / 1000)
        : 0,
    }

    playTrack(
      playerTrack,
      [playerTrack],
      0,
      'social:activity',
      'Friend Activity',
    )
    if (item.activity.progressMs > 0) {
      usePlayerStore
        .getState()
        .seek(Math.floor(item.activity.progressMs / 1000))
    }
  }

  // Handle Accept Follow Request
  const handleAcceptRequest = async (requesterId: string) => {
    setProcessingRequestId(requesterId)
    try {
      await socialApi.acceptRequest(requesterId)
      setIncomingRequests((prev) =>
        prev.filter((r) => r.requesterId !== requesterId),
      )
      fetchLiveActivities()
      searchCommunity(searchQuery)
    } catch (err) {
      console.error('[Feed] Accept request failed:', err)
    } finally {
      setProcessingRequestId(null)
    }
  }

  // Handle Reject Follow Request
  const handleRejectRequest = async (requesterId: string) => {
    setProcessingRequestId(requesterId)
    try {
      await socialApi.rejectRequest(requesterId)
      setIncomingRequests((prev) =>
        prev.filter((r) => r.requesterId !== requesterId),
      )
    } catch (err) {
      console.error('[Feed] Reject request failed:', err)
    } finally {
      setProcessingRequestId(null)
    }
  }

  // Handle Follow / Unfollow
  const handleToggleFollow = async (targetUser: UserSummary) => {
    setActingUserId(targetUser.id)
    try {
      if (
        targetUser.relationship === 'FOLLOWING' ||
        targetUser.relationship === 'FRIENDS' ||
        targetUser.relationship === 'PENDING_SENT'
      ) {
        await socialApi.unfollowUser(targetUser.id)
        setDirectoryUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id ? { ...u, relationship: 'NONE' } : u,
          ),
        )
      } else {
        const res = await socialApi.followUser(targetUser.id)
        setDirectoryUsers((prev) =>
          prev.map((u) => {
            if (u.id !== targetUser.id) return u
            if (res.status === 'PENDING') {
              return { ...u, relationship: 'PENDING_SENT' }
            }
            return {
              ...u,
              relationship: res.isMutualFriend ? 'FRIENDS' : 'FOLLOWING',
            }
          }),
        )
      }
      fetchLiveActivities()
    } catch (err) {
      console.error('[Feed] Toggle follow failed:', err)
    } finally {
      setActingUserId(null)
    }
  }

  // Unauthenticated Empty State
  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center select-none">
        <div className="border border-border bg-card p-8 sm:p-12 shadow-xs space-y-5 rounded-2xl">
          <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
            Community &nbsp;·&nbsp; Social Circle
          </div>
          <h2 className="font-serif italic text-3xl sm:text-4xl text-foreground font-normal">
            Connect with Listeners
          </h2>
          <p className="font-sans text-caption sm:text-body text-muted-foreground leading-relaxed max-w-md mx-auto">
            Sign in to follow creators, tune in to live listening sessions with
            mutual friends, and receive real-time drops from your favorite
            artists.
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              search={{ redirect: '/feed' }}
              className="inline-block bg-foreground text-background font-eyebrow text-caption uppercase tracking-wider px-6 py-3 border border-foreground hover:bg-background hover:text-foreground transition-colors rounded-xl font-semibold shadow-xs"
            >
              Sign In to Social Hub &rarr;
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 select-none space-y-6">
      {/* ===================== PAGE HERO HEADER ===================== */}
      <section className="shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-1.5">
              Community &nbsp;·&nbsp; Socials &amp; Friends
            </div>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground font-normal leading-tight">
              Community Hub
            </h1>
            <p className="font-sans text-caption sm:text-body text-muted-foreground mt-1 max-w-xl leading-relaxed">
              Real-time playback telemetry, friend circles, and chronological
              drops from artists you follow.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                fetchFeed(true)
                fetchLiveActivities()
                fetchRequests()
              }}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3.5 border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer flex items-center gap-2 rounded-xl shadow-raised"
            >
              <span>Refresh Pulse</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================== MOBILE VIEWPORT SWITCHER (< lg) ===================== */}
      <div className="lg:hidden flex items-center gap-1.5 py-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setMobileTab('stream')}
          className={`font-eyebrow bg-muted border border-border text-eyebrow uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 rounded-lg flex items-center gap-1.5 ${
            mobileTab === 'stream'
              ? 'bg-foreground text-background font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Activity</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('live')}
          className={`font-eyebrow bg-muted border border-border text-eyebrow uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 rounded-lg flex items-center gap-1.5 ${
            mobileTab === 'live'
              ? 'bg-foreground text-background font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Live Now ({liveActivities.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('network')}
          className={`font-eyebrow bg-muted border border-border text-eyebrow uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 rounded-lg flex items-center gap-1.5 ${
            mobileTab === 'network'
              ? 'bg-foreground text-background font-semibold shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Requests</span>
          {incomingRequests.length > 0 && (
            <span className="bg-primary text-primary-foreground text-eyebrow font-mono px-1.5 py-0.5 rounded-full font-bold">
              {incomingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* ===================== 2-COLUMN MAIN LAYOUT ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ---------------- LEFT COLUMN: STREAM FEED (Desktop or Mobile Stream Tab) ---------------- */}
        <div
          className={`lg:col-span-7 xl:col-span-8 space-y-6 ${
            mobileTab !== 'stream' ? 'hidden lg:block' : ''
          }`}
        >
          {/* Stream Filter Pills */}
          <div className="flex items-center justify-between border-b border-border pb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setStreamFilter('all')}
                className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 ${
                  streamFilter === 'all'
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                All Drops
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('releases')}
                className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 ${
                  streamFilter === 'releases'
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                Releases
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('playlists')}
                className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 ${
                  streamFilter === 'playlists'
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                Playlists
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('friends')}
                className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-2 transition-all cursor-pointer shrink-0 ${
                  streamFilter === 'friends'
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                Friends
              </button>
            </div>

            <div className="font-eyebrow text-eyebrow text-muted-foreground uppercase tracking-wider hidden sm:block">
              {feedItems.length} drops cached
            </div>
          </div>

          {/* Loading Feed State */}
          {isLoadingFeed && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
              <div className="font-eyebrow text-caption uppercase tracking-widest text-muted-foreground">
                Tuning into the stream...
              </div>
            </div>
          )}

          {/* Error Feed State */}
          {feedError && !isLoadingFeed && (
            <div className="p-4 border border-destructive/30 bg-destructive-soft text-destructive text-caption text-center rounded-xl">
              {feedError}
            </div>
          )}

          {/* Empty Feed State */}
          {!isLoadingFeed && !feedError && feedItems.length === 0 && (
            <div className="border border-dashed border-border p-10 text-center rounded-2xl space-y-3">
              <div className="font-serif italic text-2xl text-foreground">
                No activity in this view yet
              </div>
              <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto leading-relaxed">
                Follow more artists in the catalog or connect with listeners in
                the directory to personalize your stream with fresh music drops.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Link
                  to="/"
                  className="bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider px-4 py-2 border border-foreground hover:bg-background hover:text-foreground transition-colors rounded-xl"
                >
                  Explore Catalog
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileTab('network')}
                  className="bg-card text-foreground font-eyebrow text-eyebrow uppercase tracking-wider px-4 py-2 border border-border hover:bg-muted transition-colors rounded-xl cursor-pointer"
                >
                  Discover Listeners
                </button>
              </div>
            </div>
          )}

          {/* Feed Stream Cards */}
          {!isLoadingFeed && feedItems.length > 0 && (
            <div className="space-y-4">
              {feedItems.map((item) => {
                const isTrack = item.target.type === 'song'
                const isPlaying =
                  isTrack &&
                  currentTrack?.id === item.target.id &&
                  playbackStatus === 'playing'

                return (
                  <div
                    key={item.id}
                    className="border border-border bg-card p-4 sm:p-5 rounded-2xl shadow-raised hover:border-foreground/40 transition-all space-y-3.5"
                  >
                    {/* Event Actor Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Actor Avatar */}
                        {item.actor.isArtist && item.actor.slug ? (
                          <Link
                            to="/artists/$idOrSlug"
                            params={{ idOrSlug: item.actor.slug }}
                          >
                            {item.actor.avatarUrl ? (
                              <img
                                src={item.actor.avatarUrl}
                                alt={item.actor.name}
                                className="w-8 h-8 rounded-full object-cover border border-border hover:border-foreground transition-colors shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center font-mono text-caption font-semibold text-muted-foreground shrink-0">
                                {item.actor.name[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                          </Link>
                        ) : (
                          <Link to="/users/$id" params={{ id: item.actor.id }}>
                            {item.actor.avatarUrl ? (
                              <img
                                src={item.actor.avatarUrl}
                                alt={item.actor.name}
                                className="w-8 h-8 rounded-full object-cover border border-border hover:border-foreground transition-colors shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center font-mono text-caption font-semibold text-muted-foreground shrink-0">
                                {item.actor.name[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                          </Link>
                        )}

                        {/* Actor Title & Action */}
                        <div className="font-sans text-caption truncate">
                          {item.actor.isArtist && item.actor.slug ? (
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: item.actor.slug }}
                              className="font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {item.actor.name}
                            </Link>
                          ) : (
                            <Link
                              to="/users/$id"
                              params={{ id: item.actor.id }}
                              className="font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {item.actor.name}
                            </Link>
                          )}

                          <span className="text-muted-foreground ml-1.5">
                            {item.type === 'NEW_RELEASE' &&
                              'dropped a new release'}
                            {item.type === 'PLAYLIST_CREATED' &&
                              'created a public playlist'}
                            {item.type === 'PLAYLIST_SAVED' &&
                              'saved a playlist'}
                            {item.type === 'SONG_LIKED' && 'liked a track'}
                          </span>
                        </div>
                      </div>

                      {/* Relative Timestamp */}
                      <span className="font-mono text-eyebrow text-muted-foreground shrink-0 ml-2">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>

                    {/* Target Content Card */}
                    <div className="flex items-center gap-4 p-3 bg-background border border-border/70 rounded-xl">
                      {/* Artwork / Thumbnail */}
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-muted border border-border rounded-lg overflow-hidden group">
                        {item.target.coverImageUrl ? (
                          <img
                            src={item.target.coverImageUrl}
                            alt={item.target.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-serif italic text-muted-foreground text-heading">
                            ♪
                          </div>
                        )}

                        {/* Hover Play Button Overlay */}
                        <button
                          type="button"
                          onClick={() => handlePlayFeedSong(item)}
                          className="absolute inset-0 bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                          title={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? (
                            <svg
                              className="w-6 h-6 fill-current"
                              viewBox="0 0 24 24"
                            >
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          ) : (
                            <svg
                              className="w-6 h-6 fill-current translate-x-0.5"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* Metadata */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 bg-muted border border-border rounded-control text-muted-foreground">
                            {item.target.type}
                          </span>
                          {item.target.isExplicit && (
                            <span className="font-eyebrow text-eyebrow uppercase font-bold px-1 py-0.5 bg-foreground text-background rounded-control">
                              E
                            </span>
                          )}
                        </div>

                        <div className="font-sans font-semibold text-body sm:text-title text-foreground truncate mt-1">
                          {item.target.type === 'album' && item.target.slug ? (
                            <Link
                              to="/albums/$idOrSlug"
                              params={{ idOrSlug: item.target.slug }}
                              className="hover:underline"
                            >
                              {item.target.title}
                            </Link>
                          ) : item.target.type === 'playlist' ? (
                            <Link
                              to="/playlists/$id"
                              params={{ id: item.target.id }}
                              className="hover:underline"
                            >
                              {item.target.title}
                            </Link>
                          ) : (
                            item.target.title
                          )}
                        </div>

                        {item.target.subtitle && (
                          <div className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                            {item.target.subtitle}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isTrack && item.target.audioUrl && (
                          <button
                            type="button"
                            onClick={() => handleQueueFeedTrack(item)}
                            className="p-2 text-muted-foreground hover:text-foreground border border-border bg-background hover:bg-muted transition-colors cursor-pointer rounded-lg"
                            title="Add to queue"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                        )}

                        {item.target.type === 'album' && item.target.slug && (
                          <Link
                            to="/albums/$idOrSlug"
                            params={{ idOrSlug: item.target.slug }}
                            className="font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-2 border border-border hover:bg-muted transition-colors rounded-lg"
                          >
                            View
                          </Link>
                        )}

                        {item.target.type === 'playlist' && (
                          <Link
                            to="/playlists/$id"
                            params={{ id: item.target.id }}
                            className="font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-2 border border-border hover:bg-muted transition-colors rounded-lg"
                          >
                            Listen
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Load More Button */}
              {hasMoreFeed && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => fetchFeed(false, feedCursor || undefined)}
                    disabled={isLoadingMoreFeed}
                    className="bg-card border border-border hover:bg-muted text-foreground font-eyebrow text-eyebrow uppercase tracking-wider px-6 py-3 transition-colors cursor-pointer disabled:opacity-50 rounded-xl shadow-raised"
                  >
                    {isLoadingMoreFeed
                      ? 'Loading more...'
                      : 'Load Older Activity'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------------- RIGHT STICKY DOCK: REQUESTS, LIVE SESSIONS & DIRECTORY ---------------- */}
        <div
          className={`lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-20 ${
            mobileTab === 'stream' ? 'hidden lg:block' : ''
          }`}
        >
          {/* ===================== DOCK 1: PENDING FOLLOW REQUESTS ===================== */}
          {(incomingRequests.length > 0 || mobileTab === 'network') && (
            <div className="border border-border bg-card p-5 rounded-2xl shadow-raised space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-0.5">
                    Private Vault Requests
                  </div>
                  <h3 className="font-serif italic text-lg text-foreground font-normal">
                    Follow Requests ({incomingRequests.length})
                  </h3>
                </div>
                {incomingRequests.length > 0 && (
                  <span className="bg-primary/15 text-primary text-eyebrow font-mono px-2 py-0.5 rounded-full font-bold">
                    Action Needed
                  </span>
                )}
              </div>

              {incomingRequests.length === 0 ? (
                <div className="border border-border/60 bg-background p-4 text-center text-caption text-muted-foreground font-mono rounded-xl">
                  No pending follow requests at this time.
                </div>
              ) : (
                <div className="divide-y divide-border/60 border border-border/80 bg-background rounded-xl overflow-hidden">
                  {incomingRequests.map((req) => {
                    const isProcessing = processingRequestId === req.requesterId

                    return (
                      <div
                        key={req.requesterId}
                        className="p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-secondary/20 border border-border flex items-center justify-center font-eyebrow text-caption font-semibold uppercase text-foreground overflow-hidden shrink-0">
                            {req.avatarUrl ? (
                              <img
                                src={req.avatarUrl}
                                alt={req.displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              req.displayName[0] || 'U'
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-caption text-foreground block truncate">
                              {req.displayName}
                            </span>
                            <span className="font-mono text-eyebrow text-muted-foreground">
                              {formatRelativeTime(req.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleAcceptRequest(req.requesterId)}
                            className="bg-foreground text-background hover:bg-primary px-2.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold transition-colors disabled:opacity-50 cursor-pointer rounded-lg"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleRejectRequest(req.requesterId)}
                            className="border border-border hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer rounded-lg"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================== DOCK 2: LIVE FRIENDS ACTIVITY ===================== */}
          <div
            className={`border border-border bg-card p-5 rounded-2xl shadow-raised space-y-4 ${
              mobileTab === 'network' ? 'hidden lg:block' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-0.5 flex items-center gap-1.5">
                  <span>Real-Time Presence</span>
                </div>
                <h3 className="font-serif italic text-lg text-foreground font-normal">
                  Live Listening ({liveActivities.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={fetchLiveActivities}
                className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Pulse
              </button>
            </div>

            {isLoadingLive ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="border border-border bg-background p-4 rounded-xl animate-pulse space-y-2"
                  >
                    <div className="h-3 bg-secondary/20 rounded-control w-1/3" />
                    <div className="h-10 bg-secondary/10 rounded-control" />
                  </div>
                ))}
              </div>
            ) : liveActivities.length === 0 ? (
              <div className="border border-border/60 bg-background p-6 text-center space-y-2 rounded-xl">
                <div className="font-serif italic text-title text-foreground">
                  Quiet in the circle right now
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-relaxed">
                  None of your mutual friends or followed listeners are
                  broadcasting active streams at this moment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {liveActivities.map((item) => {
                  const isPlayingThis =
                    currentTrack?.id === item.activity.songId &&
                    playbackStatus === 'playing'

                  const progressPercent = item.activity.durationMs
                    ? Math.min(
                        100,
                        (item.activity.progressMs / item.activity.durationMs) *
                          100,
                      )
                    : 0

                  return (
                    <div
                      key={item.user.id}
                      className="border border-border bg-background p-3.5 rounded-xl shadow-raised space-y-3 hover:border-foreground/40 transition-all"
                    >
                      {/* Friend Header */}
                      <div className="flex items-center justify-between">
                        <Link
                          to="/users/$id"
                          params={{ id: item.user.id }}
                          className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-7 h-7 rounded-full bg-secondary/30 border border-border flex items-center justify-center font-eyebrow text-eyebrow font-semibold text-foreground overflow-hidden uppercase shrink-0">
                            {item.user.avatarUrl ? (
                              <img
                                src={item.user.avatarUrl}
                                alt={item.user.displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              item.user.displayName[0] || 'U'
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-caption text-foreground block truncate hover:text-primary transition-colors">
                              {item.user.displayName}
                            </span>
                            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                              {item.user.isMutualFriend
                                ? 'Mutual Friend'
                                : 'Followed'}
                            </span>
                          </div>
                        </Link>

                        <div className="flex items-center gap-1 bg-success-soft text-success border border-success/20 px-2 py-0.5 rounded-full font-eyebrow text-eyebrow uppercase tracking-wider shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                          <span>Streaming</span>
                        </div>
                      </div>

                      {/* Track Details */}
                      <div className="flex items-center gap-3 bg-card border border-border/70 p-2.5 rounded-lg">
                        <div className="relative w-12 h-12 bg-secondary/20 border border-border rounded-control shrink-0 overflow-hidden">
                          {item.activity.coverImageUrl ? (
                            <img
                              src={item.activity.coverImageUrl}
                              alt={item.activity.trackTitle}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-muted-foreground text-lg">
                              ♪
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4
                            className="font-sans font-semibold text-body text-foreground truncate"
                            title={item.activity.trackTitle}
                          >
                            {item.activity.trackTitle}
                          </h4>
                          <p className="font-sans text-eyebrow text-muted-foreground truncate">
                            {item.activity.artistName}
                          </p>

                          {/* Progress bar */}
                          <div className="mt-1.5 space-y-0.5">
                            <div className="w-full h-1 bg-secondary/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <div className="flex justify-between font-mono text-eyebrow text-muted-foreground/80">
                              <span>
                                {formatElapsed(item.activity.progressMs)}
                              </span>
                              {item.activity.durationMs && (
                                <span>
                                  {formatElapsed(item.activity.durationMs)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Listen Along Button */}
                        <button
                          type="button"
                          onClick={() => handleListenAlong(item)}
                          className={`shrink-0 px-2.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold border transition-all cursor-pointer rounded-lg shadow-raised ${
                            isPlayingThis
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background hover:bg-foreground hover:text-background hover:border-foreground text-foreground'
                          }`}
                        >
                          {isPlayingThis ? 'Playing' : 'Listen Along'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ===================== DOCK 3: DISCOVER COMMUNITY MEMBERS ===================== */}
          <div
            className={`border border-border bg-card p-5 rounded-2xl shadow-raised space-y-4 ${
              mobileTab === 'live' ? 'hidden lg:block' : ''
            }`}
          >
            <div>
              <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-0.5">
                Directory &nbsp;·&nbsp; Network
              </div>
              <h3 className="font-serif italic text-lg text-foreground font-normal">
                Discover Listeners
              </h3>
            </div>

            {/* Standard Search Bar */}
            <div className="relative">
              <svg
                className="w-4 h-4 text-muted-foreground/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  searchCommunity(e.target.value)
                }}
                placeholder="Search community by name..."
                className="w-full font-mono text-caption py-2.5 pl-9 pr-9 border border-border bg-background rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-raised"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    searchCommunity('')
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Members Directory List */}
            {isSearchingUsers ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="p-3 border border-border bg-background rounded-xl animate-pulse flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-secondary/20" />
                    <div className="h-3 bg-secondary/20 rounded-control w-1/2" />
                  </div>
                ))}
              </div>
            ) : directoryUsers.length === 0 ? (
              <div className="border border-border/60 bg-background p-4 text-center font-mono text-caption text-muted-foreground rounded-xl">
                No matching members found.
              </div>
            ) : (
              <div className="divide-y divide-border/60 border border-border/80 bg-background rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                {directoryUsers.slice(0, 10).map((member) => {
                  const isActing = actingUserId === member.id

                  return (
                    <div
                      key={member.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
                    >
                      <Link
                        to="/users/$id"
                        params={{ id: member.id }}
                        className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
                      >
                        <div className="w-8 h-8 rounded-full bg-secondary/20 border border-border flex items-center justify-center font-eyebrow text-caption font-semibold uppercase text-foreground overflow-hidden shrink-0">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            member.displayName[0] || 'U'
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className="font-semibold text-caption text-foreground block truncate hover:text-primary transition-colors">
                            {member.displayName}
                          </span>
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
                            {member.relationship === 'FRIENDS'
                              ? 'Mutual Friend'
                              : member.relationship === 'FOLLOWING'
                                ? 'Following'
                                : member.relationship === 'PENDING_SENT'
                                  ? 'Request Sent'
                                  : member.isPrivateAccount
                                    ? 'Private Member'
                                    : 'Groovy Member'}
                          </span>
                        </div>
                      </Link>

                      {/* Follow Action */}
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => handleToggleFollow(member)}
                        className={`font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1.5 border transition-all cursor-pointer shrink-0 disabled:opacity-50 rounded-lg ${
                          member.relationship === 'FRIENDS' ||
                          member.relationship === 'FOLLOWING'
                            ? 'border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground'
                            : member.relationship === 'PENDING_SENT'
                              ? 'border-border bg-secondary/20 text-muted-foreground hover:bg-destructive/20 hover:text-destructive'
                              : 'border-foreground bg-foreground text-background hover:bg-primary hover:border-primary'
                        }`}
                      >
                        {member.relationship === 'FRIENDS'
                          ? 'Friends'
                          : member.relationship === 'FOLLOWING'
                            ? 'Following'
                            : member.relationship === 'PENDING_SENT'
                              ? 'Requested'
                              : member.isPrivateAccount
                                ? 'Request'
                                : 'Follow'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
