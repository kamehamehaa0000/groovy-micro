import { useState } from 'react'
import { useAddAlbumToPlaylistModalStore } from '../../store/modal-store'
import toast from 'react-hot-toast'
import { dotColors } from '../../types'
import { withModal } from './withModal'
import {
  useAddAlbumToPlaylist,
  useUserPlaylists,
} from '@/service/queries/playlistQuery'

interface Playlist {
  _id: string
  title: string
  songs: Array<{
    songId: {
      _id: string
    }
  }>
}

const AddAlbumToPlaylistModalContent = () => {
  const { isOpen, albumId } = useAddAlbumToPlaylistModalStore()
  const [loading, setLoading] = useState<number | null>(null)
  const { data: userPlaylists, isPending } = useUserPlaylists()
  const { mutate: addAlbumToPlaylist } = useAddAlbumToPlaylist()

  const handleAddAlbumToPlaylist = async (
    playlistId: string,
    index: number
  ) => {
    if (!albumId || !playlistId) {
      toast.error('Missing album or playlist ID')
      return
    }
    try {
      setLoading(index)
      addAlbumToPlaylist({ albumId, playlistId })
      toast.success('Album added to playlist successfully')
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ?? 'Failed to add album to playlist'
      toast.error(errorMessage)
    } finally {
      setLoading(null)
    }
  }
  if (!isOpen) return null
  return (
    <div className="max-h-80 overflow-y-auto pb-2">
      {isPending && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
          <span className="ml-2 text-sm text-gray-500">Loading...</span>
        </div>
      )}
      {!isPending && userPlaylists.playlists.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-gray-500 text-sm">No playlists found</p>
          <p className="text-gray-400 text-xs mt-1">Create a playlist first</p>
        </div>
      )}
      {userPlaylists.playlists.length > 0 &&
        userPlaylists.playlists.map((playlist: Playlist, index: number) => {
          return (
            <div
              key={playlist._id}
              className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 flex items-center justify-between group"
            >
              <div className="flex items-center flex-1">
                <div className="w-4 h-4 mr-3 transition-colors flex items-center justify-center">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      dotColors[index % dotColors.length]
                    }`}
                  ></span>
                </div>
                <div className="flex-1">
                  <span className="text-gray-800 text-sm">
                    {playlist.title}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleAddAlbumToPlaylist(playlist._id, index)}
                disabled={loading === index}
                className={`w-6 h-6 flex  items-center justify-center rounded-full border transition-colors border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {(() => {
                  if (loading === index) {
                    return (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500" />
                    )
                  }

                  return (
                    <svg
                      className="w-3 h-3 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )
                })()}
              </button>
            </div>
          )
        })}
    </div>
  )
}

export const AddAlbumToPlaylistModal = withModal(AddAlbumToPlaylistModalContent)
