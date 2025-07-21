import React from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useInView } from 'react-intersection-observer'
import { getPublicPlaylists } from '../service/playlistService'
import { PlaylistCard } from '../components/cards/PlaylistCard'

interface Playlist {
  _id: string
  title: string
  coverUrl: string
  creator: {
    _id: string
    displayName: string
  }
  songs: any[]
  description?: string
  likedBy?: string[]
  isLikedByCurrentUser?: boolean
}

interface PlaylistsResponse {
  playlists: Playlist[]
  currentPage: number
  totalPages: number
  totalPlaylists: number
}

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
  } = useInfiniteQuery({
    queryKey: ['playlists', 'public'],
    queryFn: ({ pageParam = 1 }) => getPublicPlaylists(pageParam, 20),
    getNextPageParam: (lastPage: PlaylistsResponse) => {
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
        <div className=" px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              All Playlists
            </h1>
            <p className="text-gray-600">Discover curated playlists</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse bg-white rounded-lg shadow-sm p-3"
              >
                <div className="w-full aspect-square bg-gray-200 rounded-md mb-2"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
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
