import { useState, useRef, useEffect, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { useLikesStore } from '../../stores/likes.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useAddToPlaylistModalStore } from '../../stores/add-to-playlist-modal.store'
import { formatDuration } from '../../lib/catalog.api'
import { ProceduralCover } from './ProceduralCover'
import { MarqueeText } from './MarqueeText'
import {
  SongActionMenu,
  type SongActionCustomItem,
} from '../player/SongActionMenu'
import {
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  LockIconSVG,
  PlusIconSVG,
} from '../icons'
import type { PlayerTrack } from '../../types/player'

export interface SongRowArtistCredit {
  artistId: string
  stageName: string
  slug?: string
  role?: string
}

export interface SongRowProducerCredit {
  artistId: string
  stageName: string
  slug?: string
  role?: string
}

export type SongRowVariant =
  'standard' | 'album' | 'playlist' | 'artist' | 'search'

export type SongRowSurface = 'card' | 'transparent'
export type SongRowDensity = 'comfortable' | 'compact'

// Queue tray geometry. The label starts just outside the row's trailing edge
// and slides in with the row. Once it fits with the tray's right padding, it
// stays anchored there instead of drifting with the row.
// QUEUE_TRAY_PADDING must match the tray's pr-4.
const QUEUE_TRAY_PADDING = 16
const QUEUE_LABEL_EDGE_GAP = 6
const QUEUE_SWIPE_THRESHOLD = 76

export interface SongRowProps {
  track: PlayerTrack
  index?: number
  trackNumberDisplay?: number | string
  variant?: SongRowVariant
  /** Row surface. Use `transparent` to blend into a page-level tracklist. */
  surface?: SongRowSurface
  /** `compact` tightens the row and reduces mobile horizontal padding. */
  density?: SongRowDensity
  /** Set false to remove the artwork thumbnail outline. */
  showThumbnailBorder?: boolean

  // Contextual metadata
  playsCount?: number
  addedByDisplayName?: string | null
  scheduledReleaseAt?: string | null
  primaryCredits?: SongRowArtistCredit[]
  featuredCredits?: SongRowArtistCredit[]
  producerCredits?: SongRowProducerCredit[]
  albumTitleOverride?: string | null
  albumSlugOverride?: string | null

  // Fluid pointer reordering (Playlist variant)
  isDraggable?: boolean
  isDragging?: boolean
  style?: React.CSSProperties
  onGripPointerDown?: (e: React.PointerEvent<HTMLSpanElement>) => void
  onDragStart?: (index: number) => void
  onDragOver?: (index: number) => void
  onDragEnd?: () => void
  onDrop?: (fromIndex: number, toIndex: number) => void
  isDragOver?: boolean

  // Playback callback (for album / playlist queue context)
  onPlay?: () => void

  // Touch Swipe overrides
  disableSwipeLeft?: boolean
  disableSwipeRight?: boolean

  // Contextual actions
  hideGoToArtist?: boolean
  hideGoToAlbum?: boolean
  hideAddToPlaylist?: boolean
  isPersonal?: boolean
  onRemoveFromPlaylist?: (track: PlayerTrack) => void
  customActions?: SongActionCustomItem[]

  className?: string
}

export const SongRow = memo(function SongRow({
  track,
  index = 0,
  trackNumberDisplay,
  variant = 'standard',
  surface = 'card',
  density = 'comfortable',
  showThumbnailBorder = true,

  playsCount,
  addedByDisplayName,
  scheduledReleaseAt,
  primaryCredits = [],
  featuredCredits = [],
  producerCredits = [],
  albumTitleOverride,
  albumSlugOverride,

  isDraggable = false,
  isDragging = false,
  style,
  onGripPointerDown,

  onPlay,

  disableSwipeLeft = false,
  disableSwipeRight = false,

  hideGoToArtist = false,
  hideGoToAlbum = false,
  hideAddToPlaylist = false,
  isPersonal,
  onRemoveFromPlaylist,
  customActions,

  className = '',
}: SongRowProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const addToQueue = usePlayerStore((s) => s.addToQueue)

  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const { isAuthenticated } = useAuthStore()

  const isCurrentLoaded = currentTrack?.id === track.id
  const isCurrentPlaying =
    isCurrentLoaded &&
    (playbackStatus === 'playing' || playbackStatus === 'loading')
  const isLiked = likedSongIds.has(track.id)
  const isScheduled = Boolean(
    scheduledReleaseAt && new Date(scheduledReleaseAt).getTime() > Date.now(),
  )

  const isLocked = Boolean(track.isStreamable === false || isScheduled)

  // In playlist variant, user explicitly instructed:
  // "in playlist have only left swipe to add to queue"
  const canSwipeRight = !disableSwipeRight && variant !== 'playlist'
  const canSwipeLeft = !disableSwipeLeft

  // Touch swipe gesture state (touch devices only)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [showQueuedBadge, setShowQueuedBadge] = useState(false)
  const [isQueuedBadgeFading, setIsQueuedBadgeFading] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const moveSwipeRef = useRef<
    (x: number, y: number, preventDefault: () => void) => void
  >(() => {})
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchDirectionRef = useRef<'horizontal' | 'vertical' | null>(null)
  const swipeOffsetRef = useRef(0)
  const didSwipeRef = useRef(false)
  const swipeClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queuedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (swipeClickTimerRef.current) clearTimeout(swipeClickTimerRef.current)
      if (queuedTimerRef.current) clearTimeout(queuedTimerRef.current)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  const startSwipe = (clientX: number, clientY: number) => {
    if (swipeClickTimerRef.current) {
      clearTimeout(swipeClickTimerRef.current)
      swipeClickTimerRef.current = null
    }
    touchStartRef.current = { x: clientX, y: clientY }
    touchDirectionRef.current = null
    swipeOffsetRef.current = 0
    didSwipeRef.current = false
    setSwipeOffset(0)
    setIsSwiping(false)
  }

  const moveSwipe = (
    clientX: number,
    clientY: number,
    cancelEvent?: () => void,
  ) => {
    if (!touchStartRef.current) return

    const deltaX = clientX - touchStartRef.current.x
    const deltaY = clientY - touchStartRef.current.y
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (!touchDirectionRef.current) {
      // Bias toward horizontal early. Waiting for 8px lets the browser start a
      // vertical pan first, which cannot reliably be cancelled afterwards.
      if (absX > 4 && absX >= absY * 0.8) {
        touchDirectionRef.current = 'horizontal'
        didSwipeRef.current = true
        setIsSwiping(true)
      } else if (absY > 8 && absY > absX) {
        touchDirectionRef.current = 'vertical'
        return
      }
    }

    if (touchDirectionRef.current === 'horizontal') {
      cancelEvent?.()

      // Disallow right swipe if disabled or in playlist
      if (deltaX > 0 && !canSwipeRight) {
        swipeOffsetRef.current = 0
        setSwipeOffset(0)
        return
      }
      if (deltaX < 0 && !canSwipeLeft) {
        swipeOffsetRef.current = 0
        setSwipeOffset(0)
        return
      }

      // Elastic resistance damping
      const maxDrag = 110
      const damped =
        Math.sign(deltaX) * Math.min(Math.abs(deltaX) * 0.75, maxDrag)
      swipeOffsetRef.current = damped
      setSwipeOffset(damped)
    }
  }

  // React attaches touchmove passively, so it cannot stop the page from
  // scrolling. A native non-passive listener lets us prevent vertical scroll
  // as soon as the gesture locks horizontal, while leaving normal scrolling
  // and vertical gestures untouched.
  useEffect(() => {
    moveSwipeRef.current = moveSwipe
  })

  useEffect(() => {
    const element = rowRef.current
    if (!element) return

    const handleNativeTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      if ((event.target as HTMLElement | null)?.closest('[data-drag-handle]')) {
        return
      }
      moveSwipeRef.current(
        event.touches[0].clientX,
        event.touches[0].clientY,
        () => event.preventDefault(),
      )
    }

    element.addEventListener('touchmove', handleNativeTouchMove, {
      passive: false,
      capture: true,
    })
    return () =>
      element.removeEventListener('touchmove', handleNativeTouchMove, {
        capture: true,
      })
  }, [])

  const endSwipe = () => {
    const wasHorizontal = touchDirectionRef.current === 'horizontal'
    const offset = swipeOffsetRef.current

    if (wasHorizontal) {
      // Swipe left threshold: Add to Queue. The extra distance lets the full
      // label settle at the tray's right padding before the action fires.
      if (offset <= -QUEUE_SWIPE_THRESHOLD && canSwipeLeft) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15)
        }
        addToQueue(track)
        if (queuedTimerRef.current) clearTimeout(queuedTimerRef.current)
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)

        setShowQueuedBadge(true)
        setIsQueuedBadgeFading(false)

        // Show briefly (450ms) then fade out quickly over 200ms
        queuedTimerRef.current = setTimeout(() => {
          setIsQueuedBadgeFading(true)
          fadeTimerRef.current = setTimeout(() => {
            setShowQueuedBadge(false)
            setIsQueuedBadgeFading(false)
          }, 200)
        }, 450)
      }
      // Swipe right threshold: Add to Playlist
      else if (offset > 60 && canSwipeRight) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15)
        }
        useAddToPlaylistModalStore.getState().openModal(track)
      }

      // Suppress the click browsers synthesize after a touch gesture.
      if (swipeClickTimerRef.current) clearTimeout(swipeClickTimerRef.current)
      swipeClickTimerRef.current = setTimeout(() => {
        didSwipeRef.current = false
      }, 250)
    }

    touchStartRef.current = null
    touchDirectionRef.current = null
    swipeOffsetRef.current = 0
    setSwipeOffset(0)
    setIsSwiping(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    startSwipe(e.touches[0].clientX, e.touches[0].clientY)
  }

  const handleTouchEnd = () => {
    endSwipe()
  }

  const handleRowClick = (e: React.MouseEvent) => {
    // If was swiping horizontally, suppress click to play
    if (didSwipeRef.current) return

    // If clicking an interactive child element (button, link, input), let it handle its own event
    const target = e.target as HTMLElement
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('[role="menu"]')
    ) {
      return
    }

    if (isLocked) return

    if (onPlay) {
      onPlay()
    } else {
      if (isCurrentPlaying) {
        togglePlay()
      } else if (isCurrentLoaded) {
        togglePlay()
      } else {
        playTrack(track)
      }
    }
  }

  const handlePlayButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLocked) return
    if (onPlay) {
      onPlay()
    } else {
      if (isCurrentPlaying || isCurrentLoaded) {
        togglePlay()
      } else {
        playTrack(track)
      }
    }
  }

  const handleToggleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Favorites & Library',
        subtitle: 'Library',
        title: 'Save to your library.',
        description:
          'Sign in or create an account to like tracks and build your personal collection.',
      })
      return
    }
    await toggleSongLike(track.id)
  }

  const albumTitle = albumTitleOverride || track.albumTitle
  const albumSlug = albumSlugOverride || track.albumSlug || track.albumId

  const showThumbnail =
    variant === 'standard' ||
    variant === 'playlist' ||
    variant === 'search' ||
    (variant === 'artist' && true)

  const isTransparent = surface === 'transparent'
  const isCompact = density === 'compact'
  const rowSurface = isTransparent ? 'bg-transparent' : 'bg-card'
  const rowHover = isTransparent ? 'sm:hover:bg-card/70' : 'sm:hover:bg-muted'
  const rowPadding = isCompact
    ? 'px-2.5 py-2.5 sm:px-3 sm:py-2.5'
    : 'px-3.5 sm:px-4 py-3 sm:py-3'
  const contentGap = isCompact ? 'gap-2.5 sm:gap-2.5' : 'gap-2.5 sm:gap-3.5'
  const thumbnailSize = isCompact
    ? 'w-11 h-11 sm:w-10 sm:h-10'
    : 'w-12 h-12 sm:w-11 sm:h-11'
  const thumbnailBorder = showThumbnailBorder ? 'border border-border' : ''

  // Mirror the library swipe: the action tray fades and scales with the drag.
  const swipeMagnitude = Math.abs(swipeOffset)
  const swipeOpacity = Math.min(swipeMagnitude / 30, 1)
  const swipeScale = Math.min(0.85 + (swipeMagnitude / 60) * 0.25, 1.15)
  const leftActionOpacity = swipeOffset < 0 ? swipeOpacity : 0
  const rightActionOpacity = swipeOffset > 0 ? swipeOpacity : 0

  // Keep the queue label at or below 1x so the trailing-edge reveal can
  // finish before the action threshold.
  const queueLabelScale = Math.min(0.85 + (swipeMagnitude / 60) * 0.15, 1)
  // The queue label trails the foreground edge until it can fit at the tray's
  // right padding, then stays put. This keeps the start of the label visible
  // as it enters instead of showing a clipped text tail. The 100% in the
  // transform is the label's own width, so no measurement is needed.
  const queueLabelTransform = `translateX(max(0px, calc(100% + ${
    QUEUE_TRAY_PADDING + QUEUE_LABEL_EDGE_GAP
  }px - ${swipeMagnitude}px))) scale(${queueLabelScale})`

  return (
    <div
      ref={rowRef}
      style={style}
      data-playlist-row-index={index}
      data-track-index={index}
      className={`relative select-none ${
        isDragging ? 'z-40 opacity-95 scale-[1.01]' : ''
      } ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className={`relative overflow-hidden rounded-inset ${
          isDragging ? 'shadow-floating ring-2 ring-primary/60 bg-card' : ''
        }`}
      >
        {/* Queued Feedback Banner */}
        {showQueuedBadge && (
          <div
            className={`absolute inset-0 z-30 bg-primary/95 flex items-center justify-center gap-2 text-primary-foreground font-eyebrow text-caption uppercase tracking-wider pointer-events-none transition-opacity duration-100 ease-out ${
              isQueuedBadgeFading
                ? 'opacity-0'
                : 'opacity-100 animate-in fade-in duration-75'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="w-4 h-4 shrink-0"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="font-bold">Added to Queue</span>
          </div>
        )}
        {/* ==================== SWIPE ACTION TRAYS ==================== */}
        {/* Swipe Left: Queue (tray on the right) */}
        {canSwipeLeft && (
          <div
            className="absolute inset-0 flex items-center justify-end pr-4 bg-primary/15 pointer-events-none"
            style={{ opacity: leftActionOpacity }}
          >
            <div
              className="flex items-center gap-1 font-semibold text-caption text-primary"
              style={{
                transform: queueLabelTransform,
                transformOrigin: 'right center',
              }}
            >
              <span>Queue</span>
              <PlusIconSVG className="w-3 h-3 shrink-0" />
            </div>
          </div>
        )}

        {/* Swipe Right: Add to Playlist (tray on the left) */}
        {canSwipeRight && (
          <div
            className="absolute inset-0 flex items-center justify-start pl-4 bg-success-soft pointer-events-none"
            style={{ opacity: rightActionOpacity }}
          >
            <div
              className="flex items-center gap-2 font-semibold text-caption text-success transition-transform"
              style={{ transform: `scale(${swipeScale})` }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="w-4 h-4 shrink-0"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <span>+ Playlist</span>
            </div>
          </div>
        )}

        {/* ==================== FOREGROUND ROW CONTAINER ==================== */}
        <div
          data-track-index={index}
          onClick={handleRowClick}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwiping
              ? 'none'
              : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
          }}
          className={`relative z-10 ${rowPadding} flex items-center justify-between gap-3 ${rowSurface} ${rowHover} transition-all duration-100 ease-out active:scale-[0.995] motion-reduce:active:scale-100 group cursor-pointer rounded-inset ${
            isDragging ? 'bg-card' : ''
          }`}
        >
          {/* ==================== LEFT SECTION ==================== */}
          <div
            className={`flex items-center ${contentGap} min-w-0 flex-1 ${
              isLocked ? 'opacity-65' : ''
            }`}
          >
            {/* Drag Grip Handle (Playlist variant only) */}
            {variant === 'playlist' && isDraggable && (
              <span
                data-drag-handle="true"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onGripPointerDown?.(e)
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
                className={`cursor-grab active:cursor-grabbing select-none font-mono text-caption px-1.5 py-1 transition-colors shrink-0 touch-none rounded-control ${
                  isDragging
                    ? 'text-primary bg-primary/15 scale-110 shadow-raised'
                    : 'text-muted-foreground/50 hover:text-foreground hover:bg-background active:text-primary active:bg-primary/10'
                }`}
                title="Drag to reorder tracks"
              >
                ⋮⋮
              </span>
            )}

            {/* Leading Display: Thumbnail vs Track Number */}
            {showThumbnail ? (
              <div
                className={`relative ${thumbnailSize} bg-muted ${thumbnailBorder} rounded-control overflow-hidden shrink-0 group/thumb`}
              >
                {track.coverImageUrl ? (
                  <img
                    src={track.coverImageUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none select-none"
                  />
                ) : (
                  <ProceduralCover
                    size="sm"
                    title={track.title}
                    artistName={track.artistName}
                    className="w-full h-full text-eyebrow"
                  />
                )}

                {/* Play / Pause Overlay on Hover or when Current */}
                <button
                  type="button"
                  onClick={handlePlayButtonClick}
                  aria-label={isCurrentPlaying ? 'Pause' : 'Play'}
                  className={`absolute inset-0 bg-foreground/45 flex items-center justify-center transition-all duration-150 cursor-pointer ${
                    isCurrentPlaying
                      ? 'opacity-100'
                      : 'opacity-0 scale-75 group-hover:scale-100 group-hover:opacity-100 group-hover/thumb:opacity-100'
                  }`}
                >
                  {isLocked ? (
                    <LockIconSVG className="w-3.5 h-3.5 text-primary-foreground" />
                  ) : isCurrentPlaying ? (
                    <>
                      <div className="flex items-end justify-center gap-0.5 h-3.5 w-3.5 group-hover/thumb:hidden group-hover:hidden">
                        <span className="w-0.5 h-full bg-primary-foreground rounded-full animate-eq-1" />
                        <span className="w-0.5 h-full bg-primary-foreground rounded-full animate-eq-2" />
                        <span className="w-0.5 h-full bg-primary-foreground rounded-full animate-eq-3" />
                      </div>
                      <PauseIconSVG className="w-4 h-4 text-primary-foreground hidden group-hover/thumb:block group-hover:block" />
                    </>
                  ) : (
                    <PlayIconSVG className="w-4 h-4 text-primary-foreground ml-0.5 transition-transform duration-150 group-hover:scale-110" />
                  )}
                </button>
              </div>
            ) : (
              /* Track Number / Play button for Album & Non-thumbnail Views */
              <button
                type="button"
                onClick={handlePlayButtonClick}
                aria-label={isCurrentPlaying ? 'Pause' : 'Play'}
                className={`relative w-9 h-9 flex items-center justify-center shrink-0 ${
                  isLocked
                    ? 'text-muted-foreground/50 cursor-not-allowed'
                    : 'text-muted-foreground group-hover:text-foreground cursor-pointer'
                }`}
              >
                {isLocked ? (
                  <LockIconSVG className="w-3.5 h-3.5 text-muted-foreground/60" />
                ) : isCurrentPlaying ? (
                  <>
                    <div className="flex items-end justify-center gap-0.5 h-3.5 w-3.5 group-hover:hidden">
                      <span className="w-0.5 h-full bg-primary rounded-full animate-eq-1" />
                      <span className="w-0.5 h-full bg-primary rounded-full animate-eq-2" />
                      <span className="w-0.5 h-full bg-primary rounded-full animate-eq-3" />
                    </div>
                    <PauseIconSVG className="w-3.5 h-3.5 text-primary hidden group-hover:block transition-transform duration-150 group-hover:scale-110" />
                  </>
                ) : (
                  <>
                    <span
                      className={`font-mono text-eyebrow transition-all duration-150 ${
                        isCurrentLoaded ? 'text-primary font-bold' : ''
                      } group-hover:scale-75 group-hover:opacity-0`}
                    >
                      {String(trackNumberDisplay ?? index + 1).padStart(2, '0')}
                    </span>
                    <PlayIconSVG className="w-3.5 h-3.5 absolute text-foreground ml-0.5 transition-all duration-150 scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100" />
                  </>
                )}
              </button>
            )}

            {/* Title & Credits Metadata */}
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
              {/* Title Line */}
              <div className="flex items-center gap-1.5 min-w-0">
                <MarqueeText
                  className="min-w-0"
                  innerClassName={`font-sans text-body font-semibold ${
                    isCurrentPlaying
                      ? 'text-primary'
                      : isCurrentLoaded
                        ? 'text-primary'
                        : 'text-foreground'
                  }`}
                >
                  {track.title}
                </MarqueeText>

                {isLocked && (
                  <span
                    title="Locked track"
                    className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 border border-border text-muted-foreground bg-background shrink-0 flex items-center gap-1"
                  >
                    <LockIconSVG className="w-2.5 h-2.5" />
                    <span>
                      {scheduledReleaseAt
                        ? `Releases ${new Date(scheduledReleaseAt).toLocaleDateString()}`
                        : 'Locked'}
                    </span>
                  </span>
                )}

                {track.isExplicit && (
                  <span
                    title="Explicit Content"
                    className="font-eyebrow text-eyebrow font-semibold uppercase tracking-wider px-1.5 py-0.5 border border-border text-muted-foreground bg-background shrink-0 leading-none"
                  >
                    E
                  </span>
                )}

                {(isPersonal || track.scope === 'PERSONAL') && (
                  <span
                    title="Personal Collection (Vault)"
                    className="font-eyebrow text-eyebrow font-semibold uppercase tracking-wider px-1.5 py-0.5 border border-primary/30 text-primary bg-primary/10 shrink-0 rounded-control leading-none"
                  >
                    V
                  </span>
                )}
              </div>

              {/* Subtitle / Artist Credits Line */}
              {variant === 'album' ? (
                <MarqueeText
                  className="min-w-0 text-caption text-muted-foreground"
                  innerClassName="inline-flex items-center gap-1"
                >
                  {/* Primary Artist(s) */}
                  {primaryCredits.length > 0 ? (
                    primaryCredits.map((c, i) => (
                      <span key={c.artistId}>
                        {c.slug ? (
                          <Link
                            to="/artists/$idOrSlug"
                            params={{ idOrSlug: c.slug }}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground hover:underline decoration-border transition-colors"
                          >
                            {c.stageName}
                          </Link>
                        ) : (
                          <span>{c.stageName}</span>
                        )}
                        {i < primaryCredits.length - 1 ? ', ' : ''}
                      </span>
                    ))
                  ) : track.artistSlug ? (
                    <Link
                      to="/artists/$idOrSlug"
                      params={{ idOrSlug: track.artistSlug }}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-foreground hover:underline decoration-border transition-colors"
                    >
                      {track.artistName}
                    </Link>
                  ) : (
                    <span>{track.artistName || 'Unknown Artist'}</span>
                  )}

                  {/* Featured Credits */}
                  {featuredCredits.length > 0 && (
                    <>
                      <span className="text-muted-foreground/70 font-mono text-eyebrow ml-1">
                        feat.
                      </span>
                      {featuredCredits.map((c, i) => (
                        <span key={c.artistId}>
                          {c.slug ? (
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: c.slug }}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-foreground hover:underline decoration-border transition-colors"
                            >
                              {c.stageName}
                            </Link>
                          ) : (
                            <span>{c.stageName}</span>
                          )}
                          {i < featuredCredits.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </>
                  )}

                  {/* Producer Credits */}
                  {producerCredits.length > 0 && (
                    <>
                      <span className="text-muted-foreground/70 font-mono text-eyebrow ml-1">
                        prod.
                      </span>
                      {producerCredits.map((c, i) => (
                        <span key={c.artistId}>
                          {c.slug ? (
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: c.slug }}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-foreground hover:underline decoration-border transition-colors"
                            >
                              {c.stageName}
                            </Link>
                          ) : (
                            <span>{c.stageName}</span>
                          )}
                          {i < producerCredits.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </>
                  )}
                </MarqueeText>
              ) : (
                /* Standard / Playlist / Search / Artist Artist Subtitle */
                <div className="font-sans text-caption text-muted-foreground truncate flex items-center gap-1.5">
                  {track.artistSlug ? (
                    <Link
                      to="/artists/$idOrSlug"
                      params={{ idOrSlug: track.artistSlug }}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-foreground hover:underline decoration-border transition-colors truncate"
                    >
                      {track.artistName || 'Unknown Artist'}
                    </Link>
                  ) : (
                    <span className="truncate">
                      {track.artistName || 'Unknown Artist'}
                    </span>
                  )}

                  {albumTitle && (
                    <>
                      <span className="opacity-40">•</span>
                      {albumSlug ? (
                        <Link
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: albumSlug }}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-foreground hover:underline decoration-border transition-colors truncate hidden sm:inline"
                        >
                          {albumTitle}
                        </Link>
                      ) : (
                        <span className="truncate hidden sm:inline">
                          {albumTitle}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ==================== MIDDLE SECTION ==================== */}
          {/* Plays count (for Artist top tracks or Album stream count) */}
          {playsCount !== undefined && (
            <div className="hidden sm:block text-right font-mono text-caption text-muted-foreground shrink-0 w-24">
              {playsCount.toLocaleString()}
            </div>
          )}

          {/* Added by (for Collaborative Playlists) */}
          {addedByDisplayName && (
            <div className="hidden md:block text-right font-mono text-eyebrow text-muted-foreground/70 shrink-0 max-w-35 truncate">
              Added by {addedByDisplayName}
            </div>
          )}

          {/* ==================== RIGHT SECTION ==================== */}
          <div
            className={`flex items-center justify-end gap-1.5 sm:gap-3 shrink-0 ${
              isLocked ? 'opacity-65' : ''
            }`}
          >
            {/* Duration (Hidden on extra small mobile screens for compact density) */}
            <span className="hidden sm:inline-block font-mono text-eyebrow text-muted-foreground text-right w-11">
              {formatDuration(track.durationSeconds || 0)}
            </span>

            {/* Action Menu (3-dots button): desktop only */}
            <div
              className="hidden sm:block"
              onClick={(e) => e.stopPropagation()}
            >
              <SongActionMenu
                track={track}
                isLocked={isLocked}
                isScheduled={isScheduled}
                hideGoToArtist={hideGoToArtist}
                hideGoToAlbum={hideGoToAlbum}
                hideAddToPlaylist={hideAddToPlaylist}
                isPersonal={Boolean(
                  isPersonal || track.scope?.toUpperCase() === 'PERSONAL',
                )}
                hideShare={Boolean(
                  isPersonal || track.scope?.toUpperCase() === 'PERSONAL',
                )}
                onRemoveFromPlaylist={onRemoveFromPlaylist}
                customActions={customActions}
              />
            </div>

            {/* Like Heart Button (Only shown on live/released tracks, hidden for scheduled releases) */}
            {!isScheduled && (
              <button
                type="button"
                onClick={handleToggleLikeClick}
                aria-label={isLiked ? 'Unlike track' : 'Like track'}
                className="p-2 sm:p-1.5 cursor-pointer hover:scale-110 active:scale-95 transition-transform"
              >
                <HeartIconSVG
                  filled={isLiked}
                  className={`w-3.5 h-3.5 transition-colors ${
                    isLiked
                      ? 'text-destructive fill-current animate-heart-burst'
                      : 'text-muted-foreground hover:text-foreground opacity-80 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                  }`}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
