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

function SongCompactCardA({ song }: { song: Song }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [isInPlaylist, setIsInPlaylist] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const { open } = useSigninPromptModalStore()
  const { isPlaying: playerIsPlaying, currentSong, actions } = usePlayerStore()
  const handlePlaySong = () => {
    if (!isAuthenticated) {
      open()
      return
    }
    if (playerIsPlaying && currentSong?._id === song._id) {
      actions.pause()
    } else {
      actions.loadSong(song, true)
    }
  }
  const handleAddToPlaylist = () => {
    if (!isAuthenticated) {
      open()
      return
    }
    // openCreatePlaylist()
  }
  const handleAddToQueue = () => {
    if (!isAuthenticated) {
      open()
      return
    }
    const currentQueue = usePlayerStore.getState().queue ?? []
    actions.setQueue([...currentQueue, song])
    setIsDropdownOpen(false)
  }
  useEffect(() => {
    setIsPlaying(currentSong?._id === song._id && playerIsPlaying)
  }, [currentSong, song, playerIsPlaying])

  return (
    <div className="hover:bg-gray-50 border-b border-gray-100 p-4 transition-colors">
      <div className="flex items-center space-x-4">
        <div className="relative group">
          <button onClick={handlePlaySong} className="relative">
            <img
              src="https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/albums/e13b1b25-b10f-444b-8555-a4e558c6fe4f/cassette-tape.png"
              alt="Album cover"
              className="w-10 h-10 rounded object-cover bg-orange-700"
            />
            <div className="absolute inset-0 bg-black bg-opacity-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {isPlaying ? (
                <BiPause className="w-5 h-5 text-white" />
              ) : (
                <BiPlay className="w-5 h-5 text-white" />
              )}
            </div>
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={
              'font-semibold text-gray-900 truncate' +
              (isPlaying ? ' text-orange-600' : '')
            }
          >
            {song.metadata.title ?? 'Song Title'}
          </h3>

          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs text-gray-500">
              {song?.metadata?.artist?.displayName ?? 'Unknown Artist'}
            </span>
            <span className="text-xs text-gray-400">•</span>

            <span className="text-xs text-gray-500">
              {song?.metadata?.genre ?? 'Unknown Genre'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsLiked(!isLiked)}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <BiHeart
              className={`w-4 h-4 ${
                isLiked ? 'text-red-500 fill-current' : ''
              }`}
            />
          </button>
          <button
            onClick={() => setIsInPlaylist(!isInPlaylist)}
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
          >
            <BiPlus
              className={`w-4 h-4 ${isInPlaylist ? 'text-blue-500' : ''}`}
            />
          </button>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FiMoreHorizontal className="w-4 h-4" />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-2 w-48 z-10">
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2">
                  <BiShare className="w-4 h-4" />
                  <span>Share</span>
                </button>
                <button
                  onClick={handleAddToQueue}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <BiPlus className="w-4 h-4" />
                  <span>Add to Queue</span>
                </button>

                <hr className="my-1 border-gray-200" />
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  Go to Artist
                </button>
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  Go to Album
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  )
}

function SongCompactCardB({ song }: { song: Song }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  // const { open: openCreatePlaylist } = useCreatePlaylistModalStore()
  const [isInPlaylist, setIsInPlaylist] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const { open } = useSigninPromptModalStore()
  const { isPlaying: playerIsPlaying, currentSong, actions } = usePlayerStore()
  const handlePlaySong = () => {
    if (!isAuthenticated) {
      open()
      return
    }
    if (playerIsPlaying && currentSong?._id === song._id) {
      actions.pause()
    } else {
      actions.loadSong(song, true)
    }
  }
  const handleAddToPlaylist = () => {
    if (!isAuthenticated) {
      open()
      return
    }
    // openCreatePlaylist()
  }
  const handleAddToQueue = () => {
    if (!isAuthenticated) {
      open()
      return
    }
    const currentQueue = usePlayerStore.getState().queue ?? []
    actions.setQueue([...currentQueue, song])
    setIsDropdownOpen(false)
  }
  useEffect(() => {
    setIsPlaying(currentSong?._id === song._id && playerIsPlaying)
  }, [currentSong, song, playerIsPlaying])

  return (
    <div className="hover:bg-gray-50 border-b border-gray-100 p-4 transition-colors">
      <div className="flex items-center space-x-4">
        <div className="text-sm text-gray-400 w-8 text-center">
          {song?.metadata?.trackNumber}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={
              'font-semibold text-gray-900 truncate' +
              (isPlaying ? ' text-orange-600' : '')
            }
          >
            {song.metadata.title ?? 'Song Title'}
          </h3>

          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs text-gray-500">
              {song?.metadata?.artist?.displayName ?? 'Unknown Artist'}
            </span>
            <span className="text-xs text-gray-400">•</span>

            <span className="text-xs text-gray-500">
              {song?.metadata?.genre ?? 'Unknown Genre'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePlaySong}
            className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
          >
            {isPlaying ? (
              <BiPause className="w-5 h-5 text-gray-400 hover:text-orange-600" />
            ) : (
              <BiPlay className="w-5 h-5 text-gray-400 hover:text-orange-600" />
            )}
          </button>
          <button
            onClick={() => setIsLiked(!isLiked)}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <BiHeart
              className={`w-4 h-4 ${
                isLiked ? 'text-red-500 fill-current' : ''
              }`}
            />
          </button>
          <button
            onClick={handleAddToPlaylist}
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
          >
            <BiPlus
              className={`w-4 h-4 ${isInPlaylist ? 'text-blue-500' : ''}`}
            />
          </button>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FiMoreHorizontal className="w-4 h-4" />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-2 w-48 z-10">
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2">
                  <BiShare className="w-4 h-4" />
                  <span>Share</span>
                </button>
                <button
                  onClick={handleAddToQueue}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <BiPlus className="w-4 h-4" />
                  <span>Add to Queue</span>
                </button>

                <hr className="my-1 border-gray-200" />
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  Go to Artist
                </button>
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  Go to Album
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  )
}
