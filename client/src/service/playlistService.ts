import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const getUserPlaylist = async () => {
  const response = await axiosInstance.get(`${API_BASE_URL}/query/playlists/me`)
  return response.data
}
export const addSongToPlaylist = async (playlistId: string, songId: string) => {
  const response = await axiosInstance.patch(
    `${API_BASE_URL}/songs/playlists/${playlistId}/add/song/${songId}`,
    { playlistId }
  )

  return response.data
}
export const removeSongFromPlaylist = async (
  playlistId: string,
  songId: string
) => {
  const response = await axiosInstance.patch(
    `${API_BASE_URL}/songs/playlists/${playlistId}/remove/song/${songId}`,
    { playlistId }
  )
  return response.data
}
