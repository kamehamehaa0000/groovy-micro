import React from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'react-intersection-observer'
import { fetchArtists } from '../service/artistService'
import ArtistCompactCard from '../components/cards/ArtistCard'

interface ArtistsResponse {
  artists: { _id: string; displayName: string }[]
  currentPage: number
  totalPages: number
  totalArtists: number
}

const AllArtistsPage = () => {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  })

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['artists', 'all'],
    queryFn: ({ pageParam = 1 }) => fetchArtists(pageParam, 20),
    getNextPageParam: (lastPage: ArtistsResponse) => {
      return lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined
    },
    initialPageParam: 1,
  })

  React.useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage()
    }
  }, [inView, fetchNextPage, hasNextPage])

  if (status === 'pending') {
    return (
      <div className="h-full bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">All Songs</h1>
            <p className="text-gray-600">Discover amazing music</p>
          </div>
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index + 'artists-loading'}
                className="animate-pulse border-b border-gray-100 p-4"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gray-200 rounded"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                  </div>
                  <div className="flex space-x-2">
                    <div className="w-4 h-4 bg-gray-200 rounded"></div>
                    <div className="w-4 h-4 bg-gray-200 rounded"></div>
                    <div className="w-4 h-4 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-4">
            {error instanceof Error ? error.message : 'Failed to load songs'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const allArtists = data?.pages.flatMap((page) => page.artists) ?? []
  const totalArtists = data?.pages[0]?.totalArtists ?? 0

  return (
    <div className="h-full bg-white">
      <div className=" mx-auto px-3 py-4 lg:px-4 lg:py-8 ">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">All Artists</h1>
          <p className="text-gray-600">
            {totalArtists > 0
              ? `${totalArtists} artists available`
              : 'Discover amazing music'}
          </p>
        </div>

        {/* Artists List */}
        {allArtists.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">🎤</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No artists available
            </h3>
            <p className="text-gray-500">Check back later for new Artists!</p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-3">
              {allArtists.map((artist, index) => (
                <div key={`${artist._id}-${index}`}>
                  <ArtistCompactCard artist={artist} />
                </div>
              ))}
            </div>

            {isFetchingNextPage && (
              <div className="p-8 text-center col-span-full">
                <div className="inline-flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                  <span className="text-gray-600">Loading more songs...</span>
                </div>
              </div>
            )}

            {hasNextPage && !isFetchingNextPage && (
              <div
                ref={ref}
                className="h-10 flex items-center justify-center mt-8"
              >
                <div className="text-gray-400 text-sm">Load more songs...</div>
              </div>
            )}

            {/* End of list indicator - Desktop */}
            {!hasNextPage && allArtists.length > 0 && (
              <div className="p-8 text-center mt-8">
                <div className="text-gray-400 text-sm">
                  🎉 You've reached the end! That's all the songs we have.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AllArtistsPage
