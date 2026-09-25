import React, { useState, useRef, memo } from 'react'
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
      className={`relative select-none rounded transition-colors ${
        isDragging
          ? 'z-40 shadow-2xl ring-2 ring-blue/60 bg-panel-elevated opacity-95 scale-[1.01]'
          : ''
      } ${
        isRemoving ? 'opacity-0 -translate-x-full duration-200' : ''
      }`}
    >
      {/* ===================== SWIPE REVEAL BACKGROUND PANELS ===================== */}
      {/* 1. Left Swipe Reveal: Red Remove Action */}
      {canSwipeLeft && (
        <div
          className={`absolute inset-y-0 right-0 w-24 bg-red-500/90 text-white flex items-center justify-center gap-1.5 px-3 z-0 transition-opacity rounded-r-md ${
            swipeOffset < -15 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span className="font-mono text-[9px] uppercase tracking-wider font-semibold">
            Remove
          </span>
        </div>
      )}

      {/* 2. Right Swipe Reveal: Add to Playlist Action */}
      {canSwipeRight && (
        <div
          className={`absolute inset-y-0 left-0 w-24 bg-panel border-r border-line text-ink flex items-center justify-center gap-1.5 px-3 z-0 transition-opacity rounded-l-md ${
            swipeOffset > 15 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span className="font-mono text-[9px] uppercase tracking-wider font-semibold">
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
        className={`group relative z-10 flex items-center justify-between gap-2.5 p-2 rounded-md transition-colors cursor-pointer ${
          isNowPlaying
            ? 'bg-blue/8 border border-blue/25'
            : isDragging
            ? 'bg-panel-elevated'
            : 'hover:bg-canvas-deep bg-panel'
        }`}
      >
        {/* Left: Drag Handle (User Queue) or Context Number */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
              className={`drag-grip -ml-1.5 w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 select-none touch-none rounded transition-colors cursor-grab active:cursor-grabbing ${
                isDragging
                  ? 'text-blue bg-blue/15 scale-110 shadow-xs'
                  : 'text-ink-soft/50 hover:text-ink hover:bg-canvas active:text-blue active:bg-blue/10'
              }`}
              title="Drag to reorder"
            >
              <svg
                className="w-4 h-4 sm:w-3.5 sm:h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="9" cy="6" r="1.2" fill="currentColor" />
                <circle cx="15" cy="6" r="1.2" fill="currentColor" />
                <circle cx="9" cy="12" r="1.2" fill="currentColor" />
                <circle cx="15" cy="12" r="1.2" fill="currentColor" />
                <circle cx="9" cy="18" r="1.2" fill="currentColor" />
                <circle cx="15" cy="18" r="1.2" fill="currentColor" />
              </svg>
            </div>
          ) : isContextQueue ? (
            <span className="font-mono text-[10px] text-ink-soft/60 w-4 text-center shrink-0">
              {index + 1}
            </span>
          ) : null}

          {/* Thumbnail Artwork with Play / Equalizer Overlay */}
          <div className="relative w-8 h-8 rounded bg-canvas border border-line shrink-0 overflow-hidden group/thumb">
            {track.coverImageUrl ? (
              <img
                src={track.coverImageUrl}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                ♪
              </div>
            )}

            {isNowPlaying && isPlaying ? (
              <div className="absolute inset-0 bg-ink/50 flex items-center justify-center gap-0.5">
                <span className="w-0.5 h-2.5 bg-canvas rounded-full animate-pulse" />
                <span className="w-0.5 h-3.5 bg-canvas rounded-full animate-pulse delay-75" />
                <span className="w-0.5 h-2 bg-canvas rounded-full animate-pulse delay-150" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-canvas text-[9px]">
                ▶
              </div>
            )}
          </div>

          {/* Title & Artist info */}
          <div className="flex flex-col min-w-0">
            <span
              className={`text-xs font-serif italic truncate transition-colors leading-tight ${
                isNowPlaying ? 'text-blue font-semibold' : 'text-ink group-hover:text-blue'
              }`}
            >
              {track.title}
            </span>
            <div className="flex items-center gap-1.5 text-[10.5px] text-ink-soft truncate font-sans">
              <span className="truncate">{track.artistName}</span>
              {isJamQueue && addedByDisplayName && (
                <span className="text-emerald-700 dark:text-emerald-400 font-mono text-[9px] shrink-0">
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
          <SongActionMenu track={track} align="right" />

          <span className="font-mono text-[10.5px] text-ink-soft shrink-0 select-none">
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
              className="p-1 text-ink-soft/50 hover:text-red-500 cursor-pointer sm:opacity-0 sm:group-hover:opacity-100 transition-all rounded hover:bg-stone/20"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
