import { useRef, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getLikedAlbums } from '../service/libraryService'
import { AlbumCard } from '../components/cards/AlbumCard'
import toast from 'react-hot-toast'

const Loader = () => <span className="loader" />

const LikedAlbumsPage = () => {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['likedAlbums'],
    queryFn: ({ pageParam = 1 }) => getLikedAlbums(pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.currentPage < lastPage.pagination.totalPages) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
  })

  const observer = useRef<IntersectionObserver>(null)
  const lastAlbumElementRef = useCallback(
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
    toast.error('Error fetching liked albums')
    return (
      <div className="text-red-500 text-center">
        Error occurred while fetching liked albums.
      </div>
    )
  }

  const allAlbums = data.pages.flatMap((page) => page.albums)

  return (
    <div className=" p-4 sm:p-6 lg:p-8 w-full">
      <h1 className="text-2xl font-bold mb-6">Liked Albums</h1>
      {allAlbums.length === 0 && !isFetching ? (
        <p>You have not liked any albums yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4 ">
          {allAlbums.map((album: any) => {
            return (
              <div ref={lastAlbumElementRef} key={album._id}>
                <AlbumCard album={album} />
              </div>
            )
          })}
        </div>
      )}
      <div>
        {isFetchingNextPage && <Loader />}
        {!hasNextPage && allAlbums.length > 0 && (
          <p className="text-center mt-8 text-gray-400">
            You've reached the end of your liked albums.
          </p>
        )}
      </div>
    </div>
  )
}

export default LikedAlbumsPage
