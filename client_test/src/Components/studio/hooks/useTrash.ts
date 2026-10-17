import { useState } from 'react'
import { useAuthStore } from '../../../stores/auth.store'
import { catalogApi } from '../../../lib/catalog.api'
import type { Album, Song } from '../../../types/catalog'
import { toast } from 'sonner'
import type { TrashPurgeRequest } from '../studio.types'

export function useTrash() {
  const { user } = useAuthStore()

  // Trash Releases State
  const [trashAlbums, setTrashAlbums] = useState<Album[]>([])
  const [trashSongs, setTrashSongs] = useState<Song[]>([])
  const [isLoadingTrash, setIsLoadingTrash] = useState(false)
  const [trashConfirm, setTrashConfirm] = useState<TrashPurgeRequest | null>(
    null,
  )
  const [isPurging, setIsPurging] = useState(false)

  // Load Trash items
  const loadTrash = async () => {
    if (!user || (user.role !== 'ARTIST' && user.role !== 'ADMIN')) return
    setIsLoadingTrash(true)
    try {
      const res = await catalogApi.getStudioReleases(true)
      setTrashAlbums(res.albums)
      setTrashSongs(res.songs)
    } catch (err: any) {
      console.warn('Could not load trash releases:', err)
    } finally {
      setIsLoadingTrash(false)
    }
  }

  // Execute confirmed permanent purge (empty trash, release, or single cut)
  const confirmPurge = () => {
    if (!trashConfirm) return
    if (trashConfirm.type === 'empty') {
      handleEmptyTrash()
    } else if (trashConfirm.type === 'permanent_release' && trashConfirm.id) {
      handlePermanentDeleteAlbum(trashConfirm.id)
    } else if (trashConfirm.type === 'permanent_song' && trashConfirm.id) {
      handlePermanentDeleteSong(trashConfirm.id)
    }
  }

  // Restore album from trash
  const handleRestoreAlbum = async (albumId: string) => {
    try {
      await catalogApi.restoreAlbum(albumId)
      toast.success('Release restored to active catalog.')
      loadTrash()
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore release')
    }
  }

  // Restore song from trash
  const handleRestoreSong = async (songId: string) => {
    try {
      await catalogApi.restoreSong(songId)
      toast.success('Master track restored to active catalog.')
      loadTrash()
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore track')
    }
  }

  // Permanently delete album release and its tracks
  const handlePermanentDeleteAlbum = async (albumId: string) => {
    try {
      setIsPurging(true)
      toast.dismiss()
      await catalogApi.permanentlyDeleteAlbum(albumId)
      toast.success('Release and all associated tracks permanently deleted.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      toast.error(err.message || 'Failed to permanently delete release')
    } finally {
      setIsPurging(false)
    }
  }

  // Permanently delete master cut
  const handlePermanentDeleteSong = async (songId: string) => {
    try {
      setIsPurging(true)
      toast.dismiss()
      await catalogApi.permanentlyDeleteSong(songId)
      toast.success('Master cut permanently deleted.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      toast.error(err.message || 'Failed to permanently delete track')
    } finally {
      setIsPurging(false)
    }
  }

  // Permanently empty all items in studio trash
  const handleEmptyTrash = async () => {
    try {
      setIsPurging(true)
      toast.dismiss()
      const res = await catalogApi.emptyStudioTrash()
      toast.success(res.message || 'Studio trash emptied permanently.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      toast.error(err.message || 'Failed to empty studio trash')
    } finally {
      setIsPurging(false)
    }
  }

  return {
    trashAlbums,
    setTrashAlbums,
    trashSongs,
    setTrashSongs,
    isLoadingTrash,
    setIsLoadingTrash,
    trashConfirm,
    setTrashConfirm,
    isPurging,
    setIsPurging,
    loadTrash,
    handleRestoreAlbum,
    handleRestoreSong,
    handlePermanentDeleteAlbum,
    handlePermanentDeleteSong,
    handleEmptyTrash,
    confirmPurge,
  }
}

export type TrashState = ReturnType<typeof useTrash>
