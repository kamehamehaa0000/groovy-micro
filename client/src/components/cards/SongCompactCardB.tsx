import { useJamActions, useIsJamming } from '../../store/jam-store'

import { useEffect, useState } from 'react'
import { usePlayerStore } from '../../store/player-store'
import { useAuthStore } from '../../store/auth-store'
import {
  useAddToPlaylistModalStore,
  useSigninPromptModalStore,
} from '../../store/modal-store'
import { BiHeart, BiPause, BiPlay, BiPlus, BiShare } from 'react-icons/bi'
import { FiMoreHorizontal } from 'react-icons/fi'
import { Link } from 'react-router'
import { addSongToListenLater } from '../../service/libraryService'
import toast from 'react-hot-toast'
import { toggleLikeSong } from '../../service/songsService'
import type { Song } from '../../types'
import { MdOutlineNavigateNext } from 'react-icons/md'

export function SongCompactCardB({
  song: initialSong,
}: Readonly<{ song: Song }>) {
  const [song, setSong] = useState(initialSong)
  const [likeLoading, setLikeLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const { open } = useSigninPromptModalStore()
  const { isPlaying: playerIsPlaying, currentSong, actions } = usePlayerStore()
  const { open: openAddToPlaylist, setSongId } = useAddToPlaylistModalStore()
  const isJamming = useIsJamming()
  const { addToQueue: jamAddToQueue, changeSong: jamChangeSong } =
    useJamActions()

  useEffect(() => {
    setSong(initialSong)
  }, [initialSong])

  const handlePlaySong = () => {
    if (!isAuthenticated) {
      open()
      return
    }

    if (isJamming) {
      jamChangeSong(song._id)
    } else {
      if (playerIsPlaying && currentSong?._id === song._id) {
        actions.pause()
      } else {
        actions.loadSong(song, true)
      }
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
  const handleAddToListenLater = async () => {
    if (!isAuthenticated) {
      open()
      return
    }
    try {
      await addSongToListenLater(song._id)
      toast.success('Song added to Listen Later')
    } catch (error) {
      error && toast.error('Failed to add song to Listen Later')
    }
    setIsDropdownOpen(false)
  }
  const handleAddToQueue = () => {
    if (!isAuthenticated) {
      open()
      return
    }

    if (isJamming) {
      jamAddToQueue(song._id)
    } else {
      const currentQueue = usePlayerStore.getState().queue ?? []
      actions.setQueue([...currentQueue, song])
    }
    setIsDropdownOpen(false)
  }

  const handleLikeSong = async () => {
    if (!isAuthenticated) {
      open()
      return
    }
    if (likeLoading) return
    try {
      setLikeLoading(true)
      const wasLiked = song.isLikedByCurrentUser
      await toggleLikeSong(song._id)
      setSong((prev) => ({
        ...prev,
        isLikedByCurrentUser: !wasLiked,
      }))
    } catch (error) {
      error && toast.error('An error occurred while liking the song')
    } finally {
      setLikeLoading(false)
    }
  }

  const handleShareSong = () => {
    const shareData = {
      title: song.metadata.title,
      text: `Check out this song: ${song.metadata.title} by ${song.metadata.artist.displayName}`,
      url: `${window.location.origin}/songs/song/${initialSong._id}`,
    }
    if (navigator.share) {
      navigator
        .share(shareData)
        .then(() => toast.success('Song shared successfully!'))
        .catch(() => toast.error('Failed to share song'))
    } else {
      toast.error('Sharing not supported in this browser')
    }
    setIsDropdownOpen(false)
  }
  useEffect(() => {
    setIsPlaying(currentSong?._id === song._id && playerIsPlaying)
  }, [currentSong, song, playerIsPlaying])

  return (
    <div className="hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 px-4 py-2  transition-colors min-w-3xs rounded-xl">
      <div className="flex items-center space-x-4">
        <div className="text-sm text-gray-400 w-8 text-center">
          {song?.metadata?.trackNumber}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            to={`/songs/song/${song._id}`}
            className={
              'font-semibold text-gray-900 dark:text-gray-300 truncate' +
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
            onClick={handleLikeSong}
            disabled={likeLoading}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            {likeLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
            ) : (
              <BiHeart
                className={`w-4 h-4 transition-colors ${
                  song.isLikedByCurrentUser ? 'text-red-500 fill-current' : ''
                }`}
              />
            )}
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
              <div className="absolute right-0 top-8 bg-white dark:text-gray-300 text-gray-900 dark:bg-zinc-950 border  rounded-lg shadow-lg py-2 w-48 z-10">
                <button
                  onClick={handleShareSong}
                  className="w-full px-4 py-2 text-left text-sm dark:hover:bg-zinc-800 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <BiShare className="w-4 h-4" />
                  <span>Share</span>
                </button>
                <button
                  onClick={handleAddToQueue}
                  className="w-full px-4 py-2 text-left text-sm dark:hover:bg-zinc-800 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <BiPlus className="w-4 h-4" />
                  <span>Add to Queue</span>
                </button>
                <button
                  onClick={handleAddToListenLater}
                  className="w-full px-4 py-2 text-left text-sm dark:hover:bg-zinc-800 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <BiPlus className="w-4 h-4" />
                  <span>Add to Listen Later</span>
                </button>
                <button
                  onClick={handleAddToListenLater}
                  className="w-full px-4 py-2 text-left text-sm dark:hover:bg-zinc-800 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <MdOutlineNavigateNext className="w-4 h-4" />
                  <Link
                    to={`/artists/artist/${song?.metadata?.artist?._id}`}
                    className=" dark:hover:bg-zinc-800 hover:bg-gray-50"
                  >
                    Go to Artist
                  </Link>
                </button>
                <button
                  onClick={handleAddToListenLater}
                  className="w-full px-4 py-2 text-left text-sm dark:hover:bg-zinc-800 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <MdOutlineNavigateNext className="w-4 h-4" />
                  <Link
                    to={`/albums/album/${song?.metadata?.album?._id}`}
                    className=" dark:hover:bg-zinc-800 hover:bg-gray-50"
                  >
                    Go to Album
                  </Link>
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
