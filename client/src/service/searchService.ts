import type { Playlist, Song, Album } from '../types'
import axios from '../utils/axios-interceptor'

const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}/query`
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    currentPage: number
    totalPages: number
    totalItems: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export const searchAll = async (
  query: string
): Promise<{
  albums: Album[]
  songs: Song[]
  playlists: Playlist[]
  artists: { _id: string; displayName: string }[]
}> => {
  const response = await axios.get(`${API_BASE_URL}/search/all?q=${query}`)
  return response.data
}

export const searchSongs = async (
  query: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Song>> => {
  const response = await axios.get(
    `${API_BASE_URL}/search/songs?q=${query}&page=${page}&limit=${limit}`
  )
  return {
    data: response.data.songs,
    pagination: {
      currentPage: response.data.currentPage,
      totalPages: response.data.totalPages,
      totalItems: response.data.totalSongs,
      hasNextPage: response.data.currentPage < response.data.totalPages,
      hasPrevPage: response.data.currentPage > 1,
    },
  }
}

export const searchAlbums = async (
  query: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Album>> => {
  const response = await axios.get(
    `${API_BASE_URL}/search/albums?q=${query}&page=${page}&limit=${limit}`
  )
  return {
    data: response.data.albums,
    pagination: {
      currentPage: response.data.currentPage,
      totalPages: response.data.totalPages,
      totalItems: response.data.totalAlbums,
      hasNextPage: response.data.currentPage < response.data.totalPages,
      hasPrevPage: response.data.currentPage > 1,
    },
  }
}
export const searchArtists = async (
  query: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<{ _id: string; displayName: string }>> => {
  const response = await axios.get(
    `${API_BASE_URL}/search/artists?q=${query}&page=${page}&limit=${limit}`
  )
  console.log('Total artists found:', response.data.data.artists)
  return {
    data: response.data.data.artists,
    pagination: {
      currentPage: response.data.data.pagination.currentPage,
      totalPages: response.data.data.pagination.totalPages,
      totalItems: response.data.data.pagination.totalArtists,
      hasNextPage: response.data.data.pagination.hasNextPage,
      hasPrevPage: response.data.data.pagination.hasPrevPage,
    },
  }
}

export const searchPlaylists = async (
  query: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Playlist>> => {
  const response = await axios.get(
    `${API_BASE_URL}/search/playlists?q=${query}&page=${page}&limit=${limit}`
  )
  return {
    data: response.data.data.playlists,
    pagination: response.data.data.pagination,
  }
}
