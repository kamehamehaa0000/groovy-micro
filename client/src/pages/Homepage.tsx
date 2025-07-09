import { Link } from 'react-router'
import { useAuthStore } from '../store/auth-store'
import {
  useCreatePlaylistModalStore,
  useSigninPromptModalStore,
} from '../store/modal-store'
import { useEffect, useState } from 'react'
import axiosInstance from '../utils/axios-interceptor'
import { usePlayerStore } from '../store/player-store' // Import store and type
import type { Song } from '../store/player-store'
import { BiHeart, BiPause, BiPlay, BiPlus, BiShare } from 'react-icons/bi'
import { FiMoreHorizontal } from 'react-icons/fi'
import { SongCompactCardA } from '../components/cards/SongCompactCardA'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'

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
  const BaseUrl = 'http://localhost:3000/api/v1/query/single/songs/all/public'

  useEffect(() => {
    async function fetchUserSongs() {
      try {
        const { data } = await axiosInstance.get(BaseUrl)
        setSongs(data.songs)
        actions.setQueue(data.songs)
      } catch (error) {
        console.error('Failed to fetch songs:', error)
      }
    }
    fetchUserSongs()
  }, [actions])

  if (!songs.length) return <p className="text-gray-600">Loading songs...</p>

  return (
    <div className="w-full max-w-2xl">
      <ul className="space-y-2 max-w-sm">
        {songs.map((song: Song) => (
          <SongCompactCardA key={song._id} song={song} />
        ))}
      </ul>
      <ul className="space-y-2 max-w-sm">
        {songs.map((song: Song) => (
          <SongCompactCardB key={song._id} song={song} />
        ))}
      </ul>
    </div>
  )
}
