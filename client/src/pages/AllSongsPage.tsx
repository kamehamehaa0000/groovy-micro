import React from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'react-intersection-observer'
import { fetchPublicSongs } from '../service/songsService'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { type Song } from '../store/player-store'

interface SongsResponse {
  songs: Song[]
  currentPage: number
  totalPages: number
  totalSongs: number
}

const AllSongsPage = () => {
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
    queryKey: ['songs', 'public'],
    queryFn: ({ pageParam = 1 }) => fetchPublicSongs(pageParam, 20),
    getNextPageParam: (lastPage: SongsResponse) => {
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
                key={index}
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

  const allSongs = data?.pages.flatMap((page) => page.songs) ?? []
  const totalSongs = data?.pages[0]?.totalSongs ?? 0

  return (
    <div className="h-full bg-white">
      <div className=" mx-auto px-3 py-4 lg:px-4 lg:py-8 ">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">All Songs</h1>
          <p className="text-gray-600">
            {totalSongs > 0
              ? `${totalSongs} songs available`
              : 'Discover amazing music'}
          </p>
        </div>

        {/* Songs List */}
        {allSongs.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">🎵</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No songs available
            </h3>
            <p className="text-gray-500">Check back later for new music!</p>
          </div>
        ) : (
          <>
            {/* Desktop Layout */}
            <div className="hidden md:block">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                {allSongs.map((song, index) => (
                  <div key={`${song._id}-${index}`}>
                    <SongCompactCardA song={song} />
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
                  <div className="text-gray-400 text-sm">
                    Load more songs...
                  </div>
                </div>
              )}

              {/* End of list indicator - Desktop */}
              {!hasNextPage && allSongs.length > 0 && (
                <div className="p-8 text-center mt-8">
                  <div className="text-gray-400 text-sm">
                    🎉 You've reached the end! That's all the songs we have.
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Layout */}
            <div className="block md:hidden">
              <div className="bg-white rounded-lg ">
                {allSongs.map((song, index) => (
                  <SongCompactCardA key={`${song._id}-${index}`} song={song} />
                ))}

                {isFetchingNextPage && (
                  <div className="p-8 text-center">
                    <div className="inline-flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                      <span className="text-gray-600">
                        Loading more songs...
                      </span>
                    </div>
                  </div>
                )}

                {hasNextPage && !isFetchingNextPage && (
                  <div
                    ref={ref}
                    className="h-10 flex items-center justify-center"
                  >
                    <div className="text-gray-400 text-sm">
                      Load more songs...
                    </div>
                  </div>
                )}

                {!hasNextPage && allSongs.length > 0 && (
                  <div className="p-8 text-center">
                    <div className="text-gray-400 text-sm">
                      🎉 You've reached the end! That's all the songs we have.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AllSongsPage
