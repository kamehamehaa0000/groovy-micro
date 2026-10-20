import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { useLikesStore } from '../../stores/likes.store'
import { useFollowsStore } from '../../stores/follows.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useJamStore } from '../../stores/jam.store'
import { artistsApi } from '../../lib/artists.api'
import {
  navigateToArtist,
  navigateToRelease,
  useResolvedTrackCredits,
} from '../../lib/artist-resolver'
import type { ArtistProfile } from '../../types/artist'
import { SongActionMenu } from './SongActionMenu'
import { MonitorSpeaker, Radio } from 'lucide-react'
import { useConnectStore } from '../../stores/connect.store'
import {
  ChevronDownIconSVG,
  HeartIconSVG,
  PlayIconSVG,
  PauseIconSVG,
  VerifiedBadgeSVG,
} from '../icons'

/* ---------------------------------------------------------------------------
 * Spotify-proportioned sizing (reference: 390 x 844 viewport)
 *
 *   side gutter ........ 24px   -> 6.15vw, clamped 16–24px
 *   header height ...... 56px
 *   artwork ............ full content width (342px), square, 8px radius,
 *                        shrinks automatically on short screens
 *   title .............. 24px bold / artist 16px
 *   scrubber ........... 4px track, 12px knob, 44px touch target
 *   shuffle / repeat ... 24px icons
 *   prev / next ........ 32px icons
 *   play / pause ....... 64px circle (16.4vw, clamped 56–64px)
 *   bottom row ......... 24px icons, 44px touch targets
 *
 * Every dimension scales with clamp() so the layout holds from 320px
 * (iPhone SE) up to ~767px, and respects notches via safe-area insets.
 * ------------------------------------------------------------------------- */

const GUTTER = 'px-[clamp(16px,6.15vw,24px)]'
const CONTENT = 'w-full max-w-[480px] mx-auto'

// ~380px = header (56) + track info (~64) + scrubber (~60) + controls (~88)
// + utility row (44) + vertical padding. Safe-area insets are added on top.
const ARTWORK_SIZE = `max(160px, min(calc(100vw - 2 * clamp(16px, 6.15vw, 24px)), 480px, calc(100dvh - 380px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))))`

// Clicks arriving this soon after the overlay opens are the synthesized click
// from the tap that opened the mini player (not a real, deliberate tap) and are
// swallowed. Kept small so genuine interaction is never noticeably delayed.
const GHOST_CLICK_WINDOW_MS = 350

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export function MobileExpandedPlayer() {
  const navigate = useNavigate()
  const isExpanded = usePlayerStore((s) => s.isNowPlayingExpanded)
  const setNowPlayingExpanded = usePlayerStore((s) => s.setNowPlayingExpanded)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const contextTitle = usePlayerStore((s) => s.contextTitle)
  const userQueue = usePlayerStore((s) => s.userQueue)
  const contextQueue = usePlayerStore((s) => s.contextQueue)
  const contextIndex = usePlayerStore((s) => s.contextIndex)

  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const seek = usePlayerStore((s) => s.seek)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const toggleQueueDrawer = usePlayerStore((s) => s.toggleQueueDrawer)
  const toggleDevicesDrawer = usePlayerStore((s) => s.toggleDevicesDrawer)

  // Groovy Connect: another device may be the Speaker of this account.
  const connectSessionView = useConnectStore((s) => s.sessionView)
  const youAreSpeaker = useConnectStore((s) => s.youAreSpeaker)

  // Jam Store
  const activeRoom = useJamStore((s) => s.activeRoom)
  const isHost = useJamStore((s) => s.isHost)
  const members = useJamStore((s) => s.members)
  const leaveRoom = useJamStore((s) => s.leaveRoom)
  const openJamModal = useJamStore((s) => s.openModal)

  // Likes & Follows
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds)
  const toggleFollow = useFollowsStore((s) => s.toggleFollow)
  const { isAuthenticated } = useAuthStore()
  const { openAuthModal } = useAuthModalStore()

  // Artist info state for "About the Artist" card
  const [artistDetails, setArtistDetails] = useState<ArtistProfile | null>(null)
  const [isFollowLoading, setIsFollowLoading] = useState(false)
  const [jamCopied, setJamCopied] = useState(false)

  // Scrubber drag state
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPosition, setScrubPosition] = useState(0)
  const scrubBarRef = useRef<HTMLDivElement | null>(null)

  // Touch gesture state for fluid pull-down dismissal
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const touchStartRef = useRef<{
    y: number
    time: number
    targetIsTop: boolean
  } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  // Timestamp of the most recent open, used to drop the opening tap's ghost
  // click (see handleOverlayClickCapture).
  const openedAtRef = useRef(0)

  // Record the open time synchronously — layout effects run within the same
  // touchend flush, before the browser dispatches the synthesized click task.
  useLayoutEffect(() => {
    if (isExpanded) openedAtRef.current = Date.now()
  }, [isExpanded])

  // Lock body scroll when open
  useEffect(() => {
    if (!isExpanded) {
      setDragY(0)
      setIsClosing(false)
      return
    }
    const origOverflow = document.body.style.overflow
    const origTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = origOverflow
      document.body.style.touchAction = origTouchAction
    }
  }, [isExpanded])

  // Fetch artist details when track changes
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

  if (!isExpanded && !isClosing) return null
  if (!currentTrack) return null

  const isPlaying = playbackStatus === 'playing'
  const isLoading = playbackStatus === 'loading'
  const isLiked = likedSongIds.has(currentTrack.id)
  const otherSpeaker =
    !youAreSpeaker && connectSessionView?.session.speaker
      ? connectSessionView.session.speaker
      : null
  const isFollowing = artistDetails
    ? followedArtistIds.has(artistDetails.id)
    : false
  const parsedCredits = resolvedCredits

  // Next track preview
  const nextTrack =
    userQueue.length > 0 ? userQueue[0] : contextQueue[contextIndex + 1] || null

  const displayTime = isScrubbing ? scrubPosition : currentTime
  const progressPercent =
    duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0

  const closePlayer = () => setNowPlayingExpanded(false)

  // Safety net for the click-through described in MobileMiniPlayer: even if a
  // browser still emits the opening tap's synthesized click, drop it here in
  // the capture phase so it never reaches the transport controls underneath.
  const handleOverlayClickCapture = (e: React.MouseEvent) => {
    if (Date.now() - openedAtRef.current < GHOST_CLICK_WINDOW_MS) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // Touch Drag-to-Dismiss Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const scrollContainer = scrollContainerRef.current
    const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 2
    touchStartRef.current = {
      y: e.touches[0].clientY,
      time: Date.now(),
      targetIsTop: isAtTop,
    }
    setIsDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchStartRef.current.y

    // Only allow pull-down if starting from the top of the scroll container
    if (touchStartRef.current.targetIsTop && deltaY > 0) {
      setIsDragging(true)
      if (e.cancelable) e.preventDefault()
      // Elastic damping
      const damped = deltaY > 200 ? 200 + (deltaY - 200) * 0.4 : deltaY
      setDragY(damped)
    }
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return
    const elapsed = Date.now() - touchStartRef.current.time
    const velocity = dragY / Math.max(elapsed, 1)

    touchStartRef.current = null
    setIsDragging(false)

    // If dragged past 85px or flicked quickly downward, dismiss smoothly
    if (dragY > 85 || (velocity > 0.4 && dragY > 30)) {
      triggerDismiss()
    } else {
      setDragY(0)
    }
  }

  const triggerDismiss = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10)
    }
    setIsClosing(true)
    setDragY(window.innerHeight)
    setTimeout(() => {
      setNowPlayingExpanded(false)
      setIsClosing(false)
      setDragY(0)
    }, 280)
  }

  // Scrubber (pointer events + capture: one code path for touch, pen & mouse,
  // and the finger can slide off the bar without losing the drag)
  const positionFromClientX = (clientX: number) => {
    const el = scrubBarRef.current
    if (!el || duration <= 0) return 0
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const handleScrubDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsScrubbing(true)
    setScrubPosition(positionFromClientX(e.clientX))
  }

  const handleScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return
    setScrubPosition(positionFromClientX(e.clientX))
  }

  const handleScrubEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    seek(scrubPosition)
    setIsScrubbing(false)
  }

  const handleToggleLike = async () => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(12)
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
    setIsFollowLoading(true)
    try {
      await toggleFollow(artistId)
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleCopyJamLink = () => {
    if (!activeRoom) return
    const url = `${window.location.origin}/jam/${activeRoom.roomCode}`
    navigator.clipboard.writeText(url)
    setJamCopied(true)
    setTimeout(() => setJamCopied(false), 2000)
  }

  const goToRelease = () =>
    navigateToRelease(currentTrack, navigate, closePlayer)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing View"
      className="fixed inset-0 z-50 bg-background text-foreground flex flex-col md:hidden select-none overflow-hidden"
      style={{
        height: '100dvh',
        transform: `translateY(${dragY}px)`,
        transition: isDragging
          ? 'none'
          : 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClickCapture={handleOverlayClickCapture}
    >
      {/* Ambient background tint */}
      <div className="absolute inset-0 bg-linear-to-b from-card via-background to-background pointer-events-none opacity-60" />

      {/* ===================== HEADER (56px + safe area) ===================== */}
      <header
        className={`relative z-10 shrink-0 ${GUTTER}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div
          className={`${CONTENT} h-14 flex items-center justify-between gap-2`}
        >
          <button
            type="button"
            onClick={triggerDismiss}
            aria-label="Collapse Player"
            className="w-11 h-11 -ml-2.5 rounded-full flex items-center justify-center text-foreground hover:text-foreground active:scale-90 transition-transform cursor-pointer shrink-0"
          >
            <ChevronDownIconSVG className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={goToRelease}
            className="flex-1 min-w-0 text-center cursor-pointer group"
          >
            <span className="block font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground truncate group-hover:text-foreground transition-colors">
              {contextTitle
                ? 'Playing From'
                : currentTrack.albumTitle
                  ? 'Playing From Album'
                  : 'Groovy Catalog'}
            </span>
            <span className="block font-bold text-caption leading-tight text-foreground truncate mt-0.5 group-hover:underline">
              {contextTitle || currentTrack.albumTitle || 'Master Stream'}
            </span>
          </button>

          <div className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
            <SongActionMenu
              track={currentTrack}
              align="right"
              buttonClassName="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:scale-90 transition-transform cursor-pointer"
              triggerIcon={
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="2.25" />
                  <circle cx="12" cy="12" r="2.25" />
                  <circle cx="12" cy="19" r="2.25" />
                </svg>
              }
            />
          </div>
        </div>
      </header>

      {/* ===================== SCROLL BODY ===================== */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar"
      >
        {/* ---------- First screen: always fits the viewport ---------- */}
        <section
          className={`min-h-full flex flex-col ${GUTTER}`}
          style={{
            paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Artwork: fills all spare height, stays square, capped by width */}
          <div
            className={`${CONTENT} flex-1 flex items-center justify-center py-[clamp(8px,2.5dvh,24px)]`}
          >
            <div
              className="rounded-lg overflow-hidden shadow-2xl bg-card relative flex items-center justify-center cursor-pointer active:scale-[0.985] transition-transform shrink-0"
              style={{
                // Square: limited by screen width (minus gutters), 480px max,
                // and by height left after header, info, scrubber and controls.
                width: ARTWORK_SIZE,
                height: ARTWORK_SIZE,
              }}
            >
              {currentTrack.coverImageUrl ? (
                <img
                  src={currentTrack.coverImageUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif italic text-6xl text-muted-foreground/40">
                  ♪
                </div>
              )}
            </div>
          </div>

          {/* Track info + like */}
          <div
            className={`${CONTENT} shrink-0 flex items-center justify-between gap-4 pt-[clamp(8px,2dvh,20px)]`}
          >
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={goToRelease}
                className="font-serif italic font-bold text-[clamp(1.25rem,6.15vw,1.5rem)] text-foreground truncate leading-tight cursor-pointer text-left block max-w-full"
              >
                {currentTrack.title}
              </button>
              <div className="flex items-center flex-wrap gap-x-1 text-[clamp(0.875rem,4.1vw,1rem)] text-muted-foreground mt-0.5 leading-snug">
                {parsedCredits.all.length > 0 ? (
                  parsedCredits.all.map((artist, idx) => (
                    <span
                      key={artist.name + idx}
                      className="inline-flex items-center min-w-0"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          navigateToArtist(artist, navigate, closePlayer)
                        }
                        className="hover:text-foreground transition-colors truncate cursor-pointer text-left"
                      >
                        {artist.name}
                      </button>
                      {idx < parsedCredits.all.length - 1 && (
                        <span className="text-muted-foreground/60 ml-1 select-none">
                          {idx === 0 ? 'feat.' : '&'}
                        </span>
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
                        navigate,
                        closePlayer,
                      )
                    }
                    className="hover:text-foreground transition-colors truncate cursor-pointer text-left"
                  >
                    {currentTrack.artistName || 'Unknown Artist'}
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleLike}
              aria-label={isLiked ? 'Unlike song' : 'Like song'}
              aria-pressed={isLiked}
              className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-125 transition-transform shrink-0 cursor-pointer"
            >
              <HeartIconSVG
                filled={isLiked}
                className={`w-[clamp(22px,6.15vw,24px)] h-[clamp(22px,6.15vw,24px)] ${
                  isLiked ? 'text-destructive' : ''
                }`}
              />
            </button>
          </div>

          {/* Scrubber */}
          <div className={`${CONTENT} shrink-0 pt-[clamp(4px,1.2dvh,12px)]`}>
            <div
              ref={scrubBarRef}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.floor(duration) || 0}
              aria-valuenow={Math.floor(displayTime)}
              aria-valuetext={`${formatTime(displayTime)} of ${formatTime(duration)}`}
              className="relative h-11 flex items-center cursor-pointer touch-none"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onPointerDown={handleScrubDown}
              onPointerMove={handleScrubMove}
              onPointerUp={handleScrubEnd}
              onPointerCancel={handleScrubEnd}
            >
              <div className="w-full h-1 bg-border/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 bg-foreground rounded-full shadow-md pointer-events-none transition-[width,height] duration-100 ${
                  isScrubbing ? 'w-4 h-4' : 'w-3 h-3'
                }`}
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-caption font-mono text-muted-foreground -mt-1.5 tabular-nums">
              <span>{formatTime(displayTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Transport controls */}
          <div
            className={`${CONTENT} shrink-0 flex items-center justify-between pt-[clamp(4px,1.5dvh,16px)]`}
          >
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label={isShuffle ? 'Shuffle on' : 'Shuffle off'}
              aria-pressed={isShuffle}
              className={`w-11 h-11 -ml-2.5 flex items-center justify-center transition-colors active:scale-90 cursor-pointer ${
                isShuffle ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[clamp(20px,6.15vw,24px)] h-[clamp(20px,6.15vw,24px)]"
              >
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </button>

            <button
              type="button"
              onClick={previous}
              aria-label="Previous track"
              className="w-14 h-14 flex items-center justify-center text-foreground active:scale-90 transition-transform cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[clamp(26px,8.2vw,32px)] h-[clamp(26px,8.2vw,32px)]"
              >
                <polygon points="19 20 9 12 19 4 19 20" />
                <line
                  x1="5"
                  y1="4"
                  x2="5"
                  y2="20"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={togglePlay}
              disabled={isLoading}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-[clamp(56px,16.4vw,64px)] h-[clamp(56px,16.4vw,64px)] rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition-transform cursor-pointer shrink-0"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-[3px] border-background border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <PauseIconSVG className="w-[44%] h-[44%] text-background" />
              ) : (
                <PlayIconSVG className="w-[44%] h-[44%] text-background ml-[4%]" />
              )}
            </button>

            <button
              type="button"
              onClick={next}
              aria-label="Next track"
              className="w-14 h-14 flex items-center justify-center text-foreground active:scale-90 transition-transform cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[clamp(26px,8.2vw,32px)] h-[clamp(26px,8.2vw,32px)]"
              >
                <polygon points="5 4 15 12 5 20 5 4" />
                <line
                  x1="19"
                  y1="4"
                  x2="19"
                  y2="20"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={toggleRepeat}
              aria-label={`Repeat mode: ${repeatMode}`}
              className={`w-11 h-11 -mr-2.5 flex items-center justify-center transition-colors active:scale-90 relative cursor-pointer ${
                repeatMode !== 'off' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[clamp(20px,6.15vw,24px)] h-[clamp(20px,6.15vw,24px)]"
              >
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              {repeatMode === 'one' && (
                <span className="absolute top-1.5 right-1 text-eyebrow leading-none font-mono font-bold bg-primary text-background px-1 py-0.5 rounded-full">
                  1
                </span>
              )}
            </button>
          </div>

          {/* Bottom utility row: Jam (left) / Queue (right) */}
          <div
            className={`${CONTENT} shrink-0 flex items-center justify-between pt-[clamp(0px,0.8dvh,8px)]`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openJamModal}
                aria-label={
                  activeRoom ? `Live Jam: ${activeRoom.roomCode}` : 'Live Jam'
                }
                className={`w-11 h-11 -ml-2.5 rounded-full flex items-center justify-center transition-colors active:scale-90 cursor-pointer ${
                  activeRoom
                    ? 'text-success bg-success-soft'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-[clamp(18px,5.4vw,22px)] leading-none">
                  <Radio size={28} />
                </span>
              </button>

              <button
                type="button"
                onClick={toggleDevicesDrawer}
                aria-label={
                  otherSpeaker
                    ? `Playing on ${otherSpeaker.deviceName}. Open devices.`
                    : 'Devices'
                }
                title={
                  otherSpeaker
                    ? `Playing on ${otherSpeaker.deviceName}`
                    : 'Devices'
                }
                className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors active:scale-90 cursor-pointer ${
                  otherSpeaker
                    ? 'text-success'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MonitorSpeaker
                  className="w-[clamp(20px,6.15vw,24px)] h-[clamp(20px,6.15vw,24px)]"
                  strokeWidth={2}
                />
                {otherSpeaker && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-success rounded-full animate-pulse" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={toggleQueueDrawer}
              aria-label="Open queue"
              className="w-11 h-11 -mr-2.5 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-transform cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="w-[clamp(20px,6.15vw,24px)] h-[clamp(20px,6.15vw,24px)]"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </section>

        {/* ---------- Cards below the fold ---------- */}
        <div
          className={`${GUTTER} pt-2 space-y-3`}
          style={{
            paddingBottom:
              'max(48px, calc(env(safe-area-inset-bottom, 0px) + 32px))',
          }}
        >
          {/* LIVE JAM SESSION */}
          {activeRoom && (
            <div
              className={`${CONTENT} rounded-xl overflow-hidden bg-card border border-success/30 p-4 space-y-3 shadow-md`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-success font-semibold">
                    Live Jam Active
                  </span>
                </div>
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control bg-success-soft text-success border border-success/20">
                  {activeRoom.privacy.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted border border-border">
                <div className="min-w-0">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
                    Invite Code
                  </span>
                  <span className="font-mono font-bold text-body text-foreground tracking-wider">
                    {activeRoom.roomCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyJamLink}
                  className="min-h-9 px-3 rounded-md text-eyebrow font-eyebrow uppercase tracking-wider font-semibold border border-border hover:border-success bg-card text-foreground transition-colors cursor-pointer"
                >
                  {jamCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-caption">
                  DJ:{' '}
                  <strong className="text-foreground font-semibold">
                    {isHost ? 'You (Host)' : activeRoom.hostName}
                  </strong>
                </span>
                <span className="text-caption font-mono text-muted-foreground">
                  {members.length}{' '}
                  {members.length === 1 ? 'listener' : 'listeners'}
                </span>
              </div>

              {members.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      title={`${m.displayName}${m.role === 'HOST' ? ' (DJ)' : ''}`}
                      className="w-8 h-8 rounded-full bg-success-soft border border-success/30 text-success flex items-center justify-center font-mono font-bold text-caption shrink-0 overflow-hidden"
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
                  onClick={closePlayer}
                  className="flex-1 min-h-10 inline-flex items-center justify-center rounded-lg border border-border bg-background hover:bg-card font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold transition-colors"
                >
                  Jam Page &rarr;
                </Link>
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="min-h-10 px-4 rounded-lg border border-destructive/30 bg-destructive-soft hover:bg-destructive/20 text-destructive font-eyebrow text-eyebrow uppercase tracking-wider font-semibold transition-colors cursor-pointer"
                >
                  Leave
                </button>
              </div>
            </div>
          )}

          {/* ABOUT THE ARTIST */}
          {artistDetails && (
            <div
              className={`${CONTENT} rounded-xl overflow-hidden bg-card border border-border p-4 space-y-3 shadow-md`}
            >
              <div className="flex items-center justify-between">
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground font-semibold">
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
                      closePlayer,
                    )
                  }
                  className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline cursor-pointer py-1"
                >
                  Profile &rarr;
                </button>
              </div>

              <div className="w-full aspect-video rounded-lg bg-muted overflow-hidden relative border border-border/40">
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
                  <div className="w-full h-full flex items-center justify-center font-serif italic text-3xl text-muted-foreground/40">
                    {artistDetails.stageName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-title text-foreground truncate">
                      {artistDetails.stageName}
                    </h3>
                    {artistDetails.verified && (
                      <VerifiedBadgeSVG className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </div>
                  {artistDetails.monthlyListeners !== undefined && (
                    <p className="font-mono text-eyebrow text-muted-foreground mt-0.5">
                      {artistDetails.monthlyListeners.toLocaleString()} monthly
                      listeners
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleToggleFollow}
                  disabled={isFollowLoading}
                  className={`min-h-9 font-eyebrow text-eyebrow uppercase tracking-wider px-4 rounded-full border transition-all cursor-pointer font-semibold shrink-0 ${
                    isFollowing
                      ? 'border-border bg-background text-foreground hover:border-destructive hover:text-destructive'
                      : 'border-foreground bg-foreground text-background hover:opacity-90'
                  }`}
                >
                  {isFollowLoading
                    ? '...'
                    : isFollowing
                      ? 'Following'
                      : 'Follow'}
                </button>
              </div>

              {artistDetails.bio && (
                <p className="text-caption text-muted-foreground leading-relaxed line-clamp-3">
                  {artistDetails.bio}
                </p>
              )}
            </div>
          )}

          {/* COLLABORATORS */}
          {parsedCredits.collaborators.length > 0 && (
            <div
              className={`${CONTENT} rounded-xl overflow-hidden bg-card border border-border p-4 space-y-3 shadow-md`}
            >
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground font-semibold block">
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
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted border border-border/60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            navigateToArtist(collab, navigate, closePlayer)
                          }
                          className="w-10 h-10 rounded-full bg-primary/10 text-primary font-mono font-bold text-caption flex items-center justify-center shrink-0 border border-primary/20 active:scale-95 transition-transform cursor-pointer"
                        >
                          {collab.name.slice(0, 2).toUpperCase()}
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                navigateToArtist(collab, navigate, closePlayer)
                              }
                              className="font-bold text-caption text-foreground truncate hover:underline cursor-pointer text-left"
                            >
                              {collab.name}
                            </button>
                            {collab.verified && (
                              <VerifiedBadgeSVG className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                          </div>
                          <span className="font-eyebrow text-eyebrow text-muted-foreground block uppercase tracking-wider truncate">
                            {collab.role}
                          </span>
                        </div>
                      </div>

                      {collab.id && (
                        <button
                          type="button"
                          onClick={() => handleToggleArtistFollow(collab.id!)}
                          className={`min-h-9 font-eyebrow text-eyebrow uppercase tracking-wider px-3.5 rounded-full border transition-all cursor-pointer font-semibold shrink-0 ${
                            isCollabFollowing
                              ? 'border-border bg-background text-foreground hover:text-destructive hover:border-destructive'
                              : 'border-foreground bg-foreground text-background hover:opacity-90'
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

          {/* NEXT IN QUEUE */}
          {nextTrack && (
            <div
              className={`${CONTENT} rounded-xl bg-card border border-border p-4 space-y-2.5 shadow-sm`}
            >
              <div className="flex items-center justify-between">
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground font-semibold">
                  Next In Queue
                </span>
                <button
                  type="button"
                  onClick={toggleQueueDrawer}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline cursor-pointer py-1"
                >
                  Open Queue
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-md bg-muted border border-border/60 overflow-hidden shrink-0">
                  {nextTrack.coverImageUrl ? (
                    <img
                      src={nextTrack.coverImageUrl}
                      alt={nextTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-serif italic text-body text-muted-foreground">
                      ♪
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-body text-foreground truncate">
                    {nextTrack.title}
                  </div>
                  <div className="text-caption text-muted-foreground truncate">
                    {nextTrack.artistName}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CREDITS & SPECS */}
          <div
            className={`${CONTENT} rounded-xl bg-card border border-border p-4 space-y-1 text-caption shadow-sm`}
          >
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground font-semibold block mb-2">
              Song Credits &amp; Specs
            </span>

            <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40">
              <span className="text-muted-foreground shrink-0">
                Primary Artist
              </span>
              <button
                type="button"
                onClick={() =>
                  navigateToArtist(parsedCredits.primary, navigate, closePlayer)
                }
                className="font-medium text-foreground hover:text-primary hover:underline cursor-pointer text-right min-w-0 wrap-break-word"
              >
                {parsedCredits.primary.name}
              </button>
            </div>

            {parsedCredits.collaborators.length > 0 && (
              <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40">
                <span className="text-muted-foreground shrink-0">Featured</span>
                <span className="font-medium text-foreground text-right min-w-0 wrap-break-word">
                  {parsedCredits.collaborators.map((c, idx) => (
                    <span key={c.name + idx}>
                      <button
                        type="button"
                        onClick={() =>
                          navigateToArtist(c, navigate, closePlayer)
                        }
                        className="hover:text-primary hover:underline cursor-pointer"
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
              <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40">
                <span className="text-muted-foreground shrink-0">
                  Production
                </span>
                <span className="font-medium text-foreground text-right min-w-0 wrap-break-word">
                  {parsedCredits.producers.map((p) => p.name).join(', ')}
                </span>
              </div>
            )}

            {parsedCredits.writers.length > 0 && (
              <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40">
                <span className="text-muted-foreground shrink-0">Writing</span>
                <span className="font-medium text-foreground text-right min-w-0 wrap-break-word">
                  {parsedCredits.writers.map((w) => w.name).join(', ')}
                </span>
              </div>
            )}

            {currentTrack.albumTitle && (
              <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40">
                <span className="text-muted-foreground shrink-0">Release</span>
                <span className="font-medium text-foreground text-right min-w-0 wrap-break-word">
                  {currentTrack.albumTitle}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-muted-foreground shrink-0">
                Audio Engine
              </span>
              <span className="font-eyebrow text-eyebrow text-primary font-bold uppercase tracking-wider text-right">
                {currentTrack.hlsManifestUrl
                  ? 'Hi-Res HLS Stream'
                  : 'Lossless FLAC Master'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
