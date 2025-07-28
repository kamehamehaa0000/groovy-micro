import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import { usePlayerStore } from '../store/player-store'
import toast from 'react-hot-toast'
import { BiEdit, BiHeart, BiPlusCircle, BiShare } from 'react-icons/bi'
import albumPlaceholder from '../assets/albumPlaceholder.svg'
import {
  fetchPlaylistById,
  togglePlaylistLike,
} from '../service/playlistService'
import CompactComments from '../components/comments/CompactComments'

import { PlaylistEditModal } from '../components/shared/PlaylistEditModal'
import type { Playlist } from '../types'

const PlaylistDetailPage = () => {
  const param = useParams<{ id: string }>()
  const playlistId = param.id
  const [playlist, setPlaylist] = useState<Playlist>({} as Playlist)
  const [loading, setLoading] = useState(true)
  const [likeLoading, setLikeLoading] = useState(false)
  const [inEditMode, setInEditMode] = useState(false)
  const { isPlaying, queue, shuffledQueue, isShuffled, actions } =
    usePlayerStore()

  useEffect(() => {
    async function fetchPlaylist() {
      if (!playlistId) return
      try {
        setLoading(true)
        const data = await fetchPlaylistById(playlistId)
        setPlaylist(data)
      } catch (error) {
        console.error('Failed to fetch playlist:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchPlaylist()
  }, [playlistId])

  const handlePlayPlaylist = () => {
    actions.setQueue([])
    const songs = playlist.songs.map((song) => song.songId)
    actions.loadQueue(songs, 0)
  }
  const handleAddPlaylistToQueue = () => {
    if (!playlist || !playlist.songs) return
    if (isShuffled) {
      actions.setQueue([
        ...shuffledQueue,
        ...playlist.songs.map((song) => song.songId),
      ])
      toast.success(`Playlist added to shuffled queue`)
    } else {
      actions.setQueue([...queue, ...playlist.songs.map((song) => song.songId)])
      toast.success(`Playlist added to queue`)
    }
  }
  const handleLikePlaylist = async () => {
    try {
      if (!playlist._id) return
      setLikeLoading(true)
      await togglePlaylistLike(playlist._id)
      setPlaylist((prev) => ({
        ...prev,
        isLikedByCurrentUser: !prev.isLikedByCurrentUser,
      }))
    } catch (error) {
      console.error('Failed to like album:', error)
      toast.error('Failed to like album')
    } finally {
      setLikeLoading(false)
    }
  }
  const handleSharePlaylist = () => {
    const shareData = {
      title: playlist.title,
      text: `Check out this playlist: ${playlist.title} by ${playlist.creator.displayName}`,
      url: `${window.location.origin}/playlists/playlist/${playlistId}`,
    }
    if (navigator.share) {
      navigator
        .share(shareData)
        .then(() => toast.success('Playlist shared successfully!'))
        .catch(() => toast.error('Failed to share playlist'))
    } else {
      toast.error('Sharing not supported in this browser')
    }
  }

  const handleToggleEditMode = () => {
    setInEditMode((prev) => !prev)
  }

  if (!playlist || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading playlist details...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 rounded-xl h-full">
      <div className="flex flex-col lg:flex-row h-full px-4 sm:px-6 py-4">
        {/* Left Panel - Playlist Art & Controls */}
        <div className="lg:w-96 md:border-r  border-gray-200 p-4 sm:p-6">
          <div className="sticky top-6">
            {/* playlist Art */}
            <img
              src={playlist.coverUrl || albumPlaceholder}
              alt={playlist.title}
              className="w-full aspect-square rounded-lg mb-6 flex items-center justify-center "
            />

            {/* Controls */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePlayPlaylist}
                className="bg-gray-900 text-white p-3 rounded-full hover:bg-gray-800 transition-colors"
              >
                {isPlaying ? (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleLikePlaylist}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  {likeLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2  border-gray-900" />
                  ) : (
                    <BiHeart
                      className={`w-5 h-5 ${
                        playlist.isLikedByCurrentUser
                          ? 'text-red-500 fill-current'
                          : ''
                      }`}
                    />
                  )}
                </button>
                <button
                  onClick={handleAddPlaylistToQueue}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <BiPlusCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={handleToggleEditMode}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <BiEdit className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSharePlaylist}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <BiShare className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/** Playlist Details */}
            <div className="mb-8">
              <h1 className="text-3xl font-light mb-1">{playlist?.title}</h1>
              <p className="text-gray-600 text-sm">
                {playlist?.description ||
                  'No description available for this playlist.'}
              </p>
              <div className="text-md text-gray-600 pt-4">
                <p>
                  {playlist.creator.displayName}
                  {playlist.collaborators &&
                    playlist.collaborators.map((collaborator) => (
                      <span
                        key={collaborator._id}
                        className="text-gray-600 mx-2"
                      >
                        | {collaborator.displayName}
                      </span>
                    ))}
                </p>
                <p className="text-muted-foreground text-sm">
                  <p className="text-gray-500 mt-1">
                    {playlist?.songs?.length} tracks
                  </p>
                  {playlist.likedBy && (
                    <p className="text-sm text-gray-500 mt-1">
                      Liked by {playlist.likedBy.length} user
                      {playlist.likedBy.length > 1 ? 's' : ''}
                    </p>
                  )}
                  {playlist.streamCount && (
                    <p className="text-sm text-gray-500 mt-1">
                      {playlist.streamCount} Total Play
                      {playlist.streamCount > 1 ? 's' : ''}
                    </p>
                  )}
                </p>

                <p className="text-sm text-gray-500 mt-1">
                  {new Date(playlist.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>{' '}
        {/*Center panel - Tracks */}
        <div className="flex-1 py-4 sm:p-6 lg:p-8 md:h-full md:overflow-y-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tracks</h2>
          <div>
            {playlist?.songs
              .sort((a, b) => a.order - b.order)
              .map((song: any) => (
                <SongCompactCardB song={song.songId} key={song.songId._id} />
              ))}
          </div>
        </div>
        {/* Right Panel - Additional Info */}
        <div className="lg:w-1/3 md:border-l  border-gray-200 py-2 px-0.5 sm:p-6">
          <CompactComments entityId={playlist._id} entityType="playlist" />
        </div>
        <PlaylistEditModal
          isOpen={inEditMode}
          onClose={() => setInEditMode(false)}
          playlistId={playlist._id}
        />
      </div>
    </div>
  )
}

export default PlaylistDetailPage
