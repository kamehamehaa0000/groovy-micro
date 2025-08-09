import { useJamActions, useIsJamming } from '../store/jam-store'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import CompactComments from '../components/comments/CompactComments'
import {
  deleteSong,
  fetchSongById,
  toggleLikeSong,
} from '../service/songsService'
import toast from 'react-hot-toast'
import {
  BiAddToQueue,
  BiHeart,
  BiPlusCircle,
  BiShare,
  BiTrashAlt,
} from 'react-icons/bi'
import { usePlayerStore } from '../store/player-store'
import { useAddToPlaylistModalStore } from '../store/modal-store'
import { addSongToListenLater } from '../service/libraryService'
import { MdOutlineWatchLater } from 'react-icons/md'
import { useAuthStore } from '@/store/auth-store'

const SongDetailPage = () => {
  const param = useParams<{ id: string }>()
  const songId = param.id
  const [likeLoading, setLikeLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [song, setSong] = useState({
    _id: '',
    originalUrl: '',
    hlsUrl: '',
    metadata: {
      artist: {
        _id: '',
        displayName: '',
      },
      title: '',
      album: {
        _id: '',
        title: '',
        coverUrl: '',
      },
      collaborators: [
        {
          _id: '',
          displayName: '',
        },
      ],
      genre: '',
      trackNumber: 0,
      likedBy: [],
    },
    coverArtUrl: '',
    isLikedByCurrentUser: false,
    createdAt: '',
    streamCount: 0,
  })
  const { queue, currentSong, actions } = usePlayerStore()
  const { isAuthenticated, user } = useAuthStore()
  const {
    isOpen: isAddToPlaylistOpen,
    open: openAddToPlaylist,
    setSongId,
  } = useAddToPlaylistModalStore()
  const isJamming = useIsJamming()
  const { addToQueue: jamAddToQueue, changeSong: jamChangeSong } =
    useJamActions()
  const navigate = useNavigate()
  useEffect(() => {
    const fetchSong = async () => {
      if (!songId) return
      try {
        const data = await fetchSongById(songId)
        setSong(data)
      } catch (error) {
        error && toast.error('Failed to fetch song details')
      } finally {
        setLoading(false)
      }
    }
    fetchSong()
  }, [songId])

  const handlePlaySong = () => {
    if (isJamming) {
      jamChangeSong(song._id)
    } else {
      if (currentSong?._id === songId && isPlaying) {
        actions.pause()
        setIsPlaying(false)
      } else {
        actions.loadSong(song, true)
        setIsPlaying(true)
      }
    }
  }
  const handleShareSong = () => {
    const shareData = {
      title: song.metadata.title,
      text: `Check out this song: ${song.metadata.title} by ${song.metadata.artist.displayName}`,
      url: `${window.location.origin}/songs/song/${songId}`,
    }
    if (navigator.share) {
      navigator
        .share(shareData)
        .then(() => toast.success('Song shared successfully!'))
        .catch(() => toast.error('Failed to share song'))
    } else {
      toast.error('Sharing not supported in this browser')
    }
  }

  const handleAddToPlaylist = () => {
    if (!song._id) return
    if (!isAddToPlaylistOpen) {
      openAddToPlaylist()
      setSongId(song._id)
    }
  }

  const handleLikeSong = async () => {
    if (!song._id) return
    try {
      setLikeLoading(true)
      await toggleLikeSong(song._id)
      setSong((prev) => ({
        ...prev,
        isLikedByCurrentUser: !prev.isLikedByCurrentUser,
      }))
    } catch (error) {
      error && toast.error('Failed to like song')
    } finally {
      setLikeLoading(false)
    }
  }

  const handleAddToQueue = () => {
    if (!song._id) return

    if (isJamming) {
      jamAddToQueue(song._id)
    } else {
      actions.setQueue([...queue, song])
    }
  }

  const handleAddToListenLater = async () => {
    try {
      await addSongToListenLater(song._id)
      toast.success('Song added to Listen Later')
    } catch (error) {
      error && toast.error('Failed to add song to Listen Later')
    }
  }
  const handleDeleteSong = async () => {
    try {
      await deleteSong(song._id)
      toast.success('Song deleted successfully')
      navigate('/songs')
    } catch (error) {
      error && toast.error('Failed to delete song')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="loader"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white  md:h-full">
      <div className="flex flex-col lg:flex-row h-full">
        {/* Center Panel - Details */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 min-h-full max-w-2xl ">
          <div className="max-w-3xl">
            {/* Song Title */}
            <div className="mx-auto w-full max-w-md aspect-square rounded-lg mb-6 flex items-center justify-center">
              <div className="w-full h-full  bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <img
                  src={song.coverArtUrl}
                  alt="Album Art"
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePlaySong}
                className="bg-gray-900 text-white p-3 rounded-full hover:bg-gray-800 transition-colors"
              >
                {isPlaying && currentSong?._id === songId ? (
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
                  onClick={handleLikeSong}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  {likeLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2  border-gray-900" />
                  ) : (
                    <BiHeart
                      className={`w-5 h-5 ${
                        song.isLikedByCurrentUser
                          ? 'text-red-500 fill-current'
                          : ''
                      }`}
                    />
                  )}
                </button>

                <button
                  onClick={handleAddToPlaylist}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Add album to Playlist"
                >
                  <BiPlusCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={handleAddToQueue}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Add to Queue"
                >
                  <BiAddToQueue className="w-5 h-5" />
                </button>
                <button
                  onClick={handleAddToListenLater}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Add to Listen Later"
                >
                  <MdOutlineWatchLater className="w-5 h-5" />
                </button>
                {isAuthenticated && user?.id === song.metadata.artist._id && (
                  <button
                    onClick={handleDeleteSong}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Delete song"
                  >
                    <BiTrashAlt className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={handleShareSong}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Share song"
                >
                  <BiShare className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                {song.metadata.title || 'N/A'}
              </h1>
              <p className="text-xl text-gray-600 mb-1">
                {song.metadata.artist.displayName || 'N/A'}
              </p>
              {song.metadata.likedBy && (
                <p className="text-sm text-gray-500 my-1">
                  Liked by {song.metadata.likedBy.length} user
                  {song.metadata.likedBy.length > 1 ? 's' : ''}
                </p>
              )}{' '}
              {song.streamCount > 0 && (
                <p className="text-sm text-gray-500 my-1">
                  {song.streamCount} Total play{' '}
                  {song.streamCount > 1 ? 's' : ''}
                </p>
              )}
              <p className="text-sm text-gray-500 uppercase tracking-wide">
                {song.metadata.genre || 'N/A'} •{' '}
                {new Date(song.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                })}
              </p>
            </div>

            {/* Track Information */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Track Information
              </h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                  <div>
                    <dt className="text-gray-500 mb-1">Release Date</dt>
                    <dd className="text-gray-900 font-medium">
                      {new Date(song.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Album</dt>
                    <dd className="text-gray-900 font-medium">
                      {song.metadata.album.title ??
                        'Does not belong to any album'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Artist</dt>
                    <dd className="text-gray-900 font-medium">
                      {song.metadata.artist.displayName ?? 'Unknown Artist'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Collaborators</dt>
                    <dd className="text-gray-900 font-medium">
                      {song.metadata?.collaborators.length
                        ? song.metadata.collaborators
                            .map((collaborator) => collaborator.displayName)
                            .join(', ')
                        : 'N/A'}
                    </dd>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Right Panel - Album Art & Controls */}
        <div className="flex-1 md:border-l  border-gray-200 py-2 px-0.5 sm:p-6">
          <CompactComments entityType="song" entityId={song._id} />
        </div>
      </div>
    </div>
  )
}

export default SongDetailPage
