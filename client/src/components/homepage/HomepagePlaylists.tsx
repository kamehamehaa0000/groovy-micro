import { useEffect, useState } from 'react'

import { getPublicPlaylists } from '../../service/playlistService'
import { Link } from 'react-router'
import { PlaylistCard } from '../cards/PlaylistCard'
import { BiLoader } from 'react-icons/bi'

const HomepagePlaylists = () => {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAlbums() {
      try {
        const data = await getPublicPlaylists(1, 12)
        setPlaylists(data.playlists)
      } catch (error) {
        console.error('Failed to fetch albums:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchAlbums()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4 w-full h-full flex flex-col items-center justify-center">
        <BiLoader className="animate-spin text-black" />{' '}
        <h1 className="text-lg font-semibold mb-4 text-gray-700">
          Loading Playlists
        </h1>
      </div>
    )
  }

  return (
    <div className="w-full bg-white p-3">
      <section>
        {' '}
        <div className="w-full flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold mb-4 text-gray-900">
            All Playlists
          </h2>
          <Link to="/playlists">See all</Link>
        </div>
        <div className="flex flex-wrap gap-4 items-center justify-start">
          {playlists.length > 0 &&
            playlists?.map((playlist: any) => (
              <PlaylistCard key={playlist._id} playlist={playlist} />
            ))}
        </div>
      </section>

      {/* Show message if no songs */}
      {playlists.length === 0 && !loading && (
        <div className="text-gray-500 text-center py-8">No playlists found</div>
      )}
    </div>
  )
}
export default HomepagePlaylists
