import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const getUserPlaylist = async () => {
  const response = await axiosInstance.get(`${API_BASE_URL}/query/playlists/me`)
  return response.data
}
export const addSongToPlaylist = async (songId: string, playlistId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/playlists/add/song/${songId}/playlist/${playlistId}`
  )
  return response.data
}

export const removeSongFromPlaylist = async (
  songId: string,
  playlistId: string
) => {
  const response = await axiosInstance.delete(
    `${API_BASE_URL}/songs/playlists/remove/song/${songId}/playlist/${playlistId}`
  )
  return response.data
}
