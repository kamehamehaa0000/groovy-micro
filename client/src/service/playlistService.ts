import axiosInstance from '../utils/axios-interceptor'
const basePlaylistUrl = 'http://localhost:3000/api/v1/playlists'

export const getUserPlaylist = async () => {
  try {
    const response = await axiosInstance.get(`${basePlaylistUrl}/me`)
    return response.data
  } catch (error) {
    throw error
  }
}
export const addSongToPlaylist = async (playlistId: string, songId: string) => {
  try {
    const response = await axiosInstance.patch(
      `${basePlaylistUrl}/add/song/${songId}`,
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
      `${basePlaylistUrl}/remove/song/${songId}`,
      { playlistId }
    )
    return response.data
  } catch (error) {
    throw error
  }
}
