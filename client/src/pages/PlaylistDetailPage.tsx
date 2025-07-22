import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import { usePlayerStore, type Song } from '../store/player-store'
import { fetchAlbumById, toggleAlbumLike } from '../service/albumService'
import toast from 'react-hot-toast'
import { BiEdit, BiHeart, BiPlay, BiPlusCircle, BiShare } from 'react-icons/bi'
import albumPlaceholder from '../assets/albumPlaceholder.svg'

import {
  confirmCoverUpload,
  fetchPlaylistById,
  getPresignedUrlForCoverUpload,
  togglePlaylistLike,
  updatePlaylistDetails,
} from '../service/playlistService'
import CompactComments from '../components/comments/CompactComments'

import { BiX } from 'react-icons/bi'
import axios from 'axios'
import { set } from 'react-hook-form'

interface Playlist {
  _id: string
  title: string
  description?: string
  creator: {
    _id: string
    displayName: string
  }
  coverUrl?: string
  collaborators?: { _id: string; displayName: string }[]
  songs: {
    songId: Song
    order: number
    addedBy: {
      _id: string
      displayName: string
    }
    _id: string
  }[]
  createdAt: string
  updatedAt: string
  visibility: 'public' | 'private'
  isLikedByCurrentUser?: boolean
}

const PlaylistDetailPage = () => {
  const param = useParams<{ id: string }>()
  const playlistId = param.id
  const [playlist, setPlaylist] = useState<Playlist>({} as Playlist)
  const [loading, setLoading] = useState(true)
  const [likeLoading, setLikeLoading] = useState(false)
  const [inEditMode, setInEditMode] = useState(false)
  const { isPlaying, currentSong, queue, shuffledQueue, isShuffled, actions } =
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
  }, [])

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
      return
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
        .catch((error) => toast.error('Failed to share playlist'))
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
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(playlist.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {playlist?.songs?.length} tracks
                </p>
              </div>
            </div>
          </div>
        </div>{' '}
        {/*Center panel - Tracks */}
        <div className="flex-1 py-4 sm:p-6 lg:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tracks</h2>
          <div>
            {playlist?.songs
              .sort((a, b) => a.order - b.order)
              .map((song: any, index) => (
                <SongCompactCardB song={song.songId} key={index} />
              ))}
          </div>
        </div>
        {/* Right Panel - Additional Info */}
        <div className="lg:w-1/3 md:border-l  border-gray-200 p-4 sm:p-6">
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

interface PlaylistEditModalProps {
  isOpen: boolean
  onClose: () => void
  playlistId: string
}

const PlaylistEditModal = ({
  isOpen,
  onClose,
  playlistId,
}: PlaylistEditModalProps) => {
  const [isLoadingCoverFileUpload, setIsLoadingCoverFileUpload] =
    useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [title, setTitle] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  const handleUpdateCover = async () => {
    if (!coverFile) {
      toast.error('Please select a cover file')
      return
    }
    console.log(coverFile.name)
    try {
      setIsLoadingCoverFileUpload(true)
      const { presignedUrl, coverKey } = await getPresignedUrlForCoverUpload(
        coverFile.name,
        playlistId
      )

      await axios.put(presignedUrl, coverFile, {
        headers: {
          'Content-Type': coverFile.type,
        },
      })

      await confirmCoverUpload(playlistId, coverKey)
      toast.success('Cover updated successfully')
      setCoverFile(null)
    } catch (error) {
      toast.error('Failed to update cover')
    } finally {
      setIsLoadingCoverFileUpload(false)
    }
  }
  const handleUpdateDetails = async () => {
    try {
      await updatePlaylistDetails(
        playlistId,
        title.trim(),
        description.trim(),
        visibility.trim() as 'public' | 'private'
      )
      toast.success('Playlist details updated successfully')
      setTitle('')
      setDescription('')
      setVisibility('public')
    } catch (error) {
      toast.error('Failed to update playlist details')
    }
  }

  if (isLoadingCoverFileUpload) {
    return (
      <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-hidden shadow-xl">
          <div className="px-4 py-3">
            <p className="text-gray-700">Uploading cover...</p>
          </div>
        </div>
      </div>
    )
  }
  if (!playlistId) {
    toast.error('Playlist ID is required')
    return
  }
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-hidden shadow-xl">
        {/* Compact Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
              Edit Playlist
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3 ">
          {/** Cover Art Update Section */}
          <label className="text-sm font-medium text-gray-700 mb-2">
            Update Cover Art
          </label>
          <div className="flex items-center justify-between my-3 gap-1">
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className=" w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            />
            <button
              onClick={handleUpdateCover}
              className=" text-xs bg-neutral-600 text-white py-1 px-4 rounded-lg "
            >
              Update
            </button>
          </div>
          <div className="flex flex-col my-3">
            <label className="text-sm font-medium text-gray-700 my-2">
              Update Title
            </label>

            <input
              type="text"
              placeholder="Enter new title"
              value={title}
              className=" w-full text-sm px-4 py-1 rounded-lg focus:outline-1 border border-gray-300 "
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {/*description Update Section */}
          <div className="flex flex-col my-3">
            <label className="text-sm font-medium text-gray-700 my-2">
              Update Description
            </label>

            <input
              type="text"
              placeholder="Enter new description"
              value={description}
              className=" w-full text-sm px-4 py-1 rounded-lg focus:outline-1 border border-gray-300 "
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {/*title Update Section */}
          <div className="flex flex-col my-3">
            <label className="text-sm font-medium text-gray-700 my-2">
              Update Visibility
            </label>
            <select
              className="w-full text-sm px-4 py-1 rounded-lg focus:outline-1 border border-gray-300"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'public' | 'private')
              }
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <button
            onClick={handleUpdateDetails}
            className="w-full text-sm bg-neutral-600 text-white py-2 px-4 rounded-lg"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
