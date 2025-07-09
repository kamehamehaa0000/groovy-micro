import React, { useEffect } from 'react'
import { useAddToPlaylistModalStore } from '../../store/modal-store'
import {
  addSongToPlaylist,
  getUserPlaylist,
  removeSongFromPlaylist,
} from '../../service/playlistService'
import toast from 'react-hot-toast'

const AddToPlaylistModal = () => {
  const { isOpen, close, songId } = useAddToPlaylistModalStore()
  const [playlists, setPlaylists] = React.useState([])
  const [loading, setLoading] = React.useState<number | null>(null)
  const dotColors = [
    'bg-amber-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-indigo-500',
    'bg-yellow-500',
    'bg-pink-500',
  ]

  useEffect(() => {
    const fetchPlaylists = async () => {
      const { playlists } = await getUserPlaylist()
      setPlaylists(playlists)
    }
    fetchPlaylists()
  }, [isOpen])
  // function to check if song exists in playlist
  const isSongInPlaylist = (playlist: any, songId: string) => {
    return playlist.songs.some((song: any) => song.songId._id === songId)
  }
  const handleAddToPlaylist = async (
    playlistId: string,
    songId: string,
    index: number
  ) => {
    try {
      if (!playlistId || !songId) {
        return
      }
      setLoading(index)
      const playlist = playlists.find((p: any) => p._id === playlistId)
      const songExists = playlist && isSongInPlaylist(playlist, songId)

      if (songExists) {
        const { message } = await removeSongFromPlaylist(playlistId, songId)
        toast.success(message ?? 'Song removed from playlist successfully')
      } else {
        const { message } = await addSongToPlaylist(playlistId, songId)
        toast.success(message ?? 'Song added to playlist successfully')
      }

      // Refetch playlists to update the UI
      const { playlists: updatedPlaylists } = await getUserPlaylist()
      setPlaylists(updatedPlaylists)
    } catch (error: any) {
      toast.error('Failed to update playlist')
      console.error('Failed to update playlist:', error)
    } finally {
      setLoading(null)
    }
  }
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-hidden shadow-xl">
        {/* Compact Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
              Select Playlist
            </h2>
            <button
              onClick={close}
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

        <div className="max-h-80 overflow-y-auto">
          {playlists.map((playlist: any, index) => {
            const songExists = isSongInPlaylist(playlist, songId)
            return (
              <div
                key={playlist._id}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 flex items-center justify-between group"
              >
                <div className="flex items-center">
                  <div className="w-4 h-4 mr-3 transition-colors flex items-center justify-center">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        dotColors[index % dotColors.length]
                      }`}
                    ></span>
                  </div>
                  <span className="text-gray-800 text-sm">
                    {playlist.title}
                  </span>
                </div>
                <button
                  onClick={() =>
                    handleAddToPlaylist(playlist._id, songId, index)
                  }
                  className={`w-6 h-6 flex items-center justify-center rounded-full border ${
                    songExists
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {(() => {
                    if (loading === index) {
                      return (
                        <svg
                          className="w-3 h-3 text-gray-500 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      )
                    }

                    if (songExists) {
                      return (
                        <svg
                          className="w-3 h-3 text-green-500"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
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
      </div>
    </div>
  )
}

export default AddToPlaylistModal
