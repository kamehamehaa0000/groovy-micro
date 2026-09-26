import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { useLikesStore } from '../../stores/likes.store'
import { useFollowsStore } from '../../stores/follows.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useJamStore } from '../../stores/jam.store'
import {
  navigateToArtist,
  navigateToRelease,
  useResolvedTrackCredits,
} from '../../lib/artist-resolver'
import { artistsApi } from '../../lib/artists.api'
import type { ArtistProfile } from '../../types/artist'
import { SongActionMenu } from './SongActionMenu'
import { HeartIconSVG, VerifiedBadgeSVG } from '../icons'

interface DesktopNowPlayingSidebarProps {
  onClose: () => void
  onSwitchToQueue: () => void
}

export function DesktopNowPlayingSidebar({
  onClose,
  onSwitchToQueue,
}: DesktopNowPlayingSidebarProps) {
  const navigate = useNavigate()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const streamQuality = usePlayerStore((s) => s.streamQuality)
  const streamFormat = usePlayerStore((s) => s.streamFormat)
  const contextTitle = usePlayerStore((s) => s.contextTitle)
  const userQueue = usePlayerStore((s) => s.userQueue)
  const contextQueue = usePlayerStore((s) => s.contextQueue)
  const contextIndex = usePlayerStore((s) => s.contextIndex)

  // Jam Store
  const activeRoom = useJamStore((s) => s.activeRoom)
  const isHost = useJamStore((s) => s.isHost)
  const members = useJamStore((s) => s.members)
  const leaveRoom = useJamStore((s) => s.leaveRoom)

  // Likes & Follows
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds)
  const toggleFollow = useFollowsStore((s) => s.toggleFollow)
  const { isAuthenticated } = useAuthStore()
  const { openAuthModal } = useAuthModalStore()

  const [artistDetails, setArtistDetails] = useState<ArtistProfile | null>(null)
  const [isFollowLoading, setIsFollowLoading] = useState(false)
  const [jamCopied, setJamCopied] = useState(false)

  // Fetch artist details
  useEffect(() => {
    if (!currentTrack?.artistId && !currentTrack?.artistSlug) {
      setArtistDetails(null)
      return
    }
    let isCancelled = false
    const identifier = currentTrack.artistSlug || currentTrack.artistId
    artistsApi
      .getByIdOrSlug(identifier)
      .then((profile) => {
        if (!isCancelled && profile) {
          setArtistDetails(profile)
        }
      })
      .catch(() => {
        if (!isCancelled) setArtistDetails(null)
      })

    return () => {
      isCancelled = true
    }
  }, [currentTrack?.artistId, currentTrack?.artistSlug])

  const resolvedCredits = useResolvedTrackCredits(currentTrack)

  if (!currentTrack) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-ink-soft select-none">
        <span className="font-serif italic text-4xl mb-2 text-ink-soft/40">
          ♪
        </span>
        <p className="font-semibold text-sm text-ink">No track playing</p>
        <p className="text-xs text-ink-soft mt-1">
          Play a track to view details and artist info
        </p>
      </div>
    )
  }

  const parsedCredits = resolvedCredits
  const isLiked = likedSongIds.has(currentTrack.id)
  const isFollowing = artistDetails
    ? followedArtistIds.has(artistDetails.id)
    : false
  const nextTrack =
    userQueue.length > 0 ? userQueue[0] : contextQueue[contextIndex + 1] || null

  const handleToggleLike = async () => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    await toggleSongLike(currentTrack.id)
  }

  const handleToggleFollow = async () => {
    if (!artistDetails) return
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    setIsFollowLoading(true)
    try {
      await toggleFollow(artistDetails.id)
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleToggleArtistFollow = async (artistId: string) => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    await toggleFollow(artistId)
  }

  const handleCopyJamLink = () => {
    if (!activeRoom) return
    const url = `${window.location.origin}/jam/${activeRoom.roomCode}`
    navigator.clipboard.writeText(url).then(() => {
      setJamCopied(true)
      setTimeout(() => setJamCopied(false), 2000)
    })
  }

  return (
    <div className="h-full flex flex-col min-h-0 select-none bg-panel">
      {/* ===================== SIDEBAR HEADER ===================== */}
      <div className="shrink-0 h-14 border-b border-line px-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateToRelease(currentTrack, navigate)}
          className="min-w-0 flex-1 pr-3 text-left cursor-pointer group"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft block truncate group-hover:text-ink transition-colors">
            {contextTitle ? `From ${contextTitle}` : 'Now Playing'}
          </span>
          <span className="font-serif italic font-semibold text-sm text-ink block truncate mt-0.5 group-hover:underline">
            {currentTrack.title}
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
            <path
              d="M4 4L12 12M12 4L4 12"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>

      {/* ===================== SCROLLABLE BODY ===================== */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 no-scrollbar">
        {/* Large 1:1 Album Artwork */}
        <button
          type="button"
          onClick={() => navigateToRelease(currentTrack, navigate)}
          className="w-full aspect-square rounded-xl overflow-hidden shadow-lg bg-canvas-deep border border-line/60 relative flex items-center justify-center cursor-pointer group hover:opacity-95 transition-opacity"
        >
          {currentTrack.coverImageUrl ? (
            <img
              src={currentTrack.coverImageUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-serif italic text-6xl text-ink-soft/40">
              ♪
            </div>
          )}
        </button>

        {/* Title, Artist Link & Action Buttons */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigateToRelease(currentTrack, navigate)}
              className="font-serif italic font-semibold text-xl text-ink truncate leading-snug hover:underline cursor-pointer text-left block max-w-full"
            >
              {currentTrack.title}
            </button>
            <div className="text-xs text-ink-soft truncate mt-1">
              {parsedCredits.all.length > 0 ? (
                parsedCredits.all.map((artist, idx) => (
                  <span key={artist.name + idx}>
                    <button
                      type="button"
                      onClick={() => navigateToArtist(artist, navigate)}
                      className="hover:text-ink hover:underline transition-colors cursor-pointer text-left"
                    >
                      {artist.name}
                    </button>
                    {idx < parsedCredits.all.length - 1 && (
                      <span className="text-ink-soft/60">, </span>
                    )}
                  </span>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    navigateToArtist(
                      {
                        name: currentTrack.artistName,
                        id: currentTrack.artistId,
                        slug: currentTrack.artistSlug,
                      },
                      navigate
                    )
                  }
                  className="hover:text-ink hover:underline transition-colors cursor-pointer text-left"
                >
                  {currentTrack.artistName || "Unknown Artist"}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={handleToggleLike}
              aria-label={isLiked ? 'Unlike song' : 'Like song'}
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:text-ink transition-colors cursor-pointer"
            >
              <HeartIconSVG
                filled={isLiked}
                className={`w-4 h-4 ${isLiked ? 'text-red-500 dark:text-red-400' : ''}`}
              />
            </button>
            <SongActionMenu track={currentTrack} align="right" />
          </div>
        </div>

        {/* ===================== LIVE JAM SESSION CARD ===================== */}
        {activeRoom && (
          <div className="rounded-xl overflow-hidden bg-canvas border border-emerald-500/30 p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 font-semibold">
                  Live Jam Active
                </span>
              </div>
              <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                {activeRoom.privacy.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-panel border border-line">
                <div className="min-w-0">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block">
                    Invite Code
                  </span>
                  <span className="font-mono font-bold text-sm text-ink tracking-wider">
                    {activeRoom.roomCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyJamLink}
                  className="px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider font-semibold border border-line hover:border-emerald-500 bg-canvas text-ink transition-colors cursor-pointer"
                >
                  {jamCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-soft text-[11px]">
                  DJ:{' '}
                  <strong className="text-ink font-semibold">
                    {isHost ? 'You (Host)' : activeRoom.hostName}
                  </strong>
                </span>
                <span className="text-[11px] font-mono text-ink-soft">
                  {members.length}{' '}
                  {members.length === 1 ? 'listener' : 'listeners'}
                </span>
              </div>

              {/* Members Avatar Preview */}
              {members.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      title={`${m.displayName}${m.role === 'HOST' ? ' (DJ)' : ''}`}
                      className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-mono font-bold text-[10px] shrink-0 overflow-hidden"
                    >
                      {m.avatarUrl ? (
                        <img
                          src={m.avatarUrl}
                          alt={m.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        m.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Link
                  to="/jam/$code"
                  params={{ code: activeRoom.roomCode }}
                  className="flex-1 py-1.5 rounded-lg border border-line bg-panel hover:bg-canvas text-center font-mono text-[10px] uppercase tracking-wider text-ink font-semibold transition-colors"
                >
                  Jam Page &rarr;
                </Link>
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-mono text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== ABOUT THE ARTIST CARD ===================== */}
        {artistDetails && (
          <div className="rounded-xl overflow-hidden bg-canvas border border-line p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft font-semibold">
                About The Artist
              </span>
              <button
                type="button"
                onClick={() =>
                  navigateToArtist(
                    {
                      name: artistDetails.stageName,
                      slug: artistDetails.slug,
                      id: artistDetails.id,
                    },
                    navigate,
                  )
                }
                className="font-mono text-[9.5px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
              >
                Profile &rarr;
              </button>
            </div>

            {/* Banner/Avatar Container */}
            <div className="w-full h-32 rounded-lg bg-panel overflow-hidden relative border border-line/40">
              {artistDetails.bannerUrl ? (
                <img
                  src={artistDetails.bannerUrl}
                  alt={artistDetails.stageName}
                  className="w-full h-full object-cover"
                />
              ) : artistDetails.avatarUrl ? (
                <img
                  src={artistDetails.avatarUrl}
                  alt={artistDetails.stageName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif italic text-3xl text-ink-soft/40">
                  {artistDetails.stageName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-ink">
                    {artistDetails.stageName}
                  </h3>
                  {artistDetails.verified && (
                    <VerifiedBadgeSVG className="w-3.5 h-3.5 text-blue" />
                  )}
                </div>
                {artistDetails.monthlyListeners !== undefined && (
                  <p className="font-mono text-[10px] text-ink-soft mt-0.5">
                    {artistDetails.monthlyListeners.toLocaleString()} monthly
                    listeners
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleFollow}
                disabled={isFollowLoading}
                className={`font-mono text-[9.5px] uppercase tracking-wider px-3.5 py-1.5 rounded-full border transition-all cursor-pointer font-semibold ${
                  isFollowing
                    ? 'border-line bg-panel text-ink hover:border-red-400 hover:text-red-500'
                    : 'border-ink bg-ink text-canvas hover:opacity-90'
                }`}
              >
                {isFollowLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>

            {artistDetails.bio && (
              <p className="text-xs text-ink-soft leading-relaxed line-clamp-3">
                {artistDetails.bio}
              </p>
            )}
          </div>
        )}

        {/* ===================== COLLABORATORS & FEATURED ARTISTS CARD ===================== */}
        {parsedCredits.collaborators.length > 0 && (
          <div className="rounded-xl overflow-hidden bg-canvas border border-line p-4 space-y-3 shadow-xs">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft font-semibold block">
              Featured &amp; Collaborators
            </span>

            <div className="space-y-2.5">
              {parsedCredits.collaborators.map((collab, idx) => {
                const isCollabFollowing = collab.id
                  ? followedArtistIds.has(collab.id)
                  : false

                return (
                  <div
                    key={collab.name + idx}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-panel border border-line/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => navigateToArtist(collab, navigate)}
                        className="w-8 h-8 rounded-full bg-blue/10 text-blue font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-blue/20 hover:scale-105 transition-transform cursor-pointer"
                      >
                        {collab.name.slice(0, 2).toUpperCase()}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigateToArtist(collab, navigate)}
                            className="font-bold text-xs text-ink truncate hover:underline cursor-pointer text-left"
                          >
                            {collab.name}
                          </button>
                          {collab.verified && (
                            <VerifiedBadgeSVG className="w-3.5 h-3.5 text-blue" />
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-ink-soft block uppercase tracking-wider">
                          {collab.role}
                        </span>
                      </div>
                    </div>

                    {collab.id && (
                      <button
                        type="button"
                        onClick={() => handleToggleArtistFollow(collab.id!)}
                        className={`font-mono text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all cursor-pointer font-semibold shrink-0 ${
                          isCollabFollowing
                            ? 'border-line bg-canvas text-ink hover:text-red-500 hover:border-red-400'
                            : 'border-ink bg-ink text-canvas hover:opacity-90'
                        }`}
                      >
                        {isCollabFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ===================== NEXT IN QUEUE CARD ===================== */}
        {nextTrack && (
          <div className="rounded-xl bg-canvas border border-line p-3.5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft font-semibold">
                Next In Queue
              </span>
              <button
                type="button"
                onClick={onSwitchToQueue}
                className="font-mono text-[9.5px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
              >
                Open Queue &rarr;
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-panel border border-line/60 overflow-hidden shrink-0">
                {nextTrack.coverImageUrl ? (
                  <img
                    src={nextTrack.coverImageUrl}
                    alt={nextTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                    ♪
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-ink truncate">
                  {nextTrack.title}
                </div>
                <div className="text-[11px] text-ink-soft truncate">
                  {nextTrack.artistName}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== CREDITS & FORMAT CARD ===================== */}
        <div className="rounded-xl bg-canvas border border-line p-4 space-y-2.5 text-xs shadow-xs">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft font-semibold block mb-1">
            Release &amp; Audio Specs
          </span>

          <div className="flex items-center justify-between py-1 border-b border-line/40">
            <span className="text-ink-soft">Primary Artist:</span>
            <span className="font-medium text-ink truncate max-w-45">
              <button
                type="button"
                onClick={() =>
                  navigateToArtist(parsedCredits.primary, navigate)
                }
                className="hover:text-blue hover:underline cursor-pointer text-left truncate"
              >
                {parsedCredits.primary.name}
              </button>
            </span>
          </div>

          {parsedCredits.collaborators.length > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Featured:</span>
              <span className="font-medium text-ink truncate max-w-45">
                {parsedCredits.collaborators.map((c, idx) => (
                  <span key={c.name + idx}>
                    <button
                      type="button"
                      onClick={() => navigateToArtist(c, navigate)}
                      className="hover:text-blue hover:underline cursor-pointer text-left"
                    >
                      {c.name}
                    </button>
                    {idx < parsedCredits.collaborators.length - 1 && ', '}
                  </span>
                ))}
              </span>
            </div>
          )}

          {parsedCredits.producers.length > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Production:</span>
              <span className="font-medium text-ink truncate max-w-45">
                {parsedCredits.producers.map((p) => p.name).join(', ')}
              </span>
            </div>
          )}

          {parsedCredits.writers.length > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Writing:</span>
              <span className="font-medium text-ink truncate max-w-45">
                {parsedCredits.writers.map((w) => w.name).join(', ')}
              </span>
            </div>
          )}

          {currentTrack.albumTitle && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Release:</span>
              <span className="font-medium text-ink truncate max-w-45">
                {currentTrack.albumTitle}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-1 border-b border-line/40">
            <span className="text-ink-soft">Stream Quality:</span>
            <span className="font-mono text-[10px] uppercase font-bold text-blue">
              {streamQuality === 'lossless'
                ? 'Hi-Fi FLAC Lossless'
                : streamFormat === 'hls'
                  ? '320 kbps AAC HLS'
                  : '320 kbps MP3'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-ink-soft">Audio Architecture:</span>
            <span className="font-mono text-[10px] text-ink-soft uppercase tracking-wider">
              Studio Master Lock
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
