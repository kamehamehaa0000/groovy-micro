import { useEffect, useState } from 'react'

import { Link } from 'react-router'
import { fetchPublicAlbums } from '../../service/albumService'
import { AlbumCard } from '../cards/AlbumCard'
import { BiLoader } from 'react-icons/bi'

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
      <div className="space-y-4 w-full h-full flex flex-col items-center justify-center">
        <BiLoader className="animate-spin text-black" />{' '}
        <h1 className="text-lg font-semibold mb-4 text-gray-700">
          Loading Albums
        </h1>
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
        <div className="flex flex-wrap gap-4 items-center justify-start">
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
