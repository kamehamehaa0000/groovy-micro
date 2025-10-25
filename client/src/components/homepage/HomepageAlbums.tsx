import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchPublicAlbums } from '../../service/albumService'
import { AlbumCard } from '../cards/AlbumCard'
import AlbumsSkeleton from '../skeletons/AlbumsSkeleton'

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
      <div className="w-full p-4">
        <h2 className="text-xl font-bold mb-4 text-stone-900 dark:text-stone-300">
          Albums
        </h2>
        <AlbumsSkeleton />
      </div>
    )
  }

  return (
    <div className="w-full bg-white dark:bg-stone-950 p-3">
      <section>
        <div className="w-full px-3 flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold mb-4  text-stone-900 dark:text-stone-300">
            Albums
          </h2>
          <Link to="/albums" className="text-sm border px-2 py-1 rounded-lg ">
            See all
          </Link>
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
        <div className="text-stone-500 text-center py-8">No albums found</div>
      )}
    </div>
  )
}

export default HomepageAlbums
