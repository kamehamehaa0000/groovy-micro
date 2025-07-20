import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const fetchPublicAlbums = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/albums/all/public`,
    {
      params: {
        page,
        limit,
      },
    }
  )
  return response.data
}
export const fetchAlbumById = async (albumId: string) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/albums/album/${albumId}`
  )
  return response.data
}

export const toggleAlbumLike = async (albumId: string) => {
  const response = await axiosInstance.put(
    `${API_BASE_URL}/songs/albums/like/${albumId}`
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
