import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchCurrentUserSongs, fetchPublicSongs } from '../songsService'
import type { Song } from '@/types'

interface SongsResponse {
  songs: Song[]
  currentPage: number
  totalPages: number
  totalSongs: number
}

export const usePublicSongs = () => {
  return useInfiniteQuery({
    queryKey: ['songs', 'public'],
    queryFn: ({ pageParam = 1 }) => fetchPublicSongs(pageParam, 20),
    getNextPageParam: (lastPage: SongsResponse) => {
      return lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined
    },
    initialPageParam: 1,
  })
}
export const useCurrentUserSongs = () => {
  return useInfiniteQuery({
    queryKey: ['songs', 'me'],
    queryFn: ({ pageParam = 1 }) => fetchCurrentUserSongs(pageParam, 20),
    getNextPageParam: (lastPage: SongsResponse) => {
      return lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined
    },
    initialPageParam: 1,
  })
}
