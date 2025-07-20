import { useEffect, useState } from 'react'
import { useAddAlbumToPlaylistModalStore } from '../../store/modal-store'
import { getUserPlaylist } from '../../service/playlistService'
import toast from 'react-hot-toast'
import { addAlbumToPlaylist, fetchAlbumById } from '../../service/albumService'

interface Playlist {
  _id: string
  title: string
  songs: Array<{
    songId: {
      _id: string
    }
  }>
}
interface Album {
  _id: string
  songs: string[] // Array of song IDs
}

const AddAlbumToPlaylistModal = () => {
  const { isOpen, close, albumId } = useAddAlbumToPlaylistModalStore()
  const [playlists, setPlaylists] = useState([])
  const [album, setAlbum] = useState<Album | null>(null)
  const [loading, setLoading] = useState<number | null>(null)
  const [fetchingData, setFetchingData] = useState(false)

  const dotColors = [
    'bg-amber-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-indigo-500',
    'bg-yellow-500',
    'bg-pink-500',
  ]

  useEffect(() => {
    const fetchData = async () => {
      if (!isOpen || !albumId) return

      try {
        setFetchingData(true)
        const [playlistsData, albumData] = await Promise.all([
          getUserPlaylist(),
          fetchAlbumById(albumId),
        ])
        setPlaylists(playlistsData.playlists ?? [])
        setAlbum(albumData.album ?? null)
      } catch (error) {
        console.error('Failed to fetch playlists or album:', error)
      } finally {
        setFetchingData(false)
      }
    }
    fetchData()
  }, [isOpen, albumId])

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
      await addAlbumToPlaylist(albumId, playlistId)
      toast.success('Album added to playlist successfully')
      // Refresh playlists to update the UI
      const { playlists: updatedPlaylists } = await getUserPlaylist()
      setPlaylists(updatedPlaylists || [])
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
    <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
              Add Album to Playlist
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

        {/* Content */}
        <div className="max-h-80 overflow-y-auto">
          {fetchingData && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
              <span className="ml-2 text-sm text-gray-500">Loading...</span>
            </div>
          )}
          {!fetchingData && playlists.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-gray-500 text-sm">No playlists found</p>
              <p className="text-gray-400 text-xs mt-1">
                Create a playlist first
              </p>
            </div>
          )}
          {playlists.length > 0 &&
            playlists.map((playlist: Playlist, index) => {
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
                    onClick={() =>
                      handleAddAlbumToPlaylist(playlist._id, index)
                    }
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
      </div>
    </div>
  )
}

export default AddAlbumToPlaylistModal
