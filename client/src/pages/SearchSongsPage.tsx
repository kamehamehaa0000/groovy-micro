import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { searchSongs } from '../service/searchService'
import { type Song } from '../types'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'

const SearchSongsPage = () => {
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
    queryKey: ['searchSongs', query],
    queryFn: ({ pageParam = 1 }) => searchSongs(query, pageParam),
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
      {data && data.pages[0].data.length === 0 && <p>No Songs found.</p>}

      {data && (
        <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6">
          {data.pages.map((page) =>
            page.data.map((song: Song) => (
              <SongCompactCardA key={song._id} song={song} />
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

export default SearchSongsPage
