import { useEffect, useRef } from 'react'

interface UseInfiniteScrollOptions {
  enabled: boolean
  onLoadMore: () => void
  rootMargin?: string
}

/**
 * Observes a sentinel element and requests the next page when it approaches
 * the viewport. The observer only exists while another page can be fetched.
 */
export function useInfiniteScroll({
  enabled,
  onLoadMore,
  rootMargin = '400px 0px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !enabled || typeof IntersectionObserver === 'undefined') {
      return
    }

    let requested = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (requested || !entries.some((entry) => entry.isIntersecting)) {
          return
        }

        requested = true
        onLoadMoreRef.current()
      },
      { rootMargin },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [enabled, rootMargin])

  return sentinelRef
}
