import React from 'react'

import { useInView } from 'react-intersection-observer'
import { PlaylistCard } from '../components/cards/PlaylistCard'
import { usePublicPlaylists } from '@/service/queries/playlistQuery'
import { Album } from 'lucide-react'
import AlbumsSkeleton from '@/components/skeletons/AlbumsSkeleton'

const AllPlaylistsPage = () => {
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
  } = usePublicPlaylists()

  React.useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage()
    }
  }, [inView, fetchNextPage, hasNextPage])

  if (status === 'pending') {
    return (
      <div className="h-full bg-white">
        <div className=" px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              All Playlists
            </h1>
            <p className="text-gray-600">Discover curated playlists</p>
          </div>
          <AlbumsSkeleton />
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
            {error instanceof Error
              ? error.message
              : 'Failed to load playlists'}
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

  const allPlaylists = data?.pages.flatMap((page) => page.playlists) ?? []
  const totalPlaylists = data?.pages[0]?.totalPlaylists ?? 0

  return (
    <div className="h-full bg-white">
      <div className=" px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            All Playlists
          </h1>
          <p className="text-gray-600">
            {totalPlaylists > 0
              ? `${totalPlaylists} playlists available`
              : 'Discover curated playlists'}
          </p>
        </div>

        {/* Playlists Grid */}
        {allPlaylists.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">🎵</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No playlists available
            </h3>
            <p className="text-gray-500">Check back later for new playlists!</p>
          </div>
        ) : (
          <>
            {/* Responsive Grid Layout */}
            <div className="flex flex-wrap items-center gap-4">
              {allPlaylists.map((playlist, index) => (
                <PlaylistCard
                  key={`${playlist._id}-${index}`}
                  playlist={playlist}
                />
              ))}
            </div>

            {/* Loading indicator for next page */}
            {isFetchingNextPage && (
              <div className="p-8 text-center">
                <div className="inline-flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                  <span className="text-gray-600">
                    Loading more playlists...
                  </span>
                </div>
              </div>
            )}

            {/* Intersection observer target */}
            {hasNextPage && !isFetchingNextPage && (
              <div
                ref={ref}
                className="h-10 flex items-center justify-center mt-8"
              >
                <div className="text-gray-400 text-sm">
                  Load more playlists...
                </div>
              </div>
            )}

            {/* End of list indicator */}
            {!hasNextPage && allPlaylists.length > 0 && (
              <div className="p-8 text-center">
                <div className="text-gray-400 text-sm">
                  🎉 You've reached the end! That's all the playlists we have.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default AllPlaylistsPage
