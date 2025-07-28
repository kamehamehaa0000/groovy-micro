import { useRef, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getLikedPlaylists } from '../service/libraryService'
import { PlaylistCard } from '../components/cards/PlaylistCard'
import toast from 'react-hot-toast'

const Loader = () => <span className="loader" />

const LikedPlaylistsPage = () => {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['likedPlaylists'],
    queryFn: ({ pageParam = 1 }) => getLikedPlaylists(pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.currentPage < lastPage.pagination.totalPages) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
  })

  const observer = useRef<IntersectionObserver>(null)
  const lastPlaylistElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (isFetching) return
      if (observer.current) observer.current.disconnect()
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      })
      if (node) observer.current.observe(node)
    },
    [isFetching, hasNextPage, fetchNextPage, isFetchingNextPage]
  )

  if (status === 'pending') {
    return <Loader />
  }

  if (status === 'error') {
    toast.error('Error fetching liked playlists')
    return (
      <div className="text-red-500 text-center">
        Error occurred while fetching liked playlists.
      </div>
    )
  }

  const allPlaylists = data.pages.flatMap((page) => page.playlists)

  return (
    <div className=" p-4 sm:p-6 lg:p-8 w-full">
      <h1 className="text-2xl font-bold mb-6">Liked Playlists</h1>
      {allPlaylists.length === 0 && !isFetching ? (
        <p>You have not liked any playlists yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4 ">
          {allPlaylists.map((playlist: any, index: number) => {
            if (allPlaylists.length === index + 1) {
              return (
                <div ref={lastPlaylistElementRef} key={playlist._id}>
                  <PlaylistCard playlist={playlist} />
                </div>
              )
            }
            return <PlaylistCard key={playlist._id} playlist={playlist} />
          })}
        </div>
      )}
      <div>
        {isFetchingNextPage && <Loader />}
        {!hasNextPage && allPlaylists.length > 0 && (
          <p className="text-center mt-8 text-gray-400">
            You've reached the end of your liked playlists.
          </p>
        )}
      </div>
    </div>
  )
}

export default LikedPlaylistsPage
