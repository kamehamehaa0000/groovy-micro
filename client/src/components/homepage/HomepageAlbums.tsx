import { useEffect, useState } from 'react'

import { Link } from 'react-router'
import { fetchPublicAlbums } from '../../service/albumService'
import { AlbumCard } from '../cards/AlbumCard'

const HomepageAlbums = () => {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAlbums() {
      try {
        const data = await fetchPublicAlbums(1, 12)
        setAlbums(data.albums)
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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold mb-4"> All Albums</h1>
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

  return (
    <div className="w-full bg-white p-3">
      <section>
        {' '}
        <div className="w-full flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold mb-4 text-gray-900">All Albums</h2>
          <Link to="/albums">See all</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8  gap-3">
          {albums.length > 0 &&
            albums?.map((album: any) => (
              <AlbumCard key={album._id} album={album} />
            ))}
        </div>
      </section>

      {/* Show message if no songs */}
      {albums.length === 0 && !loading && (
        <div className="text-gray-500 text-center py-8">No albums found</div>
      )}
    </div>
  )
}

export default HomepageAlbums
