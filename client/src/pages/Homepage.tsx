import { useEffect, useState } from 'react'
import axiosInstance from '../utils/axios-interceptor'
import { usePlayerStore } from '../store/player-store' // Import store and type
import type { Song } from '../store/player-store'

import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import { fetchPublicSongs } from '../service/songsService'

export const HomePage = () => {
  return (
    <div className="p-8 flex flex-col  h-full ">
      <div>
        <h1 className="text-xl font-semibold mb-4">Recently Added</h1>
        <ShowSongs />
      </div>
    </div>
  )
}

const ShowSongs = () => {
  const [songs, setSongs] = useState<Song[]>([])
  const { actions } = usePlayerStore()

  useEffect(() => {
    async function fetchSongs() {
      try {
        const data = await fetchPublicSongs(1, 30)
        setSongs(data.songs)
      } catch (error) {
        console.error('Failed to fetch songs:', error)
      }
    }
    fetchSongs()
  }, [actions])

  if (songs.length === 0)
    return <p className="text-gray-600">Loading songs...</p>

  return (
    <div className="w-full max-w-2xl">
      <ul className="space-y-2 max-w-sm">
        {songs.map((song: Song) => (
          <SongCompactCardA
            key={song._id}
            song={song}
            isLikedByCurrentUser={song.isLikedByCurrentUser}
          />
        ))}
      </ul>
      <ul className="space-y-2 max-w-sm">
        {songs.map((song: Song) => (
          <>
            <h1>{song.isLikedByCurrentUser ? 'Liked' : 'Not Liked'}</h1>
            <SongCompactCardB
              key={song._id}
              song={song}
              isLikedByCurrentUser={song.isLikedByCurrentUser}
            />
          </>
        ))}
      </ul>
    </div>
  )
}
