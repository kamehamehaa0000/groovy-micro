/** Shared types for the Studio feature surface. */

import type { Album, Song } from '../../types/catalog'
import type { SelectedCredit } from '../ArtistCreditPicker'

export type StudioTab = 'releases' | 'trash' | 'profile' | 'verification'

/**
 * The cut fields the shared track list editor reads and writes. Both release
 * drawers declare their own draft type, which extends this shape with the
 * extra fields their flow needs (uploads in the create drawer).
 */
export interface StudioTrackDraft {
  id: string
  title: string
  genre: string
  bpm?: number | null
  musicalKey?: string | null
  durationSeconds: number
  isExplicit: boolean
  credits: SelectedCredit[]
}

/** Payload for the soft-delete (move to 30-day trash) confirmation modal. */
export interface ReleaseDeleteRequest {
  type: 'album' | 'song'
  id: string
  title: string
  trackCount?: number
  parentAlbumId?: string
}

/** Payload for the permanent purge / empty-trash confirmation modal. */
export interface TrashPurgeRequest {
  type: 'empty' | 'permanent_release' | 'permanent_song'
  id?: string
  title?: string
}

/** Payload for the detach-cut (spin off a standalone single) modal. */
export interface DetachCutRequest {
  song: Song
  parentAlbum: Album
}

/** Emitted whenever a Studio mutation succeeds and the caller should refetch. */
export type StudioNotify = (message: string) => void
