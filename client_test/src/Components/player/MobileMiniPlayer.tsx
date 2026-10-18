import { useState, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { useConnectStore } from '../../stores/connect.store'
import { useLikesStore } from '../../stores/likes.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { HeartIconSVG, PlayIconSVG, PauseIconSVG } from '../icons'
import { ProceduralCover } from '../common/ProceduralCover'
import { MonitorSpeaker } from 'lucide-react'

export function MobileMiniPlayer() {
  const { pathname } = useLocation()

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const setNowPlayingExpanded = usePlayerStore((s) => s.setNowPlayingExpanded)
  const setDevicesOpen = usePlayerStore((s) => s.setDevicesOpen)

  // Groovy Connect: is another device the Speaker?
  const connectSessionView = useConnectStore((s) => s.sessionView)
  const youAreSpeaker = useConnectStore((s) => s.youAreSpeaker)

  // Likes
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const { isAuthenticated } = useAuthStore()
  const { openAuthModal } = useAuthModalStore()

  // Touch & Swipe state
  const [dragX, setDragX] = useState(0)
  const touchDataRef = useRef<{
    startX: number
    startY: number
    startTime: number
    isHorizontal: boolean
  } | null>(null)

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/signup' ||
    pathname === '/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  if (isAuthPage || !currentTrack) return null

  const isPlaying = playbackStatus === 'playing'
  const isLoading = playbackStatus === 'loading'
  const isLiked = likedSongIds.has(currentTrack.id)
  const otherSpeaker =
    !youAreSpeaker && connectSessionView?.session.speaker
      ? connectSessionView.session.speaker
      : null
  const progressPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10)
    }
    await toggleSongLike(currentTrack.id)
  }

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10)
    }
    togglePlay()
  }

  // A synthesized `click` follows `touchend` almost immediately. When a gesture
  // here expands the full-screen player or skips a track, that click would
  // hit-test onto the freshly-mounted overlay — whose centered play/pause
  // button sits right where the mini player's center was — and fire a second,
  // unintended action. Cancelling the touch suppresses the browser's
  // compatibility mouse events (including that click).
  const suppressGhostClick = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) {
      touchDataRef.current = null
      return
    }
    if (e.touches.length !== 1) return
    touchDataRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      isHorizontal: false,
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDataRef.current || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - touchDataRef.current.startX
    const dy = e.touches[0].clientY - touchDataRef.current.startY

    if (!touchDataRef.current.isHorizontal) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        touchDataRef.current.isHorizontal = true
      }
    }

    if (touchDataRef.current.isHorizontal) {
      // Apply rubber-band drag tracking
      setDragX(dx * 0.7)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) {
      touchDataRef.current = null
      setDragX(0)
      return
    }
    if (!touchDataRef.current || e.changedTouches.length !== 1) {
      setDragX(0)
      return
    }

    const deltaY = e.changedTouches[0].clientY - touchDataRef.current.startY
    const deltaX = e.changedTouches[0].clientX - touchDataRef.current.startX
    const elapsed = Date.now() - touchDataRef.current.startTime
    const isHorizontal = touchDataRef.current.isHorizontal

    touchDataRef.current = null
    setDragX(0)

    // Vertical swipe-up: expands the full-screen player
    if (deltaY < -35 && Math.abs(deltaY) > Math.abs(deltaX)) {
      suppressGhostClick(e)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10)
      }
      setNowPlayingExpanded(true)
      return
    }

    // Horizontal swipe-left: Skip to Next track
    if (deltaX < -50 && isHorizontal) {
      suppressGhostClick(e)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12)
      }
      next()
      return
    }

    // Horizontal swipe-right: Skip to Previous track
    if (deltaX > 50 && isHorizontal) {
      suppressGhostClick(e)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12)
      }
      previous()
      return
    }

    // Gentle tap outside buttons: expands the full-screen player
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && elapsed < 400) {
      suppressGhostClick(e)
      setNowPlayingExpanded(true)
    }
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    setNowPlayingExpanded(true)
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleContainerClick}
      aria-label="Now Playing Mini Player. Tap to expand, swipe left or right to skip."
      style={{
        transform: `translateX(${dragX}px)`,
        transition:
          dragX === 0 ? 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)' : 'none',
      }}
      className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-2 right-2 z-40 md:hidden h-14 bg-card/95 dark:bg-[#282828]/95 backdrop-blur-xl border border-border/60 dark:border-white/10 rounded-lg shadow-lg dark:shadow-2xl shadow-black/10 dark:shadow-black/50 flex items-center justify-between px-2.5 overflow-hidden cursor-pointer select-none active:scale-[0.99] transition-transform duration-100"
    >
      {/* 2px Hairline Progress Bar along the bottom of the card */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/20 dark:bg-white/10 overflow-hidden rounded-b-lg pointer-events-none">
        <div
          className="h-full bg-foreground dark:bg-[#1ed760] transition-[width] duration-150 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {/* Left: Thumbnail & Song Info */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
        <div className="w-10 h-10 rounded-md bg-muted border border-border/40 dark:border-white/10 shrink-0 overflow-hidden shadow-xs flex items-center justify-center">
          {currentTrack.coverImageUrl ? (
            <img
              src={currentTrack.coverImageUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <ProceduralCover
              title={currentTrack.title}
              artistName={currentTrack.artistName}
              className="w-full h-full"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-semibold text-caption sm:text-body text-foreground dark:text-white truncate leading-tight">
            {currentTrack.title}
          </div>
          <div className="text-caption text-muted-foreground truncate mt-0.5 leading-tight">
            {currentTrack.artistName}
          </div>
        </div>
      </div>
      {/* Right: Like & Play/Pause Buttons */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Devices indicator — another device is the Speaker (rule R6) */}
        {otherSpeaker && (
          <button
            type="button"
            onClick={() => setDevicesOpen(true)}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            aria-label={`Playing on ${otherSpeaker.deviceName}. Open devices.`}
            title={`Playing on ${otherSpeaker.deviceName}`}
            className="w-9 h-9 flex items-center justify-center text-success active:scale-90 transition-transform cursor-pointer"
          >
            <MonitorSpeaker className="w-5 h-5" strokeWidth={2} />
          </button>
        )}

        {/* Heart (Like) Button */}
        <button
          type="button"
          onClick={handleToggleLike}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          aria-label={isLiked ? 'Unlike song' : 'Like song'}
          className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-80 transition-all cursor-pointer"
        >
          <HeartIconSVG
            filled={isLiked}
            className={`w-5 h-5 transition-transform ${
              isLiked
                ? 'text-[#1ed760] fill-[#1ed760]'
                : 'text-muted-foreground hover:text-foreground dark:hover:text-white'
            }`}
          />
        </button>

        {/* Frameless Spotify-style Play/Pause Button */}
        <button
          type="button"
          onClick={handlePlayToggle}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-11 h-11 flex items-center justify-center text-foreground dark:text-white active:scale-85 transition-transform cursor-pointer"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-foreground dark:border-white border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <PauseIconSVG className="w-5 h-5 text-foreground dark:text-white fill-current" />
          ) : (
            <PlayIconSVG className="w-5 h-5 text-foreground dark:text-white fill-current ml-0.5" />
          )}
        </button>
      </div>
    </div>
  )
}
