import React, { useState, useRef, memo } from 'react'
import { GripVertical, ListPlus, Trash2, X } from 'lucide-react'
import type { PlayerTrack } from '../../types/player'
import { SongActionMenu } from './SongActionMenu'
import { useAddToPlaylistModalStore } from '../../stores/add-to-playlist-modal.store'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export interface QueueSongRowProps {
  track: PlayerTrack
  index: number
  isNowPlaying?: boolean
  isPlaying?: boolean
  isUserQueue?: boolean
  isContextQueue?: boolean
  isJamQueue?: boolean
  addedByDisplayName?: string | null
  onPlay?: () => void
  onRemove?: () => void

  // Fluid pointer reordering
  isDraggable?: boolean
  isDragging?: boolean
  style?: React.CSSProperties
  onGripPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
}

export const QueueSongRow = memo(function QueueSongRow({
  track,
  index,
  isNowPlaying = false,
  isPlaying = false,
  isUserQueue = false,
  isContextQueue = false,
  isJamQueue = false,
  addedByDisplayName,
  onPlay,
  onRemove,

  isDraggable = false,
  isDragging = false,
  style,
  onGripPointerDown,
}: QueueSongRowProps) {
  // Swipe State
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchDirectionRef = useRef<'horizontal' | 'vertical' | null>(null)

  // Can swipe left if removable
  const canSwipeLeft = Boolean(onRemove)
  // Can swipe right to add to playlist
  const canSwipeRight = true

  const startSwipe = (clientX: number, clientY: number) => {
    touchStartRef.current = { x: clientX, y: clientY }
    touchDirectionRef.current = null
    setIsSwiping(false)
  }

  const moveSwipe = (
    clientX: number,
    clientY: number,
    cancelEvent?: () => void
  ) => {
    if (!touchStartRef.current) return

    const deltaX = clientX - touchStartRef.current.x
    const deltaY = clientY - touchStartRef.current.y

    if (!touchDirectionRef.current) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        touchDirectionRef.current = 'vertical'
        return
      }
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        touchDirectionRef.current = 'horizontal'
        setIsSwiping(true)
      }
    }

    if (touchDirectionRef.current === 'horizontal') {
      cancelEvent?.()

      // Direction gating
      if (deltaX > 0 && !canSwipeRight) {
        setSwipeOffset(0)
        return
      }
      if (deltaX < 0 && !canSwipeLeft) {
        setSwipeOffset(0)
        return
      }

      // Elastic resistance damping
      const maxDrag = 110
      const damped =
        Math.sign(deltaX) * Math.min(Math.abs(deltaX) * 0.75, maxDrag)
      setSwipeOffset(damped)
    }
  }

  const endSwipe = () => {
    if (touchDirectionRef.current === 'horizontal') {
      // Swipe left threshold: Remove from queue
      if (swipeOffset < -50 && canSwipeLeft && onRemove) {
        setIsRemoving(true)
        setTimeout(() => {
          onRemove()
          setIsRemoving(false)
        }, 180)
      }
      // Swipe right threshold: Add to Playlist
      else if (swipeOffset > 50 && canSwipeRight) {
        useAddToPlaylistModalStore.getState().openModal(track)
      }
    }

    touchStartRef.current = null
    touchDirectionRef.current = null
    setSwipeOffset(0)
    setIsSwiping(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    startSwipe(e.touches[0].clientX, e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return
    moveSwipe(e.touches[0].clientX, e.touches[0].clientY, () => {
      if (e.cancelable) e.preventDefault()
      e.stopPropagation()
    })
  }

  const handleTouchEnd = () => {
    endSwipe()
  }

  const handleRowClick = () => {
    if (Math.abs(swipeOffset) > 10) return
    onPlay?.()
  }

  return (
    <div
      style={style}
      data-queue-row-index={index}
      data-user-queue={isUserQueue}
      className={`relative select-none rounded-control transition-colors ${
        isDragging
          ? 'z-40 shadow-2xl ring-2 ring-primary/60 bg-card opacity-95 scale-[1.01]'
          : ''
      } ${
        isRemoving ? 'opacity-0 -translate-x-full duration-200' : ''
      }`}
    >
      {/* ===================== SWIPE REVEAL BACKGROUND PANELS ===================== */}
      {/* 1. Left Swipe Reveal: Red Remove Action */}
      {canSwipeLeft && (
        <div
          className={`absolute inset-y-0 right-0 w-24 bg-destructive text-destructive-foreground flex items-center justify-center gap-1.5 px-3 z-0 transition-opacity rounded-r-control ${
            swipeOffset < -15 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold">
            Remove
          </span>
        </div>
      )}

      {/* 2. Right Swipe Reveal: Add to Playlist Action */}
      {canSwipeRight && (
        <div
          className={`absolute inset-y-0 left-0 w-24 bg-card border-r border-border text-foreground flex items-center justify-center gap-1.5 px-3 z-0 transition-opacity rounded-l-control ${
            swipeOffset > 15 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <ListPlus className="w-4 h-4 shrink-0" />
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold">
            Playlist
          </span>
        </div>
      )}

      {/* ===================== FOREGROUND CONTENT ROW ===================== */}
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.22s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleRowClick}
        className={`group relative z-10 flex items-center justify-between gap-3 p-2 sm:p-1.5 min-h-[52px] sm:min-h-10 rounded-control transition-all duration-100 active:scale-[0.99] motion-reduce:active:scale-100 cursor-pointer ${
          isNowPlaying
            ? 'bg-primary/10 border border-primary/25'
            : isDragging
            ? 'bg-card shadow-raised'
            : 'hover:bg-muted bg-card'
        }`}
      >
        {/* Left: Drag Handle (User Queue) or Context Number */}
        <div className="flex items-center gap-2.5 sm:gap-2 min-w-0 flex-1">
          {isDraggable ? (
            <div
              data-drag-handle="true"
              onPointerDown={(e) => {
                e.stopPropagation()
                onGripPointerDown?.(e)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
              }}
              onTouchMove={(e) => {
                e.stopPropagation()
              }}
              onTouchEnd={(e) => {
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              className={`drag-grip -ml-0.5 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 select-none touch-none rounded-control transition-colors cursor-grab active:cursor-grabbing ${
                isDragging
                  ? 'text-primary bg-primary/15 scale-110 shadow-raised'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-background active:text-primary active:bg-primary/10'
              }`}
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            </div>
          ) : isContextQueue ? (
            <span className="font-mono text-eyebrow text-muted-foreground/60 w-4 text-center shrink-0">
              {index + 1}
            </span>
          ) : null}

          {/* Thumbnail Artwork with Play / Equalizer Overlay */}
          <div className="relative w-11 h-11 sm:w-8 sm:h-8 rounded-control bg-background border border-border shrink-0 overflow-hidden group/thumb">
            {track.coverImageUrl ? (
              <img
                src={track.coverImageUrl}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif italic text-caption text-muted-foreground">
                ♪
              </div>
            )}

            {isNowPlaying && isPlaying ? (
              <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center gap-0.5">
                <span className="w-0.5 h-full bg-primary-foreground rounded-full animate-eq-1" />
                <span className="w-0.5 h-full bg-primary-foreground rounded-full animate-eq-2" />
                <span className="w-0.5 h-full bg-primary-foreground rounded-full animate-eq-3" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-foreground/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-background text-eyebrow">
                ▶
              </div>
            )}
          </div>

          {/* Title & Artist info */}
          <div className="flex flex-col min-w-0">
            <span
              className={`text-body sm:text-caption font-sans font-medium truncate transition-colors leading-tight ${
                isNowPlaying ? 'text-primary font-semibold' : 'text-foreground group-hover:text-primary'
              }`}
            >
              {track.title}
            </span>
            <div className="flex items-center gap-1.5 text-caption sm:text-eyebrow text-muted-foreground truncate font-sans">
              <span className="truncate">{track.artistName}</span>
              {isJamQueue && addedByDisplayName && (
                <span className="text-success font-mono text-eyebrow shrink-0">
                  • by {addedByDisplayName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Controls: Action Menu, Duration & Remove Button */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Three-dot menu: desktop only */}
          <div className="hidden sm:block">
            <SongActionMenu track={track} align="right" />
          </div>

          {/* Duration: desktop only */}
          <span className="hidden sm:inline-block font-mono text-eyebrow text-muted-foreground shrink-0 select-none">
            {formatSeconds(track.durationSeconds)}
          </span>

          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              title="Remove from queue"
              aria-label="Remove from queue"
              className="p-1.5 sm:p-1 text-muted-foreground/60 hover:text-destructive cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 transition-all rounded-control hover:bg-secondary/20"
            >
              <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
