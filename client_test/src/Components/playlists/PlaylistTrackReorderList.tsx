import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { PlaylistTrack } from '../../types/playlist'
import type { PlayerTrack } from '../../types/player'
import { SongRow } from '../common/SongRow'
import type { SongActionCustomItem } from '../player/SongActionMenu'

interface PlaylistTrackReorderListProps {
  tracks: PlaylistTrack[]
  canEdit: boolean
  toPlayerTrack: (track: PlaylistTrack) => PlayerTrack
  onReorder: (fromIndex: number, toIndex: number) => void
  onPlayTrack: (track: PlaylistTrack, index: number) => void
  onRemoveTrack?: (entryId: string) => void
}

interface DragState {
  activeIndex: number
  targetIndex: number
}

interface RowMeasurement {
  offsetTop: number
  height: number
  center: number
}

/**
 * Unified, Hardware-Accelerated Playlist Reorder List
 * Features:
 * - 1:1 direct GPU transform tracking (translate3d, scale 1.02, zero tilt/rotation).
 * - Live animated slot displacement for neighboring items (cubic-bezier spring).
 * - Window-aware edge auto-scrolling for whole-page playlist scrolling.
 * - Global window pointer tracking with automatic capture release.
 * - Haptic ticks on slot shifts and final drop.
 */
export function PlaylistTrackReorderList({
  tracks,
  canEdit,
  toPlayerTrack,
  onReorder,
  onPlayTrack,
  onRemoveTrack,
}: PlaylistTrackReorderListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  const dragDataRef = useRef<{
    activeIndex: number
    targetIndex: number
    startClientY: number
    startClientX: number
    startScrollY: number
    currentClientY: number
    currentClientX: number
    rowMeasurements: RowMeasurement[]
    rowDistance: number
    draggedEl: HTMLElement | null
    animFrameId: number | null
  } | null>(null)

  const justDraggedRef = useRef(false)

  // Cleanup animation frame and dragging state on unmount
  useEffect(() => {
    return () => {
      delete document.body.dataset.queueDragging
      if (dragDataRef.current?.animFrameId) {
        cancelAnimationFrame(dragDataRef.current.animFrameId)
      }
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>, index: number) => {
      if (e.button !== 0) return
      if (!canEdit || tracks.length <= 1) return

      e.preventDefault()
      e.stopPropagation()

      const container = containerRef.current
      if (!container) return

      const startScrollY =
        window.scrollY || document.documentElement.scrollTop || 0

      // Query all rendered playlist row elements in container
      const rowElements = Array.from(
        container.querySelectorAll<HTMLElement>('[data-playlist-row-index]')
      )
      if (rowElements.length !== tracks.length) return

      const rowMeasurements: RowMeasurement[] = rowElements.map((el) => {
        const offsetTop = el.offsetTop
        const height = el.offsetHeight
        return {
          offsetTop,
          height,
          center: offsetTop + height / 2,
        }
      })

      const rowDistance =
        rowMeasurements.length > 1
          ? rowMeasurements[1].offsetTop - rowMeasurements[0].offsetTop
          : rowMeasurements[0].height + 1 // Account for border/divider

      const draggedEl = rowElements[index] || null

      dragDataRef.current = {
        activeIndex: index,
        targetIndex: index,
        startClientY: e.clientY,
        startClientX: e.clientX,
        startScrollY,
        currentClientY: e.clientY,
        currentClientX: e.clientX,
        rowMeasurements,
        rowDistance,
        draggedEl,
        animFrameId: null,
      }

      document.body.dataset.queueDragging = 'true'

      setDragState({
        activeIndex: index,
        targetIndex: index,
      })

      try {
        navigator.vibrate?.(20)
      } catch {}

      // Calculate and update positions
      const updatePosition = (clientY: number, clientX: number) => {
        const data = dragDataRef.current
        if (!data || !data.draggedEl) return

        data.currentClientY = clientY
        data.currentClientX = clientX

        const currentScrollY =
          window.scrollY || document.documentElement.scrollTop || 0
        const scrollDelta = currentScrollY - data.startScrollY

        const deltaY = clientY - data.startClientY + scrollDelta

        // Apply smooth 1:1 GPU transform to dragged row (pure vertical + scale, no tilt)
        data.draggedEl.style.transform = `translate3d(0, ${deltaY}px, 0) scale(1.02)`

        // Calculate current center in container space
        const initialCenter = data.rowMeasurements[data.activeIndex].center
        const currentCenter = initialCenter + deltaY

        // Find which slot the item is currently closest to
        let newTarget = data.activeIndex
        const measurements = data.rowMeasurements

        for (let k = 0; k < measurements.length; k++) {
          const mid = measurements[k].center
          if (data.activeIndex < k) {
            if (currentCenter > mid) {
              newTarget = k
            }
          } else if (data.activeIndex > k) {
            if (currentCenter < mid && newTarget > k) {
              newTarget = k
            }
          }
        }

        newTarget = Math.max(0, Math.min(tracks.length - 1, newTarget))

        if (newTarget !== data.targetIndex) {
          data.targetIndex = newTarget
          setDragState({
            activeIndex: data.activeIndex,
            targetIndex: newTarget,
          })
          try {
            navigator.vibrate?.(10)
          } catch {}
        }
      }

      // Auto-scrolling loop when dragging near viewport top or bottom
      const autoScroll = () => {
        const data = dragDataRef.current
        if (!data) return

        const pointerY = data.currentClientY
        const edgeZone = 80
        const windowHeight = window.innerHeight

        if (pointerY < edgeZone && (window.scrollY || document.documentElement.scrollTop) > 0) {
          const factor = Math.min(1, (edgeZone - pointerY) / edgeZone)
          window.scrollBy({ top: -Math.round(factor * 14) })
          updatePosition(data.currentClientY, data.startClientX)
        } else if (pointerY > windowHeight - edgeZone) {
          const factor = Math.min(1, (pointerY - (windowHeight - edgeZone)) / edgeZone)
          window.scrollBy({ top: Math.round(factor * 14) })
          updatePosition(data.currentClientY, data.startClientX)
        }

        data.animFrameId = requestAnimationFrame(autoScroll)
      }

      dragDataRef.current.animFrameId = requestAnimationFrame(autoScroll)

      const onPointerMove = (moveEvent: PointerEvent) => {
        updatePosition(moveEvent.clientY, moveEvent.clientX)
      }

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)

        const data = dragDataRef.current
        if (data) {
          if (data.animFrameId) {
            cancelAnimationFrame(data.animFrameId)
          }

          if (data.draggedEl) {
            data.draggedEl.style.transform = ''
          }

          const from = data.activeIndex
          const to = data.targetIndex

          delete document.body.dataset.queueDragging
          dragDataRef.current = null
          setDragState(null)

          justDraggedRef.current = true
          setTimeout(() => {
            justDraggedRef.current = false
          }, 250)

          if (from !== to) {
            onReorder(from, to)
            try {
              navigator.vibrate?.([15, 20])
            } catch {}
          }
        }
      }

      window.addEventListener('pointermove', onPointerMove, { passive: false })
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerUp)
    },
    [tracks, canEdit, onReorder]
  )

  const handleRowClick = useCallback(
    (track: PlaylistTrack, index: number) => {
      if (justDraggedRef.current || dragState !== null) return
      onPlayTrack(track, index)
    },
    [onPlayTrack, dragState]
  )

  return (
    <div
      ref={containerRef}
      className="border border-line bg-panel divide-y divide-line/60 shadow-xs relative"
    >
      {tracks.map((track, idx) => {
        const entryId = track.id || (track as any).entryId
        const song = track.song || (track as any)
        const isLocked = song.isStreamable === false

        const isThisRowDragging = dragState?.activeIndex === idx
        const isDraggingActive = dragState !== null

        // Calculate animated displacement shift for neighboring rows
        let shift = 0
        if (dragState && !isThisRowDragging && dragDataRef.current) {
          const { activeIndex, targetIndex } = dragState
          const distance = dragDataRef.current.rowDistance

          if (activeIndex < targetIndex) {
            if (idx > activeIndex && idx <= targetIndex) {
              shift = -distance
            }
          } else if (activeIndex > targetIndex) {
            if (idx >= targetIndex && idx < activeIndex) {
              shift = distance
            }
          }
        }

        const rowStyle: React.CSSProperties = {
          transform: isThisRowDragging
            ? undefined
            : shift !== 0
            ? `translate3d(0, ${shift}px, 0)`
            : undefined,
          transition:
            isDraggingActive && !isThisRowDragging
              ? 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)'
              : undefined,
          zIndex: isThisRowDragging ? 40 : 1,
        }

        const customActions: SongActionCustomItem[] = []
        if (canEdit) {
          if (idx > 0) {
            customActions.push({
              label: 'Move Up in Playlist',
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ),
              onClick: () => onReorder(idx, idx - 1),
            })
          }
          if (idx < tracks.length - 1) {
            customActions.push({
              label: 'Move Down in Playlist',
              icon: (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ),
              onClick: () => onReorder(idx, idx + 1),
            })
          }
        }

        return (
          <SongRow
            key={entryId || idx}
            track={toPlayerTrack(track)}
            index={idx}
            trackNumberDisplay={track.position + 1}
            variant="playlist"
            addedByDisplayName={track.addedByDisplayName}
            scheduledReleaseAt={song.scheduledReleaseAt}
            albumTitleOverride={song.albumTitle}
            albumSlugOverride={song.albumSlug || song.albumId}
            isDraggable={canEdit && !isLocked}
            isDragging={isThisRowDragging}
            style={rowStyle}
            onGripPointerDown={(e) => handlePointerDown(e, idx)}
            onPlay={() => handleRowClick(track, idx)}
            onRemoveFromPlaylist={
              canEdit && onRemoveTrack ? () => onRemoveTrack(entryId) : undefined
            }
            customActions={customActions}
          />
        )
      })}
    </div>
  )
}
