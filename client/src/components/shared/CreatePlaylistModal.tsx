import { useCreatePlaylistModalStore } from '../../store/modal-store'
import { useState } from 'react'
import axiosInstance from '../../utils/axios-interceptor'
import toast from 'react-hot-toast'

export function CreatePlaylistModal() {
  const { isOpen, close } = useCreatePlaylistModalStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    visibility: 'public',
  })

  const handleSubmit = async () => {
    if (!formData.title) return

    setLoading(true)
    try {
      await axiosInstance.post(
        'http://localhost:3000/api/v1/playlists/create/quick',
        {
          title: formData.title.trim(),
          visibility: formData.visibility,
        }
      )
      toast.success('Playlist created successfully!')

      close()
      setFormData({
        title: '',
        visibility: 'public',
      })
    } catch (error) {
      toast.error('Failed to create playlist. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-hidden shadow-xl">
        {/* Compact Header */}
        <div className=" border-b px-4 py-3 border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              New Playlist
            </h2>
            <button
              onClick={close}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Compact Cover Upload */}

          {/* Compact Form */}
          <div className="space-y-3">
            <div>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  console.log(e.target.value)
                  setFormData({ ...formData, title: e.target.value })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Playlist title *"
              />
            </div>

            <div>
              <select
                value={formData.visibility}
                onChange={(e) =>
                  setFormData({ ...formData, visibility: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                {' '}
                <option value="public">🌍 Public</option>
                <option value="private">🔒 Private</option>
              </select>
            </div>
          </div>

          {/* Compact Actions */}
          <div className="flex space-x-2 pt-2">
            <button
              onClick={close}
              className="flex-1 py-2 px-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formData.title || loading}
              className="flex-1 py-2 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
