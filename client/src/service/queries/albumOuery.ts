import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query'
import * as albumService from '../albumService'
import toast from 'react-hot-toast'
import type { Album } from '@/types'
import { getLikedAlbums } from '../libraryService'

// Query Keys
const albumKeys = {
  all: ['albums'] as const,
  lists: () => [...albumKeys.all, 'list'] as const,
  list: (filters: string) => [...albumKeys.lists(), { filters }] as const,
  details: () => [...albumKeys.all, 'detail'] as const,
  detail: (id: string) => [...albumKeys.details(), id] as const,
  me: () => [...albumKeys.all, 'me'] as const,
}

// get album by id
export const useAlbumById = (albumId: string) => {
  return useQuery({
    queryKey: albumKeys.detail(albumId),
    queryFn: () => albumService.fetchAlbumById(albumId),
    enabled: !!albumId,
  })
}

// get public albums with infinite scrolling
export const usePublicAlbums = () => {
  interface AlbumsResponse {
    albums: Album[]
    currentPage: number
    totalPages: number
    totalAlbums: number
  }
  return useInfiniteQuery({
    queryKey: ['albums', 'public'],
    queryFn: ({ pageParam = 1 }) =>
      albumService.fetchPublicAlbums(pageParam, 20),
    getNextPageParam: (lastPage: AlbumsResponse) => {
      return lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined
    },
    initialPageParam: 1,
  })
}
export const useCurrentUserAlbums = () => {
  interface AlbumsResponse {
    albums: Album[]
    currentPage: number
    totalPages: number
    totalAlbums: number
  }
  return useInfiniteQuery({
    queryKey: ['albums', 'me'],
    queryFn: ({ pageParam = 1 }) =>
      albumService.fetchCurrentUserAlbums(pageParam, 20),
    getNextPageParam: (lastPage: AlbumsResponse) => {
      return lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined
    },
    initialPageParam: 1,
  })
}

export const useLikedAlbums = () => {
  interface AlbumsResponse {
    albums: Album[]
    currentPage: number
    totalPages: number
    totalAlbums: number
  }
  return useInfiniteQuery({
    queryKey: ['albums', 'liked'],
    queryFn: ({ pageParam = 1 }) => getLikedAlbums(pageParam, 20),
    getNextPageParam: (lastPage: AlbumsResponse) => {
      return lastPage.currentPage < lastPage.totalPages
        ? lastPage.currentPage + 1
        : undefined
    },
    initialPageParam: 1,
  })
}

// Mutations

// toggle liking an album
export const useToggleAlbumLike = (options?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (albumId: string) => albumService.toggleAlbumLike(albumId),
    onSuccess: async (data, albumId) => {
      await queryClient.invalidateQueries({
        queryKey: albumKeys.detail(albumId),
      })
      options?.onSuccess?.()
    },
    onError: () => {
      toast.error('Something went wrong.')
    },
  })
}
