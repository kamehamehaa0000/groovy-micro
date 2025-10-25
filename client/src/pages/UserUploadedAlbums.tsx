import React from 'react'
import { useInView } from 'react-intersection-observer'
import { AlbumCard } from '../components/cards/AlbumCard'
import { useCurrentUserAlbums } from '@/service/queries/albumOuery'
import AlbumsSkeleton from '@/components/skeletons/AlbumsSkeleton'

const UserUploadedAlbums = () => {
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
  } = useCurrentUserAlbums()

  React.useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage()
    }
  }, [inView, fetchNextPage, hasNextPage])

  if (status === 'pending') {
    return (
      <div className="h-full bg-white dark:bg-stone-950">
        <div className=" px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-stone-900 mb-2">
              All User Uploaded Albums
            </h1>
            <p className="text-stone-600">Discover amazing albums</p>
          </div>
          <AlbumsSkeleton />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="h-full bg-white dark:bg-stone-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-stone-600 mb-4">
            {error instanceof Error ? error.message : 'Failed to load albums'}
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

  const allAlbums = data?.pages.flatMap((page) => page.albums) ?? []
  const totalAlbums = data?.pages[0]?.totalAlbums ?? 0

  return (
    <div className="h-full bg-white  dark:bg-stone-950">
      <div className=" ">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-stone-900  dark:text-stone-300 mb-2 flex items-center gap-2">
            User Uploaded Albums{' '}
            <span className="text-stone-600 text-xs">
              ( {`${totalAlbums} albums`} )
            </span>
          </h1>
          <p className="text-stone-600">
            {totalAlbums >= 0 && 'Discover Your Discography'}
          </p>
        </div>

        {/* Albums Grid */}
        {allAlbums.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-stone-400 text-6xl mb-4">💿</div>
            <h3 className="text-xl font-semibold text-stone-700 mb-2">
              No albums available
            </h3>
            <p className="text-stone-500">Upload your music to see it here!</p>
          </div>
        ) : (
          <>
            {/* Responsive Grid Layout */}
            <div className="flex flex-wrap items-center gap-4">
              {allAlbums.map((album, index) => (
                <AlbumCard key={`${album._id}-${index}`} album={album} />
              ))}
            </div>

            {/* Loading indicator for next page */}
            {isFetchingNextPage && (
              <div className="p-8 text-center">
                <div className="inline-flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                  <span className="text-stone-600">Loading more albums...</span>
                </div>
              </div>
            )}

            {/* Intersection observer target */}
            {hasNextPage && !isFetchingNextPage && (
              <div
                ref={ref}
                className="h-10 flex items-center justify-center mt-8"
              >
                <div className="text-stone-400 text-sm">
                  Load more albums...
                </div>
              </div>
            )}

            {/* End of list indicator */}
            {!hasNextPage && allAlbums.length > 0 && (
              <div className="p-8 text-center">
                <div className="text-stone-400 text-sm">
                  🎉 You've reached the end! That's all the albums we have.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default UserUploadedAlbums
