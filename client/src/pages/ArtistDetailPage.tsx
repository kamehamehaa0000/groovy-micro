import {
  fetchAlbumsByArtists,
  fetchArtistById,
  fetchSongsByArtists,
} from '../service/artistService'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Loader } from '../components/shared/Loader'
import { useParams } from 'react-router'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { AlbumCard } from '../components/cards/AlbumCard'
import { useEffect, useState } from 'react'
import Avatar from 'boring-avatars'

const ArtistDetailPage = () => {
  const { artistId } = useParams<{ artistId: string }>()
  const [artist, setArtist] = useState<{
    displayName: string
    _id: string
  } | null>(null)

  const {
    data: songsData,
    fetchNextPage: fetchNextSongs,
    hasNextPage: hasNextSongsPage,
    isFetchingNextPage: isFetchingNextSongs,
    isLoading: isLoadingSongs,
    isError: isErrorSongs,
  } = useInfiniteQuery({
    queryKey: ['artistSongs', artistId],
    queryFn: ({ pageParam = 1 }) =>
      fetchSongsByArtists(artistId!, pageParam, 10),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.currentPage < lastPage.pagination.totalPages) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
    enabled: !!artistId,
  })

  const {
    data: albumsData,
    fetchNextPage: fetchNextAlbums,
    hasNextPage: hasNextAlbumsPage,
    isFetchingNextPage: isFetchingNextAlbums,
    isLoading: isLoadingAlbums,
    isError: isErrorAlbums,
  } = useInfiniteQuery({
    queryKey: ['artistAlbums', artistId],
    queryFn: ({ pageParam = 1 }) =>
      fetchAlbumsByArtists(artistId!, pageParam, 5),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.currentPage < lastPage.totalPages) {
        return lastPage.currentPage + 1
      }
      return undefined
    },
    enabled: !!artistId,
  })

  useEffect(() => {
    const fetchArtist = async () => {
      try {
        if (!artistId) return
        const { artist } = await fetchArtistById(artistId)
        setArtist(artist)
      } catch (error) {
        console.error('Error fetching artist details:', error)
      }
    }

    fetchArtist()
  }, [fetchNextSongs, fetchNextAlbums])

  if (isLoadingSongs || isLoadingAlbums) {
    return <Loader />
  }

  if (isErrorSongs || isErrorAlbums) {
    return (
      <div className="text-red-500 text-center p-4">
        Error fetching artist details.
      </div>
    )
  }

  const allSongs = songsData?.pages.flatMap((page) => page.songs) || []
  const allAlbums = albumsData?.pages.flatMap((page) => page.albums) || []

  return (
    <div className=" p-2 md:p-6 bg-white">
      {artist && (
        <div className="flex items-center gap-4 py-4 px-1 md:px-4 mb-10">
          <Avatar
            size={80}
            name={artist._id}
            variant="marble"
            colors={['#0a0310', '#49007e', '#ff005b', '#ff7d10', '#ffb238']}
          />
          <h1 className="text-2xl font-bold">{artist.displayName}</h1>
        </div>
      )}

      <section className="mb-12 px-1 sm:px-4">
        <h2 className="text-xl font-semibold mb-4">Songs by Artist - </h2>
        {allSongs.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-4 items-center">
              {allSongs.map((song: any) => (
                <SongCompactCardA key={song._id} song={song} />
              ))}
            </div>
            {hasNextSongsPage && (
              <div className="text-center mt-4">
                <button
                  onClick={() => fetchNextSongs()}
                  disabled={isFetchingNextSongs}
                >
                  {isFetchingNextSongs ? 'Loading...' : 'See More Songs'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p>No songs found for this artist.</p>
        )}
      </section>

      <section className="mb-12 px-1 sm:px-4">
        <h2 className="text-xl font-semibold mb-4">Albums by Artist - </h2>
        {allAlbums.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-4 items-center">
              {allAlbums.map((album: any) => (
                <AlbumCard key={album._id} album={album} />
              ))}
            </div>
            {hasNextAlbumsPage && (
              <div className="text-center mt-6">
                <button
                  onClick={() => fetchNextAlbums()}
                  disabled={isFetchingNextAlbums}
                >
                  {isFetchingNextAlbums ? 'Loading...' : 'See More Albums'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p>No albums found for this artist.</p>
        )}
      </section>
    </div>
  )
}
export default ArtistDetailPage
