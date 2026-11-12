import { createContext, useContext } from 'react'
import type { ClusteredRelease, ParsedTrack } from '../../../lib/audio-metadata'
import type {
  LockerQuota,
  PersonalArtist,
  PersonalRelease,
  PersonalTrack,
  TrashedRelease,
  TrashedSong,
} from '../../../lib/storage.api'
import type { PlayerTrack } from '../../../types/player'

export interface DuplicateDetail {
  title: string
  artistName: string
  albumTitle: string
  reason: string
}

export interface TrashConfirm {
  type: 'empty' | 'permanent_song' | 'permanent_release'
  id?: string
  title?: string
}

export interface NewContainerForm {
  title: string
  artistName: string
  albumType: 'ALBUM' | 'EP' | 'MIXTAPE' | 'LP' | 'SINGLE'
}

/**
 * Everything the four desks of the vault manager share.
 *
 * The manager used to be one 2980-line file: the state, the loaders and all
 * four desks lived together, so a change in one desk meant reading the
 * others. The state stays here, the desks live in their own files.
 */
export interface VaultManageContextValue {
  // ── Trash ──────────────────────────────────────────────────────────────
  trashedSongs: TrashedSong[]
  setTrashedSongs: (
    value: TrashedSong[] | ((prev: TrashedSong[]) => TrashedSong[]),
  ) => void
  trashedReleases: TrashedRelease[]
  setTrashedReleases: (
    value: TrashedRelease[] | ((prev: TrashedRelease[]) => TrashedRelease[]),
  ) => void
  isLoadingTrash: boolean
  isRestoring: boolean
  isPurging: boolean
  trashConfirm: TrashConfirm | null
  setTrashConfirm: (value: TrashConfirm | null) => void
  loadTrash: () => Promise<void>
  handleRestoreSong: (songId: string) => Promise<void>
  handleRestoreRelease: (releaseId: string) => Promise<void>
  handlePermanentDeleteSong: (songId: string) => Promise<void>
  handlePermanentDeleteRelease: (releaseId: string) => Promise<void>
  handleEmptyTrash: () => Promise<void>

  // ── Artists ────────────────────────────────────────────────────────────
  personalArtists: PersonalArtist[]
  setPersonalArtists: (
    value: PersonalArtist[] | ((prev: PersonalArtist[]) => PersonalArtist[]),
  ) => void
  isLoadingArtists: boolean
  artistsSearch: string
  setArtistsSearch: (value: string) => void
  isCreatingArtist: boolean
  setIsCreatingArtist: (value: boolean | ((prev: boolean) => boolean)) => void
  newArtistName: string
  setNewArtistName: (value: string) => void
  newArtistBio: string
  setNewArtistBio: (value: string) => void
  isSubmittingArtist: boolean
  setIsSubmittingArtist: (value: boolean | ((prev: boolean) => boolean)) => void
  selectedArtistFilter: string | null
  setSelectedArtistFilter: (value: string | null) => void
  loadPersonalArtists: () => Promise<void>
  handleCreateArtist: (e: React.FormEvent) => Promise<void>
  filteredArtists: PersonalArtist[]

  // ── Collection ─────────────────────────────────────────────────────────
  personalReleases: PersonalRelease[]
  setPersonalReleases: (
    value: PersonalRelease[] | ((prev: PersonalRelease[]) => PersonalRelease[]),
  ) => void
  isLoadingReleases: boolean
  collectionSearch: string
  setCollectionSearch: (value: string) => void
  expandedReleaseIds: Set<string>
  setExpandedReleaseIds: (
    value: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void
  toggleExpandRelease: (releaseId: string) => void
  filteredReleases: PersonalRelease[]
  totalPersonalSongs: number
  loadCollection: () => Promise<void>
  handlePlayPersonalTrack: (
    release: PersonalRelease,
    track: PersonalTrack,
    trackIdx: number,
  ) => void
  handleQueuePersonalRelease: (release: PersonalRelease) => void
  deletingItemId: string | null
  setDeletingItemId: (value: string | null) => void
  deleteConfirm: {
    type: 'song' | 'release'
    id: string
    title: string
    parentReleaseId?: string
    trackCount?: number
  } | null
  setDeleteConfirm: (value: {
    type: 'song' | 'release'
    id: string
    title: string
    parentReleaseId?: string
    trackCount?: number
  } | null) => void

  // ── Import desk ───────────────────────────────────────────────────────
  quota: LockerQuota | null
  quotaLoading: boolean
  loadQuota: () => Promise<void>
  totalSelectedTracks: number
  isOverQuota: boolean
  importReleases: ClusteredRelease[]
  setImportReleases: (
    value:
      | ClusteredRelease[]
      | ((prev: ClusteredRelease[]) => ClusteredRelease[]),
  ) => void
  isParsing: boolean
  setIsParsing: (value: boolean | ((prev: boolean) => boolean)) => void
  parsingProgress: { current: number; total: number }
  setParsingProgress: (value: { current: number; total: number }) => void
  isUploading: boolean
  setIsUploading: (value: boolean | ((prev: boolean) => boolean)) => void
  uploadProgress: number
  setUploadProgress: (value: number) => void
  uploadStatusText: string
  setUploadStatusText: (value: string) => void
  errorMessage: string | null
  setErrorMessage: (value: string | null) => void
  successMessage: string | null
  setSuccessMessage: (value: string | null) => void
  duplicateNotice: {
    count: number
    details: DuplicateDetail[]
  } | null
  setDuplicateNotice: (value: {
    count: number
    details: DuplicateDetail[]
  } | null) => void
  showDuplicateDetails: boolean
  setShowDuplicateDetails: (
    value: boolean | ((prev: boolean) => boolean),
  ) => void
  isCreatingContainer: boolean
  setIsCreatingContainer: (value: boolean | ((prev: boolean) => boolean)) => void
  newContainerForm: NewContainerForm
  setNewContainerForm: (
    value:
      | NewContainerForm
      | ((prev: NewContainerForm) => NewContainerForm),
  ) => void
  movingTrackInfo: { sourceReleaseId: string; track: ParsedTrack } | null
  setMovingTrackInfo: (value: {
    sourceReleaseId: string
    track: ParsedTrack
  } | null) => void
  handleFilesSelected: (fileList: FileList | File[]) => Promise<void>
  handleCreateStagedContainer: (e: React.FormEvent) => void
  handleDetachTrackAsSingle: (
    sourceReleaseId: string,
    trackId: string,
  ) => void
  handleMoveTrackToStagedRelease: (
    sourceReleaseId: string,
    targetReleaseId: string,
    track: ParsedTrack,
  ) => void
  handleAttachTrackToExistingLibraryAlbum: (
    sourceReleaseId: string,
    existingAlbumId: string,
    track: ParsedTrack,
  ) => void
  handleRemoveTrackFromStagedRelease: (
    releaseId: string,
    trackId: string,
  ) => void
  handleStartImport: () => Promise<void>
  toPlayerTrack: (release: PersonalRelease, track: PersonalTrack) => PlayerTrack
  fileInputRef: React.RefObject<HTMLInputElement | null>
  folderInputRef: React.RefObject<HTMLInputElement | null>

  // ── Chrome ─────────────────────────────────────────────────────────────
  handleTabChange: (
    tab: 'import' | 'collection' | 'artists' | 'trash',
  ) => void
  navigate: (options: {
    to: string
    search?: Record<string, unknown>
    replace?: boolean
  }) => void
  user: { id: string; displayName: string } | null
  lockerIncludeInHome: boolean
  isUpdatingHomeSetting: boolean
  handleToggleLockerInHome: (enabled: boolean) => Promise<void>
}

export const VaultManageContext = createContext<VaultManageContextValue | null>(
  null,
)

/** The shared state of the vault manager. */
export function useVaultManage(): VaultManageContextValue {
  const value = useContext(VaultManageContext)
  if (!value) {
    throw new Error('useVaultManage must be used inside VaultManageContext')
  }
  return value
}
