import { useState } from 'react'
import {
  confirmCoverUpload,
  getPresignedUrlForCoverUpload,
  updatePlaylistDetails,
} from '../../service/playlistService'
import toast from 'react-hot-toast'
import axios from 'axios'

interface PlaylistEditModalProps {
  isOpen: boolean
  onClose: () => void
  playlistId: string
}

export const PlaylistEditModal = ({
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
      error && toast.error('Failed to update cover')
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
      error && toast.error('Failed to update playlist details')
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
          <label
            htmlFor="cover-file-input-playlist"
            className="text-sm font-medium text-gray-700 mb-2"
          >
            Update Cover Art
          </label>
          <div className="flex items-center justify-between my-3 gap-1">
            <input
              id="cover-file-input-playlist"
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
            <label
              htmlFor="title-input-playlist"
              className="text-sm font-medium text-gray-700 my-2"
            >
              Update Title
            </label>

            <input
              id="title-input-playlist"
              type="text"
              placeholder="Enter new title"
              value={title}
              className=" w-full text-sm px-4 py-1 rounded-lg focus:outline-1 border border-gray-300 "
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {/*description Update Section */}
          <div className="flex flex-col my-3">
            <label
              htmlFor="description-input-playlist"
              className="text-sm font-medium text-gray-700 my-2"
            >
              Update Description
            </label>

            <input
              id="description-input-playlist"
              type="text"
              placeholder="Enter new description"
              value={description}
              className=" w-full text-sm px-4 py-1 rounded-lg focus:outline-1 border border-gray-300 "
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {/*title Update Section */}
          <div className="flex flex-col my-3">
            <label
              htmlFor="visibility-input-playlist"
              className="text-sm font-medium text-gray-700 my-2"
            >
              Update Visibility
            </label>
            <select
              id="visibility-input-playlist"
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
