import { useEffect, useState } from 'react'
import { SongCompactCardA } from '../cards/SongCompactCardA'
import { fetchPublicSongs } from '../../service/songsService'
import { Link } from 'react-router'
import type { Song } from '../../types'
import { BiLoader } from 'react-icons/bi'

const HomepageSongs = () => {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSongs() {
      try {
        const data = await fetchPublicSongs(1, 12)
        setSongs(data.songs)
      } catch (error) {
        console.error('Failed to fetch songs:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchSongs()
  }, [])
  const firstColumn = songs.slice(0, 4)
  const secondColumn = songs.slice(4, 8)
  const thirdColumn = songs.slice(8, 12)
  const mobileColumn = songs.slice(0, 8)

  if (loading) {
    return (
      <div className="space-y-4 w-full h-full flex flex-col items-center justify-center">
        <BiLoader className="animate-spin text-black" />
        <h1 className="text-lg font-semibold mb-4 text-gray-700">
          Loading Songs
        </h1>
      </div>
    )
  }

  return (
    <div className="w-full  p-3">
      <div className="w-full flex justify-between items-center my-2 px-3">
        <h1 className="text-xl font-semibold "> Songs</h1>
        <Link to="/songs" className="text-sm border px-2 py-1 rounded-lg ">
          See all
        </Link>
      </div>

      {/* Mobile: Single column stack */}

      <div className="block md:hidden space-y-1 max-w-sm">
        {mobileColumn.map((song: Song) => (
          <SongCompactCardA key={song._id} song={song} />
        ))}
      </div>

      {/* Desktop: Two column layout like Spotify */}

      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 w-full gap-x-4">
        {/* First column - first 4 songs */}
        <div className="space-y-1">
          {firstColumn.map((song: Song) => (
            <SongCompactCardA key={song._id} song={song} />
          ))}
        </div>

        {/* Second column - next 4 songs */}
        <div className="space-y-1">
          {secondColumn.map((song: Song) => (
            <SongCompactCardA key={song._id} song={song} />
          ))}
        </div>
        {/* Third column - next 4 songs */}
        <div className="space-y-1 hidden lg:block">
          {thirdColumn.map((song: Song) => (
            <SongCompactCardA key={song._id} song={song} />
          ))}
        </div>
      </div>

      {/* Show message if no songs */}
      {songs.length === 0 && !loading && (
        <div className="text-gray-500 text-center py-8">No songs found</div>
      )}
    </div>
  )
}

export default HomepageSongs
