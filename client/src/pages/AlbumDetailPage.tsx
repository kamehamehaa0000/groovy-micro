import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import { usePlayerStore } from '../store/player-store'
import { fetchAlbumById, toggleAlbumLike } from '../service/albumService'
import toast from 'react-hot-toast'
import { BiHeart, BiPlusCircle, BiShare } from 'react-icons/bi'
import { useAddAlbumToPlaylistModalStore } from '../store/modal-store'
import CompactComments from '../components/comments/CompactComments'
import type { Song } from '../types'

export interface Album {
  _id: string
  title: string
  coverUrl: string
  artist: {
    _id: string
    displayName: string
  }
  songs: Song[]
  genre: string
  likedBy?: string[]
  visibility?: 'public' | 'private'
  isLikedByCurrentUser?: boolean
  createdAt: string
}

const AlbumDetailPage = () => {
  const param = useParams<{ id: string }>()
  const albumId = param.id
  const [album, setAlbum] = useState<Album>({
    _id: '',
    title: '',
    coverUrl: '',
    artist: {
      _id: '',
      displayName: '',
    },
    songs: [],
    genre: '',
    isLikedByCurrentUser: false,
    createdAt: '',
  })
  const [loading, setLoading] = useState(true)
  const [likeLoading, setLikeLoading] = useState(false)
  const { isPlaying, currentSong, actions } = usePlayerStore()
  const { setAlbumId, open } = useAddAlbumToPlaylistModalStore()
  useEffect(() => {
    async function fetchAlbum() {
      if (!albumId) return
      try {
        setLoading(true)
        const data = await fetchAlbumById(albumId)
        setAlbum(data.album)
      } catch (error) {
        console.error('Failed to fetch albums:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchAlbum()
  }, [])

  const handlePlayAlbum = () => {
    actions.setQueue([])
    console.log('playing album:', album)
    actions.loadQueue(album.songs, 0)
  }
  if (!album || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading album details...</p>
      </div>
    )
  }

  const handleLikeAlbum = async (album: any) => {
    try {
      if (!album) return
      setLikeLoading(true)
      await toggleAlbumLike(album._id)
      setAlbum((prev) => ({
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
  const handleAddAlbumToPlaylist = () => {
    if (!albumId) {
      toast.error('Album ID is missing')
      return
    }
    setAlbumId(albumId)
    open()
  }

  const handleShareAlbum = () => {
    const shareData = {
      title: album.title,
      text: `Check out this album: ${album.title} by ${album.artist.displayName}`,
      url: `${window.location.origin}/albums/album/${albumId}`,
    }
    if (navigator.share) {
      navigator
        .share(shareData)
        .then(() => toast.success('Album shared successfully!'))
        .catch(() => toast.error('Failed to share album'))
    } else {
      toast.error('Sharing not supported in this browser')
    }
  }
  return (
    <div className="flex-1 rounded-xl h-full">
      <div className="flex flex-col lg:flex-row h-full px-4 sm:px-6 py-4">
        {/* Left Panel - Album Art & Controls */}
        <div className="lg:w-96 md:border-r  border-gray-200 p-4 sm:p-6">
          <div className="sticky top-6">
            {/* Album Art */}
            <img
              src={album.coverUrl}
              alt={album.title}
              className="w-full aspect-square rounded-lg mb-6 flex items-center justify-center "
            />

            {/* Controls */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePlayAlbum}
                className="bg-gray-900 text-white p-3 rounded-full hover:bg-gray-800 transition-colors"
              >
                {isPlaying && currentSong?.metadata.album._id === albumId ? (
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
                  onClick={() => handleLikeAlbum(album)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  {likeLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2  border-gray-900" />
                  ) : (
                    <BiHeart
                      className={`w-5 h-5 ${
                        album.isLikedByCurrentUser
                          ? 'text-red-500 fill-current'
                          : ''
                      }`}
                    />
                  )}
                </button>
                <button
                  onClick={handleShareAlbum}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <BiShare className="w-5 h-5" />
                </button>
                <button
                  onClick={handleAddAlbumToPlaylist}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Add album to Playlist"
                >
                  <BiPlusCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Info */}
            <div className="text-md text-gray-600 pt-4">
              <p className="text-xl lg:text-2xl font-medium text-gray-900">
                {album.title}
              </p>
              <p>{album.artist.displayName}</p>
              <p className="text-sm text-gray-500 mt-1">{album.genre}</p>
              {album.likedBy && (
                <p className="text-sm text-gray-500 mt-1">
                  Liked by {album.likedBy} user
                  {album.likedBy.length > 1 ? 's' : ''}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-1">
                {new Date(album.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/*Center panel - Tracks */}
        <div className="flex-1 py-4 sm:p-6 lg:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tracks</h2>
          <div className="max-w-3xl">
            {album?.songs
              .sort((a, b) => a.metadata.trackNumber - b.metadata.trackNumber)
              .map((song: any) => (
                <SongCompactCardB song={song} key={song._id} />
              ))}
          </div>
        </div>

        {/* Right Panel - comments */}
        <div className="lg:w-1/3 md:border-l  border-gray-200 py-2 px-0.5 sm:p-6">
          {albumId && <CompactComments entityType="album" entityId={albumId} />}
        </div>
      </div>
    </div>
  )
}

export default AlbumDetailPage
