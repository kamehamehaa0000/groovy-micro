import { Link } from 'react-router'
import { useAuthStore } from '../store/auth-store'
import { useSigninPromptModalStore } from '../store/modal-store'
import { useEffect, useState } from 'react'
import axiosInstance from '../utils/axios-interceptor'
import { usePlayerStore } from '../store/player-store' // Import store and type
import type { Song } from '../store/player-store'

export const HomePage = () => {
  const { isAuthenticated, user, logout } = useAuthStore()
  const { open } = useSigninPromptModalStore()

  return (
    <div className="p-8 flex flex-col items-center justify-center h-full ">
      <h1 className="text-2xl font-bold text-center mb-8">
        Welcome to the Groovy Microservices Project
      </h1>

      <button
        onClick={() =>
          !isAuthenticated ? open() : alert('You are already logged in!')
        }
        className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors mb-6"
      >
        Play Music
      </button>
      <ShowSongs />

      {!isAuthenticated ? (
        <Link to="/login" className="text-blue-500 hover:underline">
          Sign In
        </Link>
      ) : (
        <div className="text-center space-y-2">
          <p className="font-semibold">{user?.displayName}</p>
          <p className="text-gray-600">{user?.email}</p>
          <button
            className="text-red-500 hover:underline"
            onClick={() => logout()}
          >
            Logout
          </button>
        </div>
      )}
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
      <h2 className="text-xl font-bold mb-4">Available Songs</h2>
      <ul className="space-y-2">
        {songs.map((song) => (
          <li
            key={song._id}
            className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => actions.loadSong(song, true)}
          >
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                <img
                  src={song.metadata.album.coverUrl}
                  alt={song.metadata.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {song.metadata.title}
                </h3>
              </div>
              <button className="text-orange-500 hover:text-orange-600 p-2 rounded-full hover:bg-orange-50 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
