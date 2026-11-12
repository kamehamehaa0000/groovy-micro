import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { usePlayerStore } from '../../stores/player.store'
import { playbackClock } from '../../lib/playbackClock'

export type ScrubberVariant = 'bar' | 'expanded' | 'hairline'
export type ScrubberLayout = 'inline' | 'stacked'

interface ScrubberProps {
  /** Visual style of the track + thumb. */
  variant?: ScrubberVariant
  /** Where the time labels sit relative to the track. */
  layout?: ScrubberLayout
  /** A hairline bar is decorative; the others are draggable. */
  interactive?: boolean
  /** Wrapper element classes. */
  className?: string
  /** Row that holds the labels in the `stacked` layout. */
  labelsClassName?: string
  showElapsed?: boolean
  showDuration?: boolean
  elapsedClassName?: string
  durationClassName?: string
  ariaLabel?: string
}

interface VariantStyle {
  hit: string
  track: string
  fill: string
  thumb: string
}

const VARIANTS: Record<ScrubberVariant, VariantStyle> = {
  // Desktop bar: a thin track with a thumb that appears on hover.
  bar: {
    hit: 'relative flex-1 h-5 flex items-center cursor-pointer group touch-none',
    track: 'w-full h-1.5 bg-secondary/50 rounded-full overflow-hidden',
    fill: 'h-full w-full bg-foreground group-hover:bg-primary origin-left',
    thumb:
      'absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-foreground group-hover:bg-primary rounded-full shadow-md opacity-0 group-hover:opacity-100 data-[scrubbing=true]:opacity-100 transition-opacity group-hover:scale-125 data-[scrubbing=true]:scale-125',
  },
  // Mobile now-playing: a taller hit area with a permanently visible thumb.
  expanded: {
    hit: 'relative w-full h-11 flex items-center cursor-pointer group touch-none',
    track: 'w-full h-1 bg-border/50 rounded-full overflow-hidden',
    fill: 'h-full w-full bg-foreground origin-left',
    thumb:
      'absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-foreground rounded-full shadow-md transition-transform duration-100 group-hover:scale-125 data-[scrubbing=true]:scale-125',
  },
  // Mini player hairline: decorative, no thumb, no labels.
  hairline: {
    hit: 'w-full h-full',
    track: 'w-full h-full bg-border/20 dark:bg-white/10 rounded-full overflow-hidden',
    fill: 'h-full w-full bg-success origin-left',
    thumb: '',
  },
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * The seek bar shared by every player surface.
 *
 * Two things make it feel like a native player:
 *
 * 1. The position is painted at animation-frame resolution. `playbackClock`
 *    samples the media element on every frame and this component writes the
 *    result straight to the DOM (`transform` only), so a moving bar costs zero
 *    React re-renders.
 * 2. Dragging is pointer-driven with capture, so the thumb tracks the pointer
 *    1:1 — on touch, pen and mouse alike — and the finger may slide off the
 *    bar without losing the drag. The position is a preview while dragging and
 *    is committed to the player when the pointer is released.
 */
export function Scrubber({
  variant = 'bar',
  layout = 'inline',
  interactive = true,
  className,
  labelsClassName,
  showElapsed = false,
  showDuration = false,
  elapsedClassName,
  durationClassName,
  ariaLabel = 'Seek',
}: ScrubberProps) {
  const style = VARIANTS[variant]
  const isInteractive = interactive && variant !== 'hairline'

  const hitRef = useRef<HTMLDivElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const elapsedRef = useRef<HTMLSpanElement | null>(null)
  const durationRef = useRef<HTMLSpanElement | null>(null)

  const durationRefValue = useRef(0)
  const previewRef = useRef<number | null>(null)
  const dragRef = useRef<{
    active: boolean
    rect: DOMRect | null
    clientX: number
    frame: number | null
  }>({ active: false, rect: null, clientX: 0, frame: null })

  /**
   * Paints a position. Everything here is a transform or a text write, so it
   * never triggers layout.
   */
  const paint = useCallback((position: number, duration: number) => {
    const ratio = duration > 0 ? clamp01(position / duration) : 0

    if (fillRef.current) {
      fillRef.current.style.transform = `scaleX(${ratio})`
    }
    if (railRef.current) {
      railRef.current.style.transform = `translateX(${ratio * 100}%)`
    }

    const elapsedText = formatTime(position)
    if (elapsedRef.current && elapsedRef.current.textContent !== elapsedText) {
      elapsedRef.current.textContent = elapsedText
    }
    const durationText = formatTime(duration)
    if (
      durationRef.current &&
      durationRef.current.textContent !== durationText
    ) {
      durationRef.current.textContent = durationText
    }

    // The ARIA value only needs whole seconds, so it is refreshed at 1 Hz
    // instead of on every frame.
    const hit = hitRef.current
    if (hit) {
      const second = Math.floor(position)
      const total = Math.floor(duration)
      if (
        hit.dataset.ariaSecond !== String(second) ||
        hit.dataset.ariaDuration !== String(total)
      ) {
        hit.dataset.ariaSecond = String(second)
        hit.dataset.ariaDuration = String(total)
        hit.setAttribute('aria-valuenow', String(second))
        hit.setAttribute('aria-valuemax', String(total))
        hit.setAttribute('aria-valuetext', `${elapsedText} of ${durationText}`)
      }
    }
  }, [])

  // The clock is the single source of the live position.
  useEffect(() => {
    return playbackClock.subscribe((reading) => {
      durationRefValue.current = reading.duration
      const position = previewRef.current ?? reading.position
      paint(position, reading.duration)
    })
  }, [paint])

  const applyPointerPosition = useCallback(
    (clientX: number) => {
      const rect = dragRef.current.rect
      if (!rect || rect.width <= 0) return
      const duration = durationRefValue.current
      const ratio = clamp01((clientX - rect.left) / rect.width)
      const seconds = ratio * duration
      previewRef.current = seconds
      paint(seconds, duration)
    },
    [paint],
  )

  const flushDrag = useCallback(() => {
    const drag = dragRef.current
    drag.frame = null
    if (!drag.active) return
    applyPointerPosition(drag.clientX)
  }, [applyPointerPosition])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isInteractive) return
    if (durationRefValue.current <= 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      active: true,
      rect: e.currentTarget.getBoundingClientRect(),
      clientX: e.clientX,
      frame: null,
    }
    e.currentTarget.dataset.scrubbing = 'true'
    applyPointerPosition(e.clientX)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    dragRef.current.clientX = e.clientX
    if (dragRef.current.frame === null) {
      dragRef.current.frame = requestAnimationFrame(flushDrag)
    }
  }

  /**
   * Ends the drag. `commit` decides whether the preview becomes a real seek:
   * a finished drag commits, an interrupted one (cancelled pointer, lost
   * capture) simply falls back to the playback position.
   */
  const finishScrub = (
    e: ReactPointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => {
    if (!dragRef.current.active) return

    const drag = dragRef.current
    if (drag.frame !== null) {
      cancelAnimationFrame(drag.frame)
      drag.frame = null
    }
    // The final pointer position, which may be a hair past the last move.
    const finalX = e.clientX > 0 ? e.clientX : drag.clientX
    applyPointerPosition(finalX)

    const target = previewRef.current
    drag.active = false
    previewRef.current = null
    delete e.currentTarget.dataset.scrubbing
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    if (commit && target !== null) {
      // Committed through the store so the Speaker routing (rule B1), the Live
      // Jam broadcast and the saved snapshot all keep working.
      usePlayerStore.getState().seek(target)
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return
    const { currentTime, duration, seek } = usePlayerStore.getState()

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        e.stopPropagation()
        seek(Math.max(0, currentTime - 5))
        break
      case 'ArrowRight':
        e.preventDefault()
        e.stopPropagation()
        seek(Math.min(duration || Infinity, currentTime + 5))
        break
      case 'Home':
        e.preventDefault()
        e.stopPropagation()
        seek(0)
        break
      case 'End':
        e.preventDefault()
        e.stopPropagation()
        seek(duration || 0)
        break
      default:
        break
    }
  }

  const track = (
    <>
      <div className={style.track}>
        <div ref={fillRef} className={style.fill} />
      </div>
      {style.thumb && (
        <div
          ref={railRef}
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-full pointer-events-none"
        >
          <div className={style.thumb} />
        </div>
      )}
    </>
  )

  const hitArea = isInteractive ? (
    <div
      ref={hitRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={0}
      aria-valuenow={0}
      className={style.hit}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishScrub(e, true)}
      onPointerCancel={(e) => finishScrub(e, false)}
      onLostPointerCapture={(e) => finishScrub(e, false)}
      onKeyDown={handleKeyDown}
      // A scrub must never be mistaken for the surrounding gestures (the mobile
      // player's pull-down dismissal, for instance).
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {track}
    </div>
  ) : (
    <div ref={hitRef} aria-hidden="true" className={style.hit}>
      {track}
    </div>
  )

  if (layout === 'stacked') {
    return (
      <div className={className}>
        {hitArea}
        {(showElapsed || showDuration) && (
          <div className={labelsClassName}>
            {showElapsed && (
              <span ref={elapsedRef} className={elapsedClassName}>
                0:00
              </span>
            )}
            {showDuration && (
              <span ref={durationRef} className={durationClassName}>
                0:00
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      {showElapsed && (
        <span ref={elapsedRef} className={elapsedClassName}>
          0:00
        </span>
      )}
      {hitArea}
      {showDuration && (
        <span ref={durationRef} className={durationClassName}>
          0:00
        </span>
      )}
    </div>
  )
}
