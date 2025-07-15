import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const getUserPlaylist = async () => {
  try {
    const response = await axiosInstance.get(
      `${API_BASE_URL}/query/playlists/me`
    )
    return response.data
  } catch (error) {
    throw error
  }
}
export const addSongToPlaylist = async (playlistId: string, songId: string) => {
  try {
    const response = await axiosInstance.patch(
      `${API_BASE_URL}/songs/playlists/${playlistId}/add/song/${songId}`,
      { playlistId }
    )

    return response.data
  } catch (error) {
    throw error
  }
}
export const removeSongFromPlaylist = async (
  playlistId: string,
  songId: string
) => {
  try {
    const response = await axiosInstance.patch(
      `${API_BASE_URL}/songs/playlists/${playlistId}/remove/song/${songId}`,
      { playlistId }
    )
    return response.data
  } catch (error) {
    throw error
  }
}
