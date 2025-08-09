import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const getUserPlaylist = async () => {
  const response = await axiosInstance.get(`${API_BASE_URL}/query/playlists/me`)
  return response.data
}
export const createPlaylist = async (
  title: string,
  visibility: 'public' | 'private'
) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/playlists/create/quick`,
    {
      title,
      visibility,
    }
  )
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

export const getPublicPlaylists = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/playlists/get/all/public?page=${page}&limit=${limit}`
  )
  return response.data
}

export const fetchPlaylistById = async (playlistId: string) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/playlists/playlist/id/${playlistId}`
  )
  return response.data
}
export const togglePlaylistLike = async (playlistId: string) => {
  const response = await axiosInstance.put(
    `${API_BASE_URL}/songs/playlists/like/${playlistId}/`
  )
  return response.data
}

export const getPresignedUrlForCoverUpload = async (
  fileName: string,
  playlistId: string
) => {
  const response = await axiosInstance.put(
    `${API_BASE_URL}/songs/playlists/update/cover/playlist/${playlistId}`,
    {
      coverArtFileName: fileName,
    }
  )
  return response.data
}

export const confirmCoverUpload = async (
  playlistId: string,
  coverKey: string
) => {
  const response = await axiosInstance.put(
    `${API_BASE_URL}/songs/playlists/update/cover/confirm/playlist/${playlistId}`,
    {
      coverKey,
    }
  )
  return response.data
}

export const updatePlaylistDetails = async (
  playlistId: string,
  title?: string,
  description?: string,
  visibility?: 'public' | 'private'
) => {
  const response = await axiosInstance.put(
    `${API_BASE_URL}/songs/playlists/update/details/${playlistId}`,
    {
      title,
      description,
      visibility,
    }
  )
  return response.data
}

export const addAlbumToPlaylist = async (
  albumId: string,
  playlistId: string
) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/playlists/add/album/${albumId}/playlist/${playlistId}`
  )
  return response.data
}
export const deletePlaylist = async (playlistId: string) => {
  const response = await axiosInstance.delete(
    `${API_BASE_URL}/songs/playlists/delete/playlist/${playlistId}`
  )
  return response.data
}
