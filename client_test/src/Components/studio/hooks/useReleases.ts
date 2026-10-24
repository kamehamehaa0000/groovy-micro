import { useState, useEffect } from 'react'
import { useAuthStore } from '../../../stores/auth.store'
import { catalogApi } from '../../../lib/catalog.api'
import type { TrashCounts } from '../../../lib/catalog.api'
import type { Album, Song, ReleaseVisibility } from '../../../types/catalog'
import { notify } from '../../../lib/toast'
import type { ReleaseDeleteRequest, DetachCutRequest } from '../studio.types'

export function useReleases() {
  const { user } = useAuthStore()

  // Catalog Releases State
  const [albums, setAlbums] = useState<Album[]>([])
  const [isLoadingReleases, setIsLoadingReleases] = useState(false)

  // Soft Delete Confirmation State (Modal)
  const [deleteConfirm, setDeleteConfirm] =
    useState<ReleaseDeleteRequest | null>(null)
  const [isDeletingItem, setIsDeletingItem] = useState(false)

  // Release Creation Modal State (Unified Spotify-style Release Model)
  const [isCreateReleaseOpen, setIsCreateReleaseOpen] = useState(false)

  // Edit Release Modal State
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)

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

  // Load Releases for the artist
  const loadReleases = async () => {
    if (!user || (user.role !== 'ARTIST' && user.role !== 'ADMIN')) return
    setIsLoadingReleases(true)
    try {
      const res = await catalogApi.getStudioReleases(false)
      setAlbums(res.albums)
    } catch (err: any) {
      console.warn('Could not load releases:', err)
    } finally {
      setIsLoadingReleases(false)
    }
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
      setAlbums((prev) =>
        prev.map((a) =>
          a.id === album.id
            ? {
                ...a,
                visibility: updated.visibility,
                shareToken: updated.shareToken ?? a.shareToken,
              }
            : a,
        ),
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
    setIsLoadingReleases,
    isCreateReleaseOpen,
    setIsCreateReleaseOpen,
    editingAlbum,
    setEditingAlbum,
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
