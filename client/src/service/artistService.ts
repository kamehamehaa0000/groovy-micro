import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

export const fetchArtists = async (page: number, limit: number) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/artists/artists`,
    {
      params: {
        page,
        limit,
      },
    }
  )
  return response.data
}

export const fetchAlbumsByArtists = async (
  artistId: string,
  page: number,
  limit: number
) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/artists/albums/artist/${artistId}`,
    {
      params: {
        page,
        limit,
      },
    }
  )
  return response.data
}

export const fetchSongsByArtists = async (
  artistId: string,
  page: number,
  limit: number
) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/artists/songs/artist/${artistId}`,
    {
      params: {
        page,
        limit,
      },
    }
  )
  return response.data
}

export const fetchArtistById = async (artistId: string) => {
  const response = await axiosInstance.get(
    `${API_BASE_URL}/query/artists/artist/${artistId}`
  )
  return response.data
}