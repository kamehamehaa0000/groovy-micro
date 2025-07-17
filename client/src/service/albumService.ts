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
