/** Shared types for the Studio feature surface. */

export type StudioTab = 'releases' | 'trash' | 'profile' | 'verification'

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

/** Emitted whenever a Studio mutation succeeds and the caller should refetch. */
export type StudioNotify = (message: string) => void
