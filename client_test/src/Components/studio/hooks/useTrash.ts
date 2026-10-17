import { useCallback, useState } from 'react'
import { useAuthStore } from '../../../stores/auth.store'
import { catalogApi } from '../../../lib/catalog.api'
import type { TrashCounts } from '../../../lib/catalog.api'
import type { Album, Song } from '../../../types/catalog'
import { toast } from 'sonner'
import type { TrashPurgeRequest } from '../studio.types'

export function useTrash() {
  const { user } = useAuthStore()

  // Trash Releases State
  const [trashAlbums, setTrashAlbums] = useState<Album[]>([])
  const [trashSongs, setTrashSongs] = useState<Song[]>([])
  const [isLoadingTrash, setIsLoadingTrash] = useState(false)
  const [hasLoadedTrash, setHasLoadedTrash] = useState(false)
  // Tab badge tallies. Seeded from the studio bootstrap bundle so the badge is
  // right before the trash list is ever opened, then kept in sync every time
  // the list itself is (re)loaded.
  const [trashAlbumCount, setTrashAlbumCount] = useState(0)
  const [trashSongCount, setTrashSongCount] = useState(0)
  const [trashConfirm, setTrashConfirm] = useState<TrashPurgeRequest | null>(
    null,
  )
  const [isPurging, setIsPurging] = useState(false)

  // Seed the tab badge tallies (from the studio bootstrap, or a soft delete)
  const seedTrashCounts = useCallback((counts: TrashCounts) => {
    setTrashAlbumCount(counts.albums)
    setTrashSongCount(counts.songs)
  }, [])

  // A soft delete can add items to the trash, so flag the loaded list as stale:
  // the next visit refetches it. The badge tallies already arrived with the
  // delete response, so nothing else has to move.
  const invalidateTrash = useCallback(() => setHasLoadedTrash(false), [])

  // Load Trash items (memoised so the studio can trigger it lazily without
  // re-running on every render)
  const loadTrash = useCallback(async () => {
    if (!user || (user.role !== 'ARTIST' && user.role !== 'ADMIN')) return
    setIsLoadingTrash(true)
    try {
      const res = await catalogApi.getStudioReleases(true)
      setTrashAlbums(res.albums)
      setTrashSongs(res.songs)
      setTrashAlbumCount(res.albums.length)
      setTrashSongCount(res.songs.length)
      setHasLoadedTrash(true)
    } catch (err: any) {
      console.warn('Could not load trash releases:', err)
    } finally {
      setIsLoadingTrash(false)
    }
  }, [user])

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
    hasLoadedTrash,
    trashAlbumCount,
    trashSongCount,
    seedTrashCounts,
    invalidateTrash,
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
