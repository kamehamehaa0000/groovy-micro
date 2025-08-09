import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query'
import * as playlistService from '../playlistService'
import { useAuthStore } from '@/store/auth-store'
import toast from 'react-hot-toast'
import { getLikedPlaylists } from '../libraryService'

//Query Keys
const playlistKeys = {
  all: ['playlists'] as const,
  lists: () => [...playlistKeys.all, 'list'] as const,
  list: (filters: string) => [...playlistKeys.lists(), { filters }] as const,
  details: () => [...playlistKeys.all, 'detail'] as const,
  detail: (id: string) => [...playlistKeys.details(), id] as const,
  me: () => [...playlistKeys.all, 'me'] as const,
}
// get user's playlists
export const useUserPlaylists = () => {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: playlistKeys.me(),
    queryFn: playlistService.getUserPlaylist,
    enabled: isAuthenticated,
  })
}

// get playlist by id
export const usePlaylistById = (playlistId: string) => {
  return useQuery({
    queryKey: playlistKeys.detail(playlistId),
    queryFn: () => playlistService.fetchPlaylistById(playlistId),
    enabled: !!playlistId, // Only runs if playlistId is provided
  })
}

// get public playlists with infinite scrolling.
export const usePublicPlaylists = () => {
  return useInfiniteQuery({
    queryKey: playlistKeys.list('public'),
    queryFn: ({ pageParam = 1 }) =>
      playlistService.getPublicPlaylists(pageParam, 20),
    getNextPageParam: (lastPage) => {
      const { currentPage, totalPages } = lastPage.pagination

      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1,
  })
}

export const useLikedPlaylists = () => {
  return useInfiniteQuery({
    queryKey: ['playlists', 'liked'],
    queryFn: ({ pageParam = 1 }) => getLikedPlaylists(pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.currentPage < lastPage.pagination.totalPages) {
        return lastPage.pagination.currentPage + 1
      }
      return undefined
    },
  })
}

// Mutation

//create new playlist
export const useCreatePlaylist = (options?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      title,
      visibility,
    }: {
      title: string
      visibility: 'public' | 'private'
    }) => playlistService.createPlaylist(title, visibility),
    onSuccess: (data, variables, context) => {
      toast.success('Playlist created successfully!')
      queryClient.invalidateQueries({ queryKey: playlistKeys.all })
      options?.onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create playlist.')
    },
  })
}

//toggle liking a playlist.
export const useTogglePlaylistLike = (options?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playlistId: string) =>
      playlistService.togglePlaylistLike(playlistId),
    onSuccess: (data, playlistId) => {
      queryClient.invalidateQueries({
        queryKey: playlistKeys.detail(playlistId),
      })
      options?.onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong.')
    },
  })
}

// update playlist details (title, description, visibility).
export const useUpdatePlaylistDetails = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: {
      playlistId: string
      title?: string
      description?: string
      visibility?: 'public' | 'private'
    }) =>
      playlistService.updatePlaylistDetails(
        variables.playlistId,
        variables.title,
        variables.description,
        variables.visibility
      ),
    onSuccess: (data, variables) => {
      toast.success('Playlist updated.')
      queryClient.invalidateQueries({
        queryKey: playlistKeys.detail(variables.playlistId),
      })
      queryClient.invalidateQueries({ queryKey: playlistKeys.me() })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update playlist.')
    },
  })
}

// add album to playlist.
export const useAddAlbumToPlaylist = (options?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      albumId,
      playlistId,
    }: {
      albumId: string
      playlistId: string
    }) => playlistService.addAlbumToPlaylist(albumId, playlistId),
    onSuccess: (data, variables, context) => {
      toast.success('Album added to playlist successfully!')
      queryClient.invalidateQueries({ queryKey: playlistKeys.me() })
      options?.onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add album to playlist.')
    },
  })
}

export const useDeletePlaylist = (options?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playlistId: string) =>
      playlistService.deletePlaylist(playlistId),
    onSuccess: (data, variables, context) => {
      toast.success('Playlist deleted successfully!')
      queryClient.invalidateQueries({ queryKey: playlistKeys.me() })
      queryClient.invalidateQueries({ queryKey: playlistKeys.list('public') })
      queryClient.invalidateQueries({ queryKey: playlistKeys.all })
      options?.onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete playlist.')
    },
  })
}
