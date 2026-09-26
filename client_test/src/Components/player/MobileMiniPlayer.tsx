import { useRef } from 'react'
import { usePlayerStore } from '../../stores/player.store'
import { useLikesStore } from '../../stores/likes.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { HeartIconSVG, PlayIconSVG, PauseIconSVG } from '../icons'

export function MobileMiniPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const setNowPlayingExpanded = usePlayerStore((s) => s.setNowPlayingExpanded)

  // Likes
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const { isAuthenticated } = useAuthStore()
  const { openAuthModal } = useAuthModalStore()

  const touchDataRef = useRef<{
    startX: number
    startY: number
    startTime: number
  } | null>(null)

  if (!currentTrack) return null

  const isPlaying = playbackStatus === 'playing'
  const isLoading = playbackStatus === 'loading'
  const isLiked = likedSongIds.has(currentTrack.id)
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
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button')) {
      touchDataRef.current = null
      return
    }
    if (!touchDataRef.current || e.changedTouches.length !== 1) return
    const deltaY = e.changedTouches[0].clientY - touchDataRef.current.startY
    const deltaX = e.changedTouches[0].clientX - touchDataRef.current.startX
    const elapsed = Date.now() - touchDataRef.current.startTime

    touchDataRef.current = null

    // Swipe-up gesture OR tap expands the full-screen player
    if (deltaY < -35 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12)
      }
      setNowPlayingExpanded(true)
      return
    }

    // Gentle tap on the card (outside action buttons)
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && elapsed < 400) {
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
      onTouchEnd={handleTouchEnd}
      onClick={handleContainerClick}
      aria-label="Now Playing Mini Player. Tap to expand."
      className="fixed bottom-14 left-0.5 right-0.5 z-40 md:hidden h-15 pb-0.5 bg-panel/95 backdrop-blur-xl border-t border-line rounded shadow-2xl flex items-center justify-between px-2.5 overflow-hidden cursor-pointer select-none active:scale-[0.99] transition-transform duration-100"
    >
      {/* 2px Hairline Progress Bar along the bottom of the card */}
      <div className="absolute bottom-0 left-0 right-0 h-0.75 bg-line/40 overflow-clip rounded-b">
        <div
          className="h-full bg-blue transition-[width] duration-150 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Left: Thumbnail & Song Info */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
        <div className="w-10 h-10 rounded-lg bg-canvas-deep border border-line/60 shrink-0 overflow-hidden shadow-xs flex items-center justify-center">
          {currentTrack.coverImageUrl ? (
            <img
              src={currentTrack.coverImageUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="font-serif italic text-sm text-ink-soft">♪</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-semibold text-xs text-ink truncate leading-tight">
            {currentTrack.title}
          </div>
          <div className="text-[11px] text-ink-soft truncate mt-0.5 leading-tight">
            {currentTrack.artistName}
          </div>
        </div>
      </div>

      {/* Right: Like & Play/Pause Buttons */}
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleToggleLike}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          aria-label={isLiked ? 'Unlike song' : 'Like song'}
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:text-ink active:scale-90 transition-all cursor-pointer"
        >
          <HeartIconSVG
            filled={isLiked}
            className={`w-4 h-4 ${isLiked ? 'text-red-500 dark:text-red-400' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={handlePlayToggle}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-9 h-9 rounded-full bg-ink text-canvas flex items-center justify-center shadow-md active:scale-90 transition-transform cursor-pointer"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-canvas border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <PauseIconSVG className="w-4 h-4 text-canvas" />
          ) : (
            <PlayIconSVG className="w-4 h-4 text-canvas ml-0.5" />
          )}
        </button>
      </div>
    </div>
  )
}
