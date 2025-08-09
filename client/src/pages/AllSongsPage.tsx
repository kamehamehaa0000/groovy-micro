import React from 'react'
import { useInView } from 'react-intersection-observer'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { usePublicSongs } from '@/service/queries/songQuery'
import SongsSkeleton from '@/components/skeletons/SongsSkeleton'

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
  } = usePublicSongs()

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
          <SongsSkeleton />
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
