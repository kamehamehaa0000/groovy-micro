import { useInfiniteQuery } from '@tanstack/react-query'
import { searchAlbums } from '../service/searchService'
import { type Album } from './AlbumDetailPage'
import { useSearchParams } from 'react-router'
import { AlbumCard } from '../components/cards/AlbumCard'

const SearchAlbumsPage = () => {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['searchAlbums', query],
    queryFn: ({ pageParam = 1 }) => searchAlbums(query, pageParam),
    getNextPageParam: (lastPage: any) => {
      if (lastPage.pagination.hasNextPage) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
    initialPageParam: 1,
  })

  return (
    <div className=" p-4 sm:p-6 lg:p-8 w-full">
      <h1 className="text-2xl font-bold mb-4">Search Results for "{query}"</h1>

      {isLoading && <p>Loading...</p>}
      {isError && <p>Error searching.</p>}
      {!data && <p>No albums found.</p>}
      {data && data.pages[0].data.length === 0 && <p>No albums found.</p>}
      {data && (
        <div>
          {data.pages.map((page: any) =>
            page.data.map((album: Album) => (
              <AlbumCard key={album._id} album={album} />
            ))
          )}
        </div>
      )}

      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading more...' : 'Load More'}
        </button>
      )}
    </div>
  )
}

export default SearchAlbumsPage
