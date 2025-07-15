import { useEffect, useState } from 'react'
import { usePlayerStore, type Song } from '../../store/player-store'
import { useAuthStore } from '../../store/auth-store'
import {
  useAddToPlaylistModalStore,
  useSigninPromptModalStore,
} from '../../store/modal-store'
import { BiHeart, BiPause, BiPlay, BiPlus, BiShare } from 'react-icons/bi'
import { FiMoreHorizontal } from 'react-icons/fi'
import { Link } from 'react-router'

export function SongCompactCardA({
  song,
  isLikedByCurrentUser,
}: {
  song: Song
  isLikedByCurrentUser?: boolean
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLiked, setIsLiked] = useState(isLikedByCurrentUser || false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const { open } = useSigninPromptModalStore()
  const { isPlaying: playerIsPlaying, currentSong, actions } = usePlayerStore()
  const { open: openAddToPlaylist, setSongId } = useAddToPlaylistModalStore()
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
    setSongId(song._id)
    openAddToPlaylist()
    setIsDropdownOpen(false)
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
          <Link
            to={`/songs/song/${song._id}`}
            className={
              'font-semibold text-gray-900 truncate' +
              (isPlaying ? ' text-orange-600' : '')
            }
          >
            {song.metadata.title ?? 'Song Title'}
          </Link>

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
            onClick={handleAddToPlaylist}
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
          >
            <BiPlus className={`w-4 h-4`} />
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
