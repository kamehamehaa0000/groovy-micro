import { useInfiniteQuery } from '@tanstack/react-query'

import { searchPlaylists } from '../service/searchService'
import { type Playlist } from '../types'
import { useSearchParams } from 'react-router'
import { PlaylistCard } from '../components/cards/PlaylistCard'

const SearchPlaylistsPage = () => {
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
    queryKey: ['searchPlaylists', query],
    queryFn: ({ pageParam = 1 }) => searchPlaylists(query, pageParam),
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
      {data && data.pages[0].data.length === 0 && <p>No Playlists found.</p>}

      {data && data.pages.length === 0 && <p>No playlists found.</p>}
      {data && (
        <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6">
          {data.pages.map((page: any) =>
            page.data.map((playlist: Playlist) => (
              <PlaylistCard key={playlist._id} playlist={playlist} />
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

export default SearchPlaylistsPage
