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

    // The element's position is measured once instead of on every scroll
    // frame: reading the rect during a scroll forces a layout, and this hook
    // runs on every frame the page moves.
    let documentTop = 0
    let height = 0

    const measure = () => {
      const rect = target.getBoundingClientRect()
      documentTop = rect.top + window.scrollY
      height = rect.height
    }

    const update = () => {
      frame = 0
      const bottom = documentTop + height - window.scrollY
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

    const remeasure = () => {
      measure()
      update()
    }

    measure()
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', remeasure)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', remeasure)
    }
  }, [targetRef, topOffset, hysteresis])

  return isStuck
}
