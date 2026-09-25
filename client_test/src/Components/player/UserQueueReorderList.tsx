import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { PlayerTrack } from '../../types/player'
import { QueueSongRow } from './QueueSongRow'

interface UserQueueReorderListProps {
  tracks: PlayerTrack[]
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  onReorder: (fromIndex: number, toIndex: number) => void
  onPlayTrack: (index: number) => void
  onRemoveTrack: (index: number) => void
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
 * Unified, Hardware-Accelerated Pointer Reorder List
 * Works identically with 60/120fps fluid responsiveness on desktop mouse and mobile touchscreens.
 * Features:
 * - 1:1 direct GPU transform tracking (translate3d) under finger/cursor.
 * - Live animated slot displacement for neighboring items (cubic-bezier spring).
 * - Continuous auto-scrolling when hovering near container top/bottom edges.
 * - Global window pointer tracking with automatic capture release.
 * - Haptic ticks on slot shifts and final drop.
 */
export function UserQueueReorderList({
  tracks,
  scrollContainerRef,
  onReorder,
  onPlayTrack,
  onRemoveTrack,
}: UserQueueReorderListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  // Internal mutable drag tracking (updates dragged element directly without React render thrashing)
  const dragDataRef = useRef<{
    activeIndex: number
    targetIndex: number
    startClientY: number
    startClientX: number
    startScrollTop: number
    currentClientY: number
    currentClientX: number
    rowMeasurements: RowMeasurement[]
    rowDistance: number
    draggedEl: HTMLElement | null
    animFrameId: number | null
  } | null>(null)

  const justDraggedRef = useRef(false)

  // Cleanup animation frame and drag state on unmount
  useEffect(() => {
    return () => {
      delete document.body.dataset.queueDragging
      if (dragDataRef.current?.animFrameId) {
        cancelAnimationFrame(dragDataRef.current.animFrameId)
      }
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, index: number) => {
      // Primary pointer only (left mouse click or touch)
      if (e.button !== 0) return
      if (tracks.length <= 1) return

      e.preventDefault()
      e.stopPropagation()

      const container = containerRef.current
      if (!container) return

      const scrollContainer = scrollContainerRef.current
      const startScrollTop = scrollContainer ? scrollContainer.scrollTop : 0

      // Query all rendered row elements in container
      const rowElements = Array.from(
        container.querySelectorAll<HTMLElement>('[data-queue-row-index]')
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
          : rowMeasurements[0].height + 4

      const draggedEl = rowElements[index] || null

      dragDataRef.current = {
        activeIndex: index,
        targetIndex: index,
        startClientY: e.clientY,
        startClientX: e.clientX,
        startScrollTop,
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

        const scrollEl = scrollContainerRef.current
        const currentScrollTop = scrollEl ? scrollEl.scrollTop : 0
        const scrollDelta = currentScrollTop - data.startScrollTop
        const deltaY = clientY - data.startClientY + scrollDelta

        // Apply smooth 1:1 GPU transform to dragged row
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

      // Auto-scrolling loop when dragging near scroll container top or bottom
      const autoScroll = () => {
        const data = dragDataRef.current
        const scrollEl = scrollContainerRef.current
        if (!data || !scrollEl) return

        const rect = scrollEl.getBoundingClientRect()
        const pointerY = data.currentClientY
        const edgeZone = 55

        if (pointerY < rect.top + edgeZone && scrollEl.scrollTop > 0) {
          const factor = Math.min(1, (rect.top + edgeZone - pointerY) / edgeZone)
          scrollEl.scrollTop -= Math.round(factor * 10)
          updatePosition(data.currentClientY, data.currentClientX)
        } else if (
          pointerY > rect.bottom - edgeZone &&
          scrollEl.scrollTop < scrollEl.scrollHeight - scrollEl.clientHeight
        ) {
          const factor = Math.min(1, (pointerY - (rect.bottom - edgeZone)) / edgeZone)
          scrollEl.scrollTop += Math.round(factor * 10)
          updatePosition(data.currentClientY, data.currentClientX)
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
    [tracks, scrollContainerRef, onReorder]
  )

  const handleRowClick = useCallback(
    (index: number) => {
      if (justDraggedRef.current || dragState !== null) return
      onPlayTrack(index)
    },
    [onPlayTrack, dragState]
  )

  return (
    <div ref={containerRef} className="flex flex-col gap-1 relative">
      {tracks.map((track, idx) => {
        const isThisRowDragging = dragState?.activeIndex === idx
        const isDraggingActive = dragState !== null

        // Calculate animated displacement shift for neighboring rows
        let shift = 0
        if (dragState && !isThisRowDragging && dragDataRef.current) {
          const { activeIndex, targetIndex } = dragState
          const distance = dragDataRef.current.rowDistance

          if (activeIndex < targetIndex) {
            // Dragging downwards: items between activeIndex and targetIndex shift UP
            if (idx > activeIndex && idx <= targetIndex) {
              shift = -distance
            }
          } else if (activeIndex > targetIndex) {
            // Dragging upwards: items between targetIndex and activeIndex shift DOWN
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

        return (
          <QueueSongRow
            key={`user-q-${track.id}-${idx}`}
            track={track}
            index={idx}
            isUserQueue
            isDraggable
            isDragging={isThisRowDragging}
            style={rowStyle}
            onGripPointerDown={(e) => handlePointerDown(e, idx)}
            onPlay={() => handleRowClick(idx)}
            onRemove={() => onRemoveTrack(idx)}
          />
        )
      })}
    </div>
  )
}
