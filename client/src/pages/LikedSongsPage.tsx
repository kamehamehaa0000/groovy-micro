import { useRef, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getLikedAlbums, getLikedSongs } from '../service/libraryService'
import { AlbumCard } from '../components/cards/AlbumCard'
import toast from 'react-hot-toast'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'

const Loader = () => <span className="loader" />

const LikedSongsPage = () => {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['likedSongs'],
    queryFn: ({ pageParam = 1 }) => getLikedSongs(pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.currentPage < lastPage.pagination.totalPages) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
  })

  const observer = useRef<IntersectionObserver>(null)
  const lastSongElementRef = useCallback(
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

  const allSongs = data.pages.flatMap((page) => page.songs)

  return (
    <div className=" p-4 sm:p-6 lg:p-8 w-full">
      <h1 className="text-2xl font-bold mb-6">Liked Songs</h1>
      {allSongs.length === 0 && !isFetching ? (
        <p>You have not liked any songs yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4 ">
          {allSongs.map((song: any) => {
            return (
              <div ref={lastSongElementRef} key={song._id}>
                <SongCompactCardA song={song} />
              </div>
            )
          })}
        </div>
      )}
      <div>
        {isFetchingNextPage && <Loader />}
        {!hasNextPage && allSongs.length > 0 && (
          <p className="text-center mt-8 text-gray-400">
            You've reached the end of your liked songs.
          </p>
        )}
      </div>
    </div>
  )
}

export default LikedSongsPage
