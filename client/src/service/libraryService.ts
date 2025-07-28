import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const addSongToRecentlyPlayed = async (songId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/libraries/add/recently-played/song/${songId}`
  )
  return response.data
}

export const addSongToListenLater = async (songId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/libraries/add/listen-later/song/${songId}`
  )
  return response.data
}
export const addAlbumToListenLater = async (albumId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/libraries/add/listen-later/album/${albumId}`
  )
  return response.data
}
export const removeSongFromListenLater = async (songId: string) => {
  const response = await axiosInstance.delete(
    `${API_BASE_URL}/songs/libraries/remove/listen-later/song/${songId}`
  )
  return response.data
}
export const removeAlbumFromListenLater = async (albumId: string) => {
  const response = await axiosInstance.delete(
    `${API_BASE_URL}/songs/libraries/remove/listen-later/album/${albumId}`
  )
  return response.data
}

export const getRecentlyPlayed = async () => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/libraries/recently-played`
  )
  return response.data
}

export const getLikedSongs = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/libraries/liked-songs?page=${page}&limit=${limit}`
  )
  return response.data
}
export const getLikedAlbums = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/libraries/liked-albums?page=${page}&limit=${limit}`
  )
  return response.data
}
export const getLikedPlaylists = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/libraries/liked-playlists?page=${page}&limit=${limit}`
  )
  return response.data
}
