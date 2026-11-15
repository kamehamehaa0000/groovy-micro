import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth.store'
import { catalogApi } from '../../../lib/catalog.api'
import type { TrashCounts } from '../../../lib/catalog.api'
import type { Album, Song, ReleaseVisibility } from '../../../types/catalog'
import { notify } from '../../../lib/toast'
import type { ReleaseDeleteRequest, DetachCutRequest } from '../studio.types'

export function useReleases() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // Soft Delete Confirmation State (Modal)
  const [deleteConfirm, setDeleteConfirm] =
    useState<ReleaseDeleteRequest | null>(null)
  const [isDeletingItem, setIsDeletingItem] = useState(false)

  // Detach Cut Modal State
  const [detachModalData, setDetachModalData] =
    useState<DetachCutRequest | null>(null)

  // Expanded album tracks view in Studio
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null)
  const [visibilityMenuId, setVisibilityMenuId] = useState<string | null>(null)
  const [albumTrackMap, setAlbumTrackMap] = useState<Record<string, Song[]>>({})
  const [isLoadingAlbumTracks, setIsLoadingAlbumTracks] = useState(false)

  // Dismiss the visibility menu with Escape
  useEffect(() => {
    if (!visibilityMenuId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisibilityMenuId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visibilityMenuId])

  // The artist's releases are a query: the studio keeps them while you work in
  // another tab, and a mutation only refreshes the list.
  const releasesQuery = useQuery({
    queryKey: ['studio', 'releases'],
    queryFn: () => catalogApi.getStudioReleases(false),
    enabled: !!user && (user.role === 'ARTIST' || user.role === 'ADMIN'),
  })

  const albums = releasesQuery.data?.albums ?? []
  const isLoadingReleases = releasesQuery.isLoading

  /**
   * Writes the release list back to the cache, so the studio keeps a single
   * source of truth for it.
   */
  const setAlbums = useCallback(
    (value: Album[] | ((prev: Album[]) => Album[])) => {
      queryClient.setQueryData<{ albums: Album[] }>(
        ['studio', 'releases'],
        (prev) => {
          const next =
            typeof value === 'function' ? value(prev?.albums ?? []) : value
          return { ...(prev ?? { albums: [] }), albums: next }
        },
      )
    },
    [queryClient],
  )

  const loadReleases = async () => {
    await releasesQuery.refetch()
  }

  // Toggle expand album tracks
  const handleToggleAlbumExpand = async (albumId: string) => {
    if (expandedAlbumId === albumId) {
      setExpandedAlbumId(null)
      return
    }

    setExpandedAlbumId(albumId)
    if (!albumTrackMap[albumId]) {
      setIsLoadingAlbumTracks(true)
      try {
        const fullAlbum = await catalogApi.getAlbum(albumId)
        setAlbumTrackMap((prev) => ({
          ...prev,
          [albumId]: fullAlbum.tracks,
        }))
      } catch (err: any) {
        notify.error(err.message || 'Failed to load album tracks')
      } finally {
        setIsLoadingAlbumTracks(false)
      }
    }
  }

  // Open Detach Modal (only allowed on non-single releases)
  const handleOpenDetachModal = (song: Song, parentAlbum: Album) => {
    if (parentAlbum.albumType === 'SINGLE') {
      notify.error('Cannot detach a track from a single release.')
      return
    }
    setDetachModalData({ song, parentAlbum })
    notify.dismiss()
  }

  // Trigger soft delete confirmation modal for an album release
  const handleDeleteAlbum = (
    albumId: string,
    title?: string,
    trackCount?: number,
  ) => {
    setDeleteConfirm({
      type: 'album',
      id: albumId,
      title: title || 'Release',
      trackCount: trackCount || 1,
    })
  }

  // Trigger soft delete confirmation modal for a song
  const handleDeleteSong = (
    songId: string,
    title?: string,
    parentAlbumId?: string,
    trackCount?: number,
  ) => {
    setDeleteConfirm({
      type: 'song',
      id: songId,
      title: title || 'Master track',
      parentAlbumId,
      trackCount,
    })
  }

  // Execute confirmed soft delete
  const confirmSoftDelete = async (): Promise<TrashCounts | null> => {
    if (!deleteConfirm) return null

    try {
      setIsDeletingItem(true)
      notify.dismiss()
      let counts: TrashCounts
      if (deleteConfirm.type === 'album') {
        const res = await catalogApi.deleteAlbum(deleteConfirm.id)
        counts = res.trashCounts
        notify.success(
          'Release and all its cuts moved to 30-day trash. You can restore it anytime within 30 days.',
        )
      } else {
        const res = await catalogApi.deleteSong(deleteConfirm.id)
        counts = res.trashCounts
        notify.success(res.message || 'Master track moved to 30-day trash.')
        if (deleteConfirm.parentAlbumId) {
          try {
            const fullAlbum = await catalogApi.getAlbum(
              deleteConfirm.parentAlbumId,
            )
            setAlbumTrackMap((prev) => ({
              ...prev,
              [deleteConfirm.parentAlbumId!]: fullAlbum.tracks,
            }))
          } catch {
            // Parent album may have been deleted if it was the last track
          }
        }
      }
      setDeleteConfirm(null)
      loadReleases()
      return counts
    } catch (err: any) {
      notify.error(err.message || 'Failed to archive item')
      return null
    } finally {
      setIsDeletingItem(false)
    }
  }

  // Quick Visibility Changer from Release Card
  const handleQuickChangeVisibility = async (
    album: Album,
    newVisibility: ReleaseVisibility,
  ) => {
    if (album.visibility === newVisibility) return
    notify.dismiss()
    try {
      const updated = await catalogApi.updateAlbum(album.id, {
        visibility: newVisibility,
      })
      queryClient.setQueryData<{ albums: Album[] }>(
        ['studio', 'releases'],
        (prev) =>
          prev && {
            ...prev,
            albums: prev.albums.map((a) =>
              a.id === album.id
                ? {
                    ...a,
                    visibility: updated.visibility,
                    shareToken: updated.shareToken ?? a.shareToken,
                  }
                : a,
            ),
          },
      )
      notify.success(
        `Visibility for "${album.title}" updated to ${newVisibility}${
          newVisibility === 'UNLISTED' ? ' (Secret share token generated)' : ''
        }.`,
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to update visibility')
    }
  }

  return {
    albums,
    setAlbums,
    isLoadingReleases,
    detachModalData,
    setDetachModalData,
    deleteConfirm,
    setDeleteConfirm,
    isDeletingItem,
    setIsDeletingItem,
    expandedAlbumId,
    setExpandedAlbumId,
    visibilityMenuId,
    setVisibilityMenuId,
    albumTrackMap,
    setAlbumTrackMap,
    isLoadingAlbumTracks,
    setIsLoadingAlbumTracks,
    loadReleases,
    handleToggleAlbumExpand,
    handleOpenDetachModal,
    handleDeleteAlbum,
    handleDeleteSong,
    confirmSoftDelete,
    handleQuickChangeVisibility,
  }
}

export type ReleasesState = ReturnType<typeof useReleases>
