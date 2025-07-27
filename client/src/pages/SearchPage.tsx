import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchAll } from '../service/searchService'
import { type Song, type Playlist } from '../types'
import { Link } from 'react-router'
import type { Album } from './AlbumDetailPage'
import { useDebounce } from '../hooks/useDebounce'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { AlbumCard } from '../components/cards/AlbumCard'
import { PlaylistCard } from '../components/cards/PlaylistCard'
import { BiX } from 'react-icons/bi'
import Avatar from 'boring-avatars'

const SearchPage = () => {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 500)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['searchAll', debouncedQuery],
    queryFn: () => searchAll(debouncedQuery),
    enabled: !!debouncedQuery,
  })

  return (
    <div className=" p-4 sm:p-6 lg:p-8 w-full">
      <div className="mb-4 flex flex-col sm:flex-row items-center gap-4  ">
        <h1 className="text-2xl font-bold">Search</h1>
        <div className="flex items-center gap-2 flex-1 ">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className=" w-full peer border border-gray-300 z-[21] px-6 py-2 rounded-xl outline-none duration-200 ring-1 ring-[transparent] focus:ring-orange-600"
            placeholder=" for your groovy"
          />{' '}
          <button
            onClick={() => setQuery('')}
            title="Clear Search Query"
            className="text-gray-500 bg-gray-100 rounded-full hover:text-gray-700 p-2"
          >
            <BiX />
          </button>
        </div>
      </div>

      {isLoading && <p>Loading...</p>}
      {isError && <p>Error searching.</p>}
      {!data && <p>No results found.</p>}
      {data && (
        <div className="mt-6">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Songs{' '}
              </h2>
              {data.songs.length > 0 && (
                <Link
                  to={`/search/songs?q=${debouncedQuery}`}
                  className="text-xs  hover:text-orange-700"
                >
                  See More
                </Link>
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6 ">
              {!data.songs.length && <p>No results found.</p>}
              {data.songs.map((song: Song) => (
                <SongCompactCardA key={song._id} song={song} />
              ))}
            </div>
          </section>

          <section className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Albums{' '}
              </h2>
              {data.albums.length > 0 && (
                <Link
                  to={`/search/albums?q=${debouncedQuery}`}
                  className="text-xs  hover:text-orange-700"
                >
                  See More
                </Link>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6 ">
              {!data.albums.length && <p>No results found.</p>}
              {data.albums.map((album: Album) => (
                <AlbumCard key={album._id} album={album} />
              ))}
            </div>
            {data.albums.length > 0 && (
              <Link to={`/search/albums?q=${debouncedQuery}`}>See More</Link>
            )}
          </section>

          <section className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Playlists{' '}
              </h2>
              {data.playlists.length > 0 && (
                <Link
                  to={`/search/playlists?q=${debouncedQuery}`}
                  className="text-xs  hover:text-orange-700"
                >
                  See More
                </Link>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6 ">
              {!data.playlists.length && <p>No results found.</p>}
              {data.playlists.map((playlist: Playlist) => (
                <PlaylistCard key={playlist._id} playlist={playlist} />
              ))}
            </div>
            {data.playlists.length > 0 && (
              <Link to={`/search/playlists?q=${debouncedQuery}`}>See More</Link>
            )}
          </section>
          <section className="mt-4">
            <h2 className="text-2xl font-bold mb-2">Artists</h2>
            <div className="flex items-center gap-4 flex-wrap my-3 sm:my-6 ">
              {!data.artists.length && <p>No results found.</p>}
              {data.artists.map((artist) => (
                <div
                  className="cursor-pointer hover:text-orange-600 flex items-center gap-2 shadow px-2 py-1 rounded-xl "
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
                    to={`/search/artists?q=${artist.displayName}`}
                    className="text-sm"
                    title={artist.displayName}
                  >
                    {artist.displayName}
                  </Link>
                </div>
              ))}
            </div>
            {data.artists.length > 0 && (
              <Link to={`/search/artists?q=${debouncedQuery}`}>See More</Link>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default SearchPage
