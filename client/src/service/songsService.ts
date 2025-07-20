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

