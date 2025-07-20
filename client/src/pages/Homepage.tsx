import { useEffect, useState } from 'react'
import { usePlayerStore, type Song } from '../store/player-store'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { fetchPublicSongs } from '../service/songsService'
import RecentlyPlayedSongs from '../components/homepage/RecentlyPlayedSongs'
import { Link } from 'react-router'
import { fetchPublicAlbums } from '../service/albumService'
import { BiPlay } from 'react-icons/bi'
import albumCoverArtPlaceholder from '../assets/albumPlaceholder.svg'
export const HomePage = () => {
  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col gap-y-5 h-full w-full">
      <RecentlyPlayedSongs />
      <HomepageSongsCard />
      <HomepageAlbums />
    </div>
  )
}

const HomepageSongsCard = () => {
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
      <div className="space-y-4 bg-white">
        <h1 className="text-2xl font-semibold mb-4"> All Songs</h1>
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
    <div className="w-full  p-3">
      <div className="w-full flex justify-between items-center my-2 px-3">
        <h1 className="text-xl font-semibold ">All Songs</h1>
        <Link to="/songs">See all</Link>
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
        <div className="text-gray-500 text-center py-8">
          No recently played songs found
        </div>
      )}
    </div>
  )
}

const HomepageAlbums = () => {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const { actions } = usePlayerStore()

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

  const handlePlayAlbum = (album: any) => {
    actions.setQueue([])
    console.log('Playing album:', album.songs)
    actions.loadQueue(album.songs, 0)
    actions.play()
  }

  const firstColumn = albums.slice(0, 4)
  const secondColumn = albums.slice(4, 8)
  const thirdColumn = albums.slice(8, 12)
  const mobileColumn = albums.slice(0, 8)

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
          <Link to="/songs">See all</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
          {albums.length > 0 &&
            albums?.map((album: any) => (
              <div
                key={album._id}
                className="group cursor-pointer hover:shadow-md transition-shadow bg-white rounded-lg shadow-sm p-3"
              >
                <div className="relative mb-2">
                  <img
                    src={
                      album.coverUrl ? album.coverUrl : albumCoverArtPlaceholder
                    }
                    alt="Album cover"
                    className="w-full aspect-square object-cover rounded-md"
                  />
                  <button
                    onClick={() => handlePlayAlbum(album)}
                    className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <BiPlay className="w-3 h-3 text-white ml-0.5" />
                  </button>
                </div>
                <div className="space-y-1">
                  <Link
                    to={`/albums/album/${album._id}`}
                    className="font-medium text-sm text-gray-900 truncate"
                  >
                    {album.title}
                  </Link>
                  <p className="text-xs text-gray-600 truncate">
                    {album.artist?.displayName || 'N/A'}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* Show message if no songs */}
      {albums.length === 0 && !loading && (
        <div className="text-gray-500 text-center py-8">
          No recently played songs found
        </div>
      )}
    </div>
  )
}

// const HomepagePlaylist = () => {
//   const [albums, setAlbums] = useState([])
//   const [loading, setLoading] = useState(true)
//   const { actions } = usePlayerStore()

//   useEffect(() => {
//     async function fetchAlbums() {
//       try {
//         const data = await fetchPublicAlbums(1, 12)
//         setAlbums(data.albums)
//       } catch (error) {
//         console.error('Failed to fetch albums:', error)
//       } finally {
//         setLoading(false)
//       }
//     }
//     fetchAlbums()
//   }, [])

//   const handlePlayPlaylist = (album: any) => {
//     actions.setQueue([])
//     actions.loadQueue(album.songs, 0)
//     actions.play()
//   }

//   const firstColumn = albums.slice(0, 4)
//   const secondColumn = albums.slice(4, 8)
//   const thirdColumn = albums.slice(8, 12)
//   const mobileColumn = albums.slice(0, 8)

//   if (loading) {
//     return (
//       <div className="space-y-4">
//         <h1 className="text-2xl font-semibold mb-4"> All Albums</h1>
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
//           {Array.from({ length: 12 }).map((_, index) => (
//             <div
//               key={index + 'loading-public-songs'}
//               className="flex items-center space-x-3 p-2 rounded-md bg-gray-100 animate-pulse"
//             >
//               <div className="w-12 h-12 bg-gray-300 rounded"></div>
//               <div className="flex-1 space-y-2">
//                 <div className="h-4 bg-gray-300 rounded w-3/4"></div>
//                 <div className="h-3 bg-gray-300 rounded w-1/2"></div>
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>
//     )
//   }

//   return (
//     <div className="w-full bg-white p-3">
//       <section>
//         {' '}
//         <div className="w-full flex justify-between items-center mb-4">
//           <h2 className="text-xl font-bold mb-4 text-gray-900">All Albums</h2>
//           <Link to="/songs">See all</Link>
//         </div>
//         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
//           {albums.length > 0 &&
//             albums?.map((album: any) => (
//               <div
//                 key={album._id}
//                 className="group cursor-pointer hover:shadow-md transition-shadow bg-white rounded-lg shadow-sm p-3"
//               >
//                 <div className="relative mb-2">
//                   <img
//                     src={
//                       album.coverUrl ? album.coverUrl : albumCoverArtPlaceholder
//                     }
//                     alt="Album cover"
//                     className="w-full aspect-square object-cover rounded-md"
//                   />
//                   <button
//                     onClick={() => handlePlayAlbum(album)}
//                     className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
//                   >
//                     <BiPlay className="w-3 h-3 text-white ml-0.5" />
//                   </button>
//                 </div>
//                 <div className="space-y-1">
//                   <h3 className="font-medium text-sm text-gray-900 truncate">
//                     {album.title}
//                   </h3>
//                   <p className="text-xs text-gray-600 truncate">
//                     {album.artist.displayName}
//                   </p>
//                 </div>
//               </div>
//             ))}
//         </div>
//       </section>

//       {/* Show message if no songs */}
//       {albums.length === 0 && !loading && (
//         <div className="text-gray-500 text-center py-8">
//           No recently played songs found
//         </div>
//       )}
//     </div>
//   )
// }
