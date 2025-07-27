import { useInfiniteQuery } from '@tanstack/react-query'
import { searchArtists } from '../service/searchService'
import { Link, useSearchParams } from 'react-router'
import Avatar from 'boring-avatars'

const SearchArtistsPage = () => {
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
    queryKey: ['searchArtists', query],
    queryFn: ({ pageParam = 1 }) => searchArtists(query, pageParam),
    getNextPageParam: (lastPage: any) => {
      console.log('Last page:', lastPage)
      if (lastPage.pagination.hasNextPage) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
    initialPageParam: 1,
  })
  console.log(data)
  return (
    <div className=" p-4 sm:p-6 lg:p-8 w-full">
      <h1 className="text-2xl font-bold mb-4">Search Results for "{query}"</h1>

      {isLoading && <p>Loading...</p>}
      {isError && <p>Error searching.</p>}
      {!data && <p>No artists found.</p>}
      {data && (
        <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6">
          {data?.pages?.map((page: any) =>
            page.data.map((artist: { _id: string; displayName: string }) => (
              <div
                className=" max-w-3xs cursor-pointer hover:text-orange-600 flex items-center gap-2 shadow px-2 py-1 rounded-xl "
                key={artist._id}
              >
                <Avatar
                  name={artist._id}
                  colors={[
                    '#0a0310',
                    '#49007e',
                    '#ff005b',
                    '#ff7d10',
                    '#ffb238',
                  ]}
                  variant="marble"
                  size={40}
                />

                <Link
                  to={`/artists/artist/${artist._id}`}
                  className="text-sm"
                  title={artist.displayName}
                >
                  {artist.displayName}
                </Link>
              </div>
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

export default SearchArtistsPage
