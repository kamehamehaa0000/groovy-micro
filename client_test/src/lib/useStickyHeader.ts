import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface StickyHeaderOptions {
  /** Viewport offset the compact bar sticks beneath (px). Global header = 56. */
  topOffset?: number
  /** Extra px of hysteresis so the bar never flickers at the boundary. */
  hysteresis?: number
}

/**
 * True once `targetRef` has scrolled completely above `topOffset`.
 *
 * Used by the collection header to cross-fade the large cover/title into the
 * slim sticky title bar. It listens to scroll/resize and only commits state
 * when the boolean actually flips, so it cannot thrash React on every frame.
 */
export function useStickyHeader<T extends HTMLElement>(
  targetRef: RefObject<T | null>,
  { topOffset = 56, hysteresis = 14 }: StickyHeaderOptions = {},
): boolean {
  const [isStuck, setIsStuck] = useState(false)
  const stuckRef = useRef(false)

  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    let frame = 0

    const update = () => {
      frame = 0
      const bottom = target.getBoundingClientRect().bottom
      const next = stuckRef.current
        ? bottom <= topOffset + hysteresis
        : bottom <= topOffset
      if (stuckRef.current === next) return
      stuckRef.current = next
      setIsStuck(next)
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [targetRef, topOffset, hysteresis])

  return isStuck
}
