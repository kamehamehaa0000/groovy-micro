import { useCallback, useEffect, useRef, useState } from 'react'

interface UseInfiniteScrollOptions {
  hasMore: boolean
  isLoading: boolean
  threshold?: number // Distance from bottom to trigger load (in pixels)
  rootMargin?: string
}

export const useInfiniteScroll = ({
  hasMore,
  isLoading,
  threshold = 100,
  rootMargin = '0px',
}: UseInfiniteScrollOptions) => {
  const [isFetching, setIsFetching] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore && !isFetching) {
      setIsFetching(true)
    }
  }, [isLoading, hasMore, isFetching])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (target.isIntersecting) {
          handleLoadMore()
        }
      },
      {
        threshold: 0.1,
        rootMargin,
      }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [handleLoadMore, rootMargin])

  const resetFetching = useCallback(() => {
    setIsFetching(false)
  }, [])

  return {
    loadMoreRef,
    isFetching,
    resetFetching,
  }
}