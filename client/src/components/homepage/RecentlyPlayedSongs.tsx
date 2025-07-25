import { useEffect, useState } from 'react'
import { getRecentlyPlayed } from '../../service/libraryService'
import { SongCompactCardA } from '../cards/SongCompactCardA'
import type { Song } from '../../types'

const RecentlyPlayedSongs = () => {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecentlyPlayedSongs = async () => {
      try {
        setLoading(true)
        const data = await getRecentlyPlayed()
        setSongs(data.songs)
      } catch (error) {
        console.error('Failed to fetch recently played songs:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchRecentlyPlayedSongs()
  }, [])
  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold mb-4">Recently Listened</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index + 'loading-public-songs'}
              className="flex items-center space-x-3 p-2 rounded-md bg-gray-100 animate-pulse"
            >
              <div className="w-12 h-12 bg-gray-300 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                <div className="h-3 bg-gray-300 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  // Split songs into two columns of 6 each
  const firstColumn = songs.slice(0, 4)
  const secondColumn = songs.slice(4, 8)
  const thirdColumn = songs.slice(8, 12)
  const mobileColumn = songs.slice(0, 8)

  return (
    <div className="w-full rounded-xl p-3">
      <div className="w-full flex justify-between items-center my-2 px-3">
        <h1 className="text-xl font-semibold ">Recently Played</h1>
      </div>

      {/* Mobile */}

      <div className="block md:hidden space-y-1 max-w-sm">
        {mobileColumn.map((song: Song) => (
          <SongCompactCardA key={song._id} song={song} />
        ))}
      </div>

      {/* Desktop */}

      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 w-full gap-x-4">
        <div className="space-y-1">
          {firstColumn.map((song: Song) => (
            <SongCompactCardA key={song._id} song={song} />
          ))}
        </div>

        <div className="space-y-1">
          {secondColumn.map((song: Song) => (
            <SongCompactCardA key={song._id} song={song} />
          ))}
        </div>

        <div className="space-y-1 hidden lg:block">
          {thirdColumn.map((song: Song) => (
            <SongCompactCardA key={song._id} song={song} />
          ))}
        </div>
      </div>

      {/* Show message if no songs */}
      {songs.length === 0 && !loading && (
        <div className="text-gray-500 text-center py-8">
          No recently played songs found
        </div>
      )}
    </div>
  )
}

export default RecentlyPlayedSongs
