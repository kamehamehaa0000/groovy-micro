import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const fetchPublicSongs = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/songs/all/public`,
    {
      params: {
        page,
        limit,
      },
    }
  )
  return response.data
}

export const toggleLikeSong = async (songId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/songs/songs/like/${songId}`
  )
  return response.data
}

export const fetchSongById = async (songId: string) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/songs/song/${songId}`
  )
  return response.data
}

export const fetchCurrentUserSongs = async (page: number, limit: number) => {
  const response = await axiosInstance.get(`${API_BASE_URL}/query/songs/me`, {
    params: {
      page,
      limit,
    },
  })
  return response.data
}

export const deleteSong = async (songId: string) => {
  const response = await axiosInstance.delete(
    `${API_BASE_URL}/songs/delete/song/${songId}`
  )
  return response.data
}
