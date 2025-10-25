import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import { usePlayerStore } from '../store/player-store'
import toast from 'react-hot-toast'
import { BiEdit, BiHeart, BiPlusCircle, BiShare, BiTrash } from 'react-icons/bi'
import albumPlaceholder from '../assets/albumPlaceholder.svg'
import CompactComments from '../components/comments/CompactComments'

import { PlaylistEditModal } from '../components/modals/PlaylistEditModal'
import {
  useDeletePlaylist,
  usePlaylistById,
  useTogglePlaylistLike,
} from '@/service/queries/playlistQuery'
import { useAuthStore } from '@/store/auth-store'

const PlaylistDetailPage = () => {
  const param = useParams<{ id: string }>()
  const playlistId = param.id
  const { user } = useAuthStore()

  const [inEditMode, setInEditMode] = useState(false)
  const { isPlaying, queue, shuffledQueue, isShuffled, actions } =
    usePlayerStore()
  const { mutate: deletePlaylist } = useDeletePlaylist({
    onSuccess: () => {
      navigate('/playlists')
    },
  })
  const { mutate: togglePlaylistLike, isPending: likeLoading } =
    useTogglePlaylistLike()
  const { data: playlist, isPending } = usePlaylistById(playlistId || '')

  const navigate = useNavigate()

  const handlePlayPlaylist = () => {
    if (!playlist || !playlist.songs) {
      return
    }
    actions.setQueue([])
    const songs = playlist.songs.map((song: any) => song.songId)
    actions.loadQueue(songs, 0)
  }
  const handleDeletePlaylist = async () => {
    if (!playlistId) return
    deletePlaylist(playlistId)
  }

  const handleAddPlaylistToQueue = () => {
    if (!playlist || !playlist.songs) return
    if (isShuffled) {
      actions.setQueue([
        ...shuffledQueue,
        ...playlist.songs.map((song: any) => song.songId),
      ])
      toast.success(`Playlist added to shuffled queue`)
    } else {
      actions.setQueue([
        ...queue,
        ...playlist.songs.map((song: any) => song.songId),
      ])
      toast.success(`Playlist added to queue`)
    }
  }

  const handleLikePlaylist = async () => {
    try {
      if (!playlist || !playlist.songs) {
        return
      }
      if (!playlist._id) return
      togglePlaylistLike(playlist._id)
    } catch (error) {
      error && toast.error('Failed to like album')
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

  if (!playlist || isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading playlist details...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 rounded-xl h-full overflow-y-scroll dark:bg-stone-900 hide-scrollbar">
      <div className="flex flex-col lg:flex-row h-full px-4 sm:px-6 py-4">
        {/* Left Panel - Playlist Art & Controls */}
        <div className="lg:w-96 p-4 sm:p-6">
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
                className="bg-stone-950 text-white p-3 rounded-full hover:bg-stone-800 transition-colors"
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
                  title="Like Playlist"
                  onClick={handleLikePlaylist}
                  className="p-1 text-stone-400 hover:text-red-500 transition-colors"
                >
                  {likeLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2  border-stone-900" />
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
                  title="Add Playlist to Queue"
                  onClick={handleAddPlaylistToQueue}
                  className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <BiPlusCircle className="w-5 h-5" />
                </button>
                <button
                  title="Edit Playlist"
                  onClick={handleToggleEditMode}
                  className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <BiEdit className="w-5 h-5" />
                </button>{' '}
                {playlist.creator._id == user?.id && (
                  <button
                    title="Delete Playlist"
                    onClick={handleDeletePlaylist}
                    className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <BiTrash className="w-5 h-5" />
                  </button>
                )}
                <button
                  title="Share Playlist"
                  onClick={handleSharePlaylist}
                  className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <BiShare className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/** Playlist Details */}
            <div className="mb-8">
              <h1 className="text-3xl font-light mb-1">{playlist?.title}</h1>
              <p className="text-stone-600 ">
                {playlist?.description ||
                  'No description available for this playlist.'}
              </p>
              <div className=" text-stone-600 pt-4 text-lg">
                <p>
                  {playlist.creator.displayName}
                  {playlist.collaborators &&
                    playlist.collaborators.map((collaborator: any) => (
                      <span
                        key={collaborator._id}
                        className="text-stone-600 mx-2"
                      >
                        | {collaborator.displayName}
                      </span>
                    ))}
                </p>
                <span className="text-muted-foreground text-sm">
                  <p className="text-stone-500 mt-1">
                    {playlist?.songs?.length} tracks
                  </p>
                  {playlist.likedBy && (
                    <p className="text-sm text-stone-500 mt-1">
                      Liked by {playlist.likedBy.length} user
                      {playlist.likedBy.length > 1 ? 's' : ''}
                    </p>
                  )}
                  {playlist.streamCount && playlist.streamCount > 0 ? (
                    <p className="text-sm mt-1">
                      {playlist.streamCount < 1
                        ? 'Not Streamed yet'
                        : playlist.streamCount}{' '}
                      Total Play
                      {playlist.streamCount > 1 ? 's' : ''}
                    </p>
                  ) : (
                    ''
                  )}
                </span>

                <p className="text-sm text-stone-500 mt-1">
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
        <div className="flex-1 py-4 sm:p-6 lg:p-8 overflow-y-auto  dark:bg-stone-950 rounded-lg lg:mt-6 lg:mb-5">
          <h2 className="text-xl font-semibold dark:text-stone-300 text-stone-900 mb-4 ">
            Tracks
          </h2>
          <div className="max-w-3xl space-y-2  ">
            {playlist.songs &&
              playlist?.songs
                ?.sort((a: any, b: any) => a.order - b.order)
                .map((song: any) => (
                  <SongCompactCardB song={song.songId} key={song.songId._id} />
                ))}
          </div>
        </div>
        {/* Right Panel - Additional Info */}
        <div className="lg:w-1/3  border-stone-200 py-2 px-0.5 sm:p-6">
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
