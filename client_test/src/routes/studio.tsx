import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi, slugifyText } from '../lib/artists.api'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import { parseAudioFile, parseAudioFilesWithPool } from '../lib/audio-metadata'
import type { ArtistProfile } from '../types/artist'
import type { Album, Song, AlbumType, ReleaseVisibility } from '../types/catalog'
import {
  VerifiedBadgeSVG,
  ExternalLinkSVG,
  UploadCloudSVG,
  DiscIconSVG,
  TrashIconSVG,
  UndoIconSVG,
  PlusIconSVG,
  LockIconSVG,
  CalendarIconSVG,
  EditIconSVG,
} from '../components/icons'
import {
  ArtistCreditPicker,
  type SelectedCredit,
} from '../components/ArtistCreditPicker'
import { ImageCropModal } from '../components/common/ImageCropModal'

export const Route = createFileRoute('/studio')({
  component: StudioComponent,
})


type StudioTab = 'releases' | 'trash' | 'profile' | 'verification'

interface TrackDraft {
  id: string
  title: string
  genre: string
  durationSeconds: number
  isExplicit: boolean
  rawAudioKey?: string
  cleanupToken?: string
  audioUrl?: string
  audioFileName?: string
  coverImageUrl?: string
  isUploadingAudio?: boolean
  credits: SelectedCredit[]
}

interface EditTrackDraft {
  id: string
  title: string
  genre: string
  durationSeconds: number
  isExplicit: boolean
  coverImageUrl?: string
  credits: SelectedCredit[]
}

function StudioComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [activeTab, setActiveTab] = useState<StudioTab>('releases')
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // Catalog Releases State
  const [albums, setAlbums] = useState<Album[]>([])
  const [isLoadingReleases, setIsLoadingReleases] = useState(false)

  // Trash Releases State
  const [trashAlbums, setTrashAlbums] = useState<Album[]>([])
  const [trashSongs, setTrashSongs] = useState<Song[]>([])
  const [isLoadingTrash, setIsLoadingTrash] = useState(false)
  const [trashConfirm, setTrashConfirm] = useState<{
    type: 'empty' | 'permanent_release' | 'permanent_song'
    id?: string
    title?: string
  } | null>(null)
  const [isPurging, setIsPurging] = useState(false)

  // Soft Delete Confirmation State (Modal)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'album' | 'song'
    id: string
    title: string
    trackCount?: number
    parentAlbumId?: string
  } | null>(null)
  const [isDeletingItem, setIsDeletingItem] = useState(false)

  // Batch Deduplication Notice State
  const [duplicateNotice, setDuplicateNotice] = useState<{
    count: number
    titles: string[]
  } | null>(null)

  // Upgrade Form State (for Listeners)
  const [stageName, setStageName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [bio, setBio] = useState('')
  const [instagram, setInstagram] = useState('')
  const [website, setWebsite] = useState('')
  const [spotify, setSpotify] = useState('')
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false)

  // Release Creation Modal State (Unified Spotify-style Release Model)
  const [isCreateReleaseOpen, setIsCreateReleaseOpen] = useState(false)
  const [releaseTitle, setReleaseTitle] = useState('')
  const [releaseType, setReleaseType] = useState<AlbumType>('SINGLE')
  const [releaseDescription, setReleaseDescription] = useState('')
  const [releaseCoverUrl, setReleaseCoverUrl] = useState('')
  const [releaseCoverFile, setReleaseCoverFile] = useState<File | null>(null)
  const [releaseCoverPreview, setReleaseCoverPreview] = useState<string | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Scheduled Release & Visibility State
  const [releaseMode, setReleaseMode] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [releaseVisibility, setReleaseVisibility] = useState<ReleaseVisibility>('PUBLIC')
  const [releaseAllowComments, setReleaseAllowComments] = useState(true)

  // Edit Release Modal State
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [isLoadingEditData, setIsLoadingEditData] = useState(false)
  const [editReleaseTitle, setEditReleaseTitle] = useState('')
  const [editReleaseType, setEditReleaseType] = useState<AlbumType>('ALBUM')
  const [editReleaseGenre, setEditReleaseGenre] = useState('')
  const [editReleaseDescription, setEditReleaseDescription] = useState('')
  const [editReleaseCoverUrl, setEditReleaseCoverUrl] = useState('')
  const [isUploadingEditCover, setIsUploadingEditCover] = useState(false)
  const [editReleaseVisibility, setEditReleaseVisibility] = useState<ReleaseVisibility>('PUBLIC')
  const [editReleaseAllowComments, setEditReleaseAllowComments] = useState(true)
  const [editReleaseMode, setEditReleaseMode] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE')
  const [editReleaseDate, setEditReleaseDate] = useState('')
  const [editReleaseTime, setEditReleaseTime] = useState('')
  const [editTracks, setEditTracks] = useState<EditTrackDraft[]>([])
  const [isSavingRelease, setIsSavingRelease] = useState(false)
  const editCoverInputRef = useRef<HTMLInputElement>(null)


  // Detach Cut Modal State
  const [detachModalData, setDetachModalData] = useState<{
    song: Song
    parentAlbum: Album
  } | null>(null)
  const [detachCoverUrl, setDetachCoverUrl] = useState('')
  const [isUploadingDetachCover, setIsUploadingDetachCover] = useState(false)
  const [isSubmittingDetach, setIsSubmittingDetach] = useState(false)
  const detachCoverInputRef = useRef<HTMLInputElement>(null)

  // Single-release specific fields (when releaseType === 'SINGLE')
  const [singleTrackGenre, setSingleTrackGenre] = useState('')
  const [singleTrackDuration, setSingleTrackDuration] = useState(0)
  const [singleTrackExplicit, setSingleTrackExplicit] = useState(false)
  const [singleTrackAudioUrl, setSingleTrackAudioUrl] = useState('')
  const [singleTrackAudioKey, setSingleTrackAudioKey] = useState('')
  const [singleTrackCleanupToken, setSingleTrackCleanupToken] = useState('')
  const [singleTrackAudioFileName, setSingleTrackAudioFileName] = useState('')
  const [isUploadingSingleAudio, setIsUploadingSingleAudio] = useState(false)
  const [singleTrackCredits, setSingleTrackCredits] = useState<SelectedCredit[]>([])
  const singleAudioInputRef = useRef<HTMLInputElement>(null)

  // Multi-track draft cuts (when releaseType !== 'SINGLE')
  const [draftTracks, setDraftTracks] = useState<TrackDraft[]>([])
  const [isBatchImporting, setIsBatchImporting] = useState(false)
  const batchCutsInputRef = useRef<HTMLInputElement>(null)
  const quickStartInputRef = useRef<HTMLInputElement>(null)

  // Banner & Avatar Upload & Crop State
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null)

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null)

  // Verification Application State
  const [verifyPitch, setVerifyPitch] = useState('')
  const [verifyContactEmail, setVerifyContactEmail] = useState('')
  const [verifyContactPhone, setVerifyContactPhone] = useState('')
  const [verifyLinks, setVerifyLinks] = useState<string[]>([''])
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editStageName, setEditStageName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editInstagram, setEditInstagram] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [editSpotify, setEditSpotify] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Expanded album tracks view in Studio
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null)
  const [albumTrackMap, setAlbumTrackMap] = useState<Record<string, Song[]>>({})
  const [isLoadingAlbumTracks, setIsLoadingAlbumTracks] = useState(false)

  // Authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Fetch Artist Profile if user has ARTIST or ADMIN role
  useEffect(() => {
    if (user && (user.role === 'ARTIST' || user.role === 'ADMIN')) {
      setIsLoadingProfile(true)
      artistsApi
        .getMyProfile()
        .then((profile) => {
          setArtistProfile(profile)
          setEditStageName(profile.stageName)
          setEditSlug(profile.slug)
          setEditBio(profile.bio || '')
          setEditInstagram(profile.socialLinks?.instagram || '')
          setEditWebsite(profile.socialLinks?.website || '')
          setEditSpotify(profile.socialLinks?.spotify || '')
          setVerifyContactEmail(user.email)
        })
        .catch((err) => {
          console.warn('Could not load artist profile:', err)
        })
        .finally(() => {
          setIsLoadingProfile(false)
        })
    }
  }, [user])

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

  useEffect(() => {
    if (artistProfile) {
      if (activeTab === 'releases') {
        loadReleases()
      } else if (activeTab === 'trash') {
        loadTrash()
      }
    }
  }, [artistProfile, activeTab])

  // Clear notice after 5 seconds
  useEffect(() => {
    if (successNotice || errorNotice) {
      const t = setTimeout(() => {
        setSuccessNotice(null)
        setErrorNotice(null)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [successNotice, errorNotice])

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
        setErrorNotice(err.message || 'Failed to load album tracks')
      } finally {
        setIsLoadingAlbumTracks(false)
      }
    }
  }

  // Open Detach Modal (only allowed on non-single releases)
  const handleOpenDetachModal = (song: Song, parentAlbum: Album) => {
    if (parentAlbum.albumType === 'SINGLE') {
      setErrorNotice('Cannot detach a track from a single release.')
      return
    }
    setDetachModalData({ song, parentAlbum })
    setDetachCoverUrl('')
    setErrorNotice(null)
  }

  const handleCloseDetachModal = () => {
    setDetachModalData(null)
    setDetachCoverUrl('')
    if (detachCoverInputRef.current) detachCoverInputRef.current.value = ''
  }

  const handleDetachCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingDetachCover(true)
    setErrorNotice(null)

    try {
      const publicUrl = await catalogApi.uploadAlbumCover(file)
      setDetachCoverUrl(publicUrl)
      setSuccessNotice('Custom single artwork uploaded to Cloudflare R2.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload single artwork')
    } finally {
      setIsUploadingDetachCover(false)
    }
  }

  const handleConfirmDetach = async () => {
    if (!detachModalData) return

    setIsSubmittingDetach(true)
    setErrorNotice(null)

    try {
      await catalogApi.updateSong(detachModalData.song.id, {
        albumId: null,
        coverImageUrl: detachCoverUrl || undefined,
      })

      setSuccessNotice(
        `🎉 Master cut "${detachModalData.song.title}" detached and spun off into standalone SINGLE release!`,
      )

      // Refresh album details and releases
      const fullAlbum = await catalogApi.getAlbum(detachModalData.parentAlbum.id)
      setAlbumTrackMap((prev) => ({
        ...prev,
        [detachModalData.parentAlbum.id]: fullAlbum.tracks,
      }))
      handleCloseDetachModal()
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to detach track')
    } finally {
      setIsSubmittingDetach(false)
    }
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
  const confirmSoftDelete = async () => {
    if (!deleteConfirm) return

    try {
      setIsDeletingItem(true)
      setErrorNotice(null)
      if (deleteConfirm.type === 'album') {
        await catalogApi.deleteAlbum(deleteConfirm.id)
        setSuccessNotice(
          'Release and all its cuts moved to 30-day trash. You can restore it anytime within 30 days.',
        )
      } else {
        const res = await catalogApi.deleteSong(deleteConfirm.id)
        setSuccessNotice(res.message || 'Master track moved to 30-day trash.')
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
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to archive item')
    } finally {
      setIsDeletingItem(false)
    }
  }

  // Restore album from trash
  const handleRestoreAlbum = async (albumId: string) => {
    try {
      await catalogApi.restoreAlbum(albumId)
      setSuccessNotice('Release restored to active catalog.')
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to restore release')
    }
  }

  // Restore song from trash
  const handleRestoreSong = async (songId: string) => {
    try {
      await catalogApi.restoreSong(songId)
      setSuccessNotice('Master track restored to active catalog.')
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to restore track')
    }
  }

  // Permanently delete album release and its tracks
  const handlePermanentDeleteAlbum = async (albumId: string) => {
    try {
      setIsPurging(true)
      setErrorNotice(null)
      await catalogApi.permanentlyDeleteAlbum(albumId)
      setSuccessNotice('Release and all associated tracks permanently deleted.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to permanently delete release')
    } finally {
      setIsPurging(false)
    }
  }

  // Permanently delete master cut
  const handlePermanentDeleteSong = async (songId: string) => {
    try {
      setIsPurging(true)
      setErrorNotice(null)
      await catalogApi.permanentlyDeleteSong(songId)
      setSuccessNotice('Master cut permanently deleted.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to permanently delete track')
    } finally {
      setIsPurging(false)
    }
  }

  // Permanently empty all items in studio trash
  const handleEmptyTrash = async () => {
    try {
      setIsPurging(true)
      setErrorNotice(null)
      const res = await catalogApi.emptyStudioTrash()
      setSuccessNotice(res.message || 'Studio trash emptied permanently.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to empty studio trash')
    } finally {
      setIsPurging(false)
    }
  }


  // Cover image select for new release (Deferred / Lazy Upload)
  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseCoverFile(file)
    setReleaseCoverPreview(URL.createObjectURL(file))
    setSuccessNotice('Cover artwork selected for release.')
  }

  const handleRemoveCover = () => {
    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseCoverFile(null)
    setReleaseCoverPreview(null)
    setReleaseCoverUrl('')
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  // Audio file select for track draft in new release with metadata extraction
  const handleDraftAudioFile = async (draftId: string, file: File) => {
    setDraftTracks((prev) =>
      prev.map((t) => (t.id === draftId ? { ...t, isUploadingAudio: true } : t)),
    )
    setErrorNotice(null)

    try {
      // 1. Extract metadata from audio file
      const parsed = await parseAudioFile(file)

      // Auto-prefill release-level title if empty and album tag is present
      if (!releaseTitle.trim() && parsed.albumTitle && parsed.hasAlbumTag) {
        setReleaseTitle(parsed.albumTitle)
      }

      // Auto-prefill release cover artwork if empty (Deferred / Lazy preview)
      if (!releaseCoverFile && !releaseCoverUrl && parsed.coverFile) {
        setReleaseCoverFile(parsed.coverFile)
        setReleaseCoverPreview(parsed.coverPreviewUrl || URL.createObjectURL(parsed.coverFile))
      }

      // 2. Upload master audio to Cloudflare R2
      const { storageKey, publicUrl, durationSeconds, cleanupToken } =
        await catalogApi.uploadAudioRaw(file)

      // If replacing previously uploaded audio cut, clean up previous file from R2
      const existingCut = draftTracks.find((t) => t.id === draftId)
      if (existingCut?.rawAudioKey && existingCut?.cleanupToken && existingCut.rawAudioKey !== storageKey) {
        catalogApi.cleanupUncommittedAudio(existingCut.rawAudioKey, existingCut.cleanupToken).catch((err) =>
          console.warn(`Failed to cleanup replaced cut audio: ${existingCut.rawAudioKey}`, err),
        )
      }

      setDraftTracks((prev) =>
        prev.map((t) =>
          t.id === draftId
            ? {
                ...t,
                rawAudioKey: storageKey,
                cleanupToken: cleanupToken,
                audioUrl: publicUrl,
                audioFileName: file.name,
                durationSeconds: durationSeconds || parsed.durationSeconds || t.durationSeconds,
                title: t.title.trim() ? t.title : parsed.title,
                genre: t.genre.trim() ? t.genre : (parsed.genre || ''),
                isExplicit: t.isExplicit || parsed.isExplicit,
                isUploadingAudio: false,
              }
            : t,
        ),
      )
      setSuccessNotice(`Master audio "${file.name}" uploaded to R2 and metadata prefilled.`)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload audio cut')
      setDraftTracks((prev) =>
        prev.map((t) =>
          t.id === draftId ? { ...t, isUploadingAudio: false } : t,
        ),
      )
    }
  }

  const handleDraftAudioSelect = async (
    draftId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    await handleDraftAudioFile(draftId, file)
  }

  const handleResetDraftAudio = (draftId: string) => {
    const target = draftTracks.find((t) => t.id === draftId)
    if (target?.rawAudioKey && target?.cleanupToken) {
      catalogApi.cleanupUncommittedAudio(target.rawAudioKey, target.cleanupToken).catch((err) =>
        console.warn(`Failed to cleanup reset cut audio: ${target.rawAudioKey}`, err),
      )
    }
    setDraftTracks((prev) =>
      prev.map((t) =>
        t.id === draftId
          ? {
              ...t,
              rawAudioKey: undefined,
              cleanupToken: undefined,
              audioUrl: undefined,
              audioFileName: undefined,
              durationSeconds: 0,
            }
          : t,
      ),
    )
  }

  const handleRemoveDraftCut = (draftId: string) => {
    const target = draftTracks.find((t) => t.id === draftId)
    if (target?.rawAudioKey && target?.cleanupToken) {
      catalogApi.cleanupUncommittedAudio(target.rawAudioKey, target.cleanupToken).catch((err) =>
        console.warn(`Failed to cleanup removed cut audio: ${target.rawAudioKey}`, err),
      )
    }
    setDraftTracks((prev) => prev.filter((t) => t.id !== draftId))
  }

  const resetReleaseForm = () => {
    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseTitle('')
    setReleaseType('SINGLE')
    setReleaseDescription('')
    setReleaseCoverUrl('')
    setReleaseCoverFile(null)
    setReleaseCoverPreview(null)
    setReleaseMode('IMMEDIATE')
    setScheduledDate('')
    setScheduledTime('')
    setReleaseVisibility('PUBLIC')
    setReleaseAllowComments(true)
    setSingleTrackGenre('')
    setSingleTrackDuration(0)
    setSingleTrackExplicit(false)
    setSingleTrackAudioUrl('')
    setSingleTrackAudioKey('')
    setSingleTrackCleanupToken('')
    setSingleTrackAudioFileName('')
    setSingleTrackCredits([])
    setDraftTracks([
      {
        id: crypto.randomUUID(),
        title: '',
        genre: '',
        durationSeconds: 0,
        isExplicit: false,
        credits: [],
      },
    ])
    if (coverInputRef.current) coverInputRef.current.value = ''
    if (singleAudioInputRef.current) singleAudioInputRef.current.value = ''
    if (batchCutsInputRef.current) batchCutsInputRef.current.value = ''
    if (quickStartInputRef.current) quickStartInputRef.current.value = ''
    setDuplicateNotice(null)
  }

  // Standalone Single Audio Upload & Metadata Prefill
  const handleSingleAudioFile = async (file: File) => {
    setIsUploadingSingleAudio(true)
    setErrorNotice(null)

    try {
      // 1. Extract metadata from audio file
      const parsed = await parseAudioFile(file)

      // Prefill Release Title if empty or equal to filename without extension
      if (!releaseTitle.trim() || releaseTitle === file.name.replace(/\.[^/.]+$/, '')) {
        setReleaseTitle(parsed.title)
      }

      // Prefill Genre if empty
      if (!singleTrackGenre.trim() && parsed.genre) {
        setSingleTrackGenre(parsed.genre)
      }

      // Prefill Duration
      if (parsed.durationSeconds > 0) {
        setSingleTrackDuration(parsed.durationSeconds)
      }

      // Prefill Explicit
      if (parsed.isExplicit) {
        setSingleTrackExplicit(true)
      }

      // Prefill cover artwork if empty (Deferred / Lazy preview)
      if (!releaseCoverFile && !releaseCoverUrl && parsed.coverFile) {
        setReleaseCoverFile(parsed.coverFile)
        setReleaseCoverPreview(parsed.coverPreviewUrl || URL.createObjectURL(parsed.coverFile))
      }

      // 2. Upload raw audio file to Cloudflare R2
      const { storageKey, publicUrl, durationSeconds, cleanupToken } =
        await catalogApi.uploadAudioRaw(file)

      // If replacing previously uploaded single audio, clean it up from R2
      if (singleTrackAudioKey && singleTrackCleanupToken && singleTrackAudioKey !== storageKey) {
        catalogApi.cleanupUncommittedAudio(singleTrackAudioKey, singleTrackCleanupToken).catch((err) =>
          console.warn(`Failed to cleanup replaced single audio: ${singleTrackAudioKey}`, err),
        )
      }

      setSingleTrackAudioKey(storageKey)
      setSingleTrackCleanupToken(cleanupToken || '')
      setSingleTrackAudioUrl(publicUrl)
      setSingleTrackAudioFileName(file.name)
      if (durationSeconds && durationSeconds > 0) {
        setSingleTrackDuration(durationSeconds)
      }

      setSuccessNotice(
        `Audio master "${file.name}" uploaded and metadata prefilled. You can review or edit all details.`,
      )
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload audio')
    } finally {
      setIsUploadingSingleAudio(false)
      if (singleAudioInputRef.current) singleAudioInputRef.current.value = ''
    }
  }

  const handleSingleAudioSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    await handleSingleAudioFile(file)
  }

  const handleResetSingleAudio = () => {
    if (singleTrackAudioKey && singleTrackCleanupToken) {
      catalogApi.cleanupUncommittedAudio(singleTrackAudioKey, singleTrackCleanupToken).catch((err) =>
        console.warn(`Failed to cleanup reset single audio: ${singleTrackAudioKey}`, err),
      )
    }
    setSingleTrackAudioKey('')
    setSingleTrackCleanupToken('')
    setSingleTrackAudioUrl('')
    setSingleTrackAudioFileName('')
    setSingleTrackDuration(0)
    if (singleAudioInputRef.current) {
      singleAudioInputRef.current.value = ''
    }
  }

  // Batch import multiple audio cuts for multi-track releases
  const handleBatchImportFiles = async (files: File[]) => {
    if (files.length === 0) return
    setIsBatchImporting(true)
    setErrorNotice(null)

    try {
      // 1. Concurrently parse metadata for all selected audio files
      const parsedList = await parseAudioFilesWithPool(files, 6)

      // Sort by disc & track number if tagged, otherwise natural filename sorting
      const hasTrackNumbers = parsedList.some((t) => t.trackNumber > 0)
      if (hasTrackNumbers) {
        parsedList.sort((a, b) => {
          if (a.discNumber !== b.discNumber) return a.discNumber - b.discNumber
          return a.trackNumber - b.trackNumber
        })
      } else {
        parsedList.sort((a, b) =>
          a.file.name.localeCompare(b.file.name, undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        )
      }

      // Deduplication: filter out duplicates against existing draftTracks and within incoming parsedList
      const isInitialEmptyDraft =
        draftTracks.length === 1 &&
        !draftTracks[0].title.trim() &&
        !draftTracks[0].audioUrl &&
        !draftTracks[0].rawAudioKey

      const existingDrafts = isInitialEmptyDraft ? [] : draftTracks

      const isMatch = (
        candidate: { title: string; durationSeconds: number; fileName: string; fileSize: number },
        existing: { title: string; durationSeconds: number; audioFileName?: string },
      ) => {
        // Match 1: Exact audio filename match
        if (
          existing.audioFileName &&
          candidate.fileName.toLowerCase() === existing.audioFileName.toLowerCase()
        ) {
          return true
        }

        // Match 2: Exact metadata match (normalized title + duration within ±2s)
        const titleA = candidate.title.trim().toLowerCase()
        const titleB = (existing.title || '').trim().toLowerCase()
        if (titleA && titleB && titleA === titleB) {
          const durA = candidate.durationSeconds || 0
          const durB = existing.durationSeconds || 0
          if (durA > 0 && durB > 0 && Math.abs(durA - durB) <= 2) {
            return true
          }
        }

        return false
      }

      const uniqueParsedList: typeof parsedList = []
      const duplicateNames: string[] = []

      for (const track of parsedList) {
        const candidateInfo = {
          title: track.title,
          durationSeconds: track.durationSeconds,
          fileName: track.file.name,
          fileSize: track.file.size,
        }

        // Check against already staged drafts
        const inExistingDrafts = existingDrafts.some((d) =>
          isMatch(candidateInfo, {
            title: d.title,
            durationSeconds: d.durationSeconds,
            audioFileName: d.audioFileName,
          }),
        )
        if (inExistingDrafts) {
          duplicateNames.push(track.title || track.file.name)
          continue
        }

        // Check against tracks accepted in current batch (intra-batch)
        const inCurrentBatch = uniqueParsedList.some((u) =>
          isMatch(candidateInfo, {
            title: u.title,
            durationSeconds: u.durationSeconds,
            audioFileName: u.file.name,
          }),
        )
        if (inCurrentBatch) {
          duplicateNames.push(track.title || track.file.name)
          continue
        }

        uniqueParsedList.push(track)
      }

      if (duplicateNames.length > 0) {
        setDuplicateNotice({
          count: duplicateNames.length,
          titles: duplicateNames,
        })
      }

      if (uniqueParsedList.length === 0) {
        setErrorNotice(
          `All ${parsedList.length} selected audio file(s) are duplicates of cuts already in this release draft.`,
        )
        return
      }

      // 2. Prefill Release Title if empty
      if (!releaseTitle.trim()) {
        const taggedAlbum = uniqueParsedList.find(
          (t) => t.hasAlbumTag && t.albumTitle.trim(),
        )
        if (taggedAlbum) {
          setReleaseTitle(taggedAlbum.albumTitle.trim())
        }
      }

      // 3. Prefill Release Cover Artwork if empty (Deferred / Lazy preview)
      if (!releaseCoverFile && !releaseCoverUrl) {
        const firstWithCover = uniqueParsedList.find((t) => t.coverFile)
        if (firstWithCover && firstWithCover.coverFile) {
          setReleaseCoverFile(firstWithCover.coverFile)
          setReleaseCoverPreview(
            firstWithCover.coverPreviewUrl ||
              URL.createObjectURL(firstWithCover.coverFile),
          )
        }
      }

      // 4. Create TrackDraft entries
      const newDrafts: TrackDraft[] = uniqueParsedList.map((p) => ({
        id: crypto.randomUUID(),
        title: p.title,
        genre: p.genre || '',
        durationSeconds: p.durationSeconds,
        isExplicit: p.isExplicit,
        audioFileName: p.file.name,
        isUploadingAudio: true,
        credits: [],
      }))

      if (isInitialEmptyDraft) {
        setDraftTracks(newDrafts)
      } else {
        setDraftTracks((prev) => [...prev, ...newDrafts])
      }

      // 5. Upload raw audio files with concurrency pool of 3
      const poolLimit = 3
      let currentIndex = 0

      const uploadWorker = async () => {
        while (currentIndex < uniqueParsedList.length) {
          const index = currentIndex++
          const parsedTrack = uniqueParsedList[index]
          const targetDraftId = newDrafts[index].id

          try {
            const { storageKey, publicUrl, durationSeconds, cleanupToken } =
              await catalogApi.uploadAudioRaw(parsedTrack.file)

            setDraftTracks((prev) =>
              prev.map((t) =>
                t.id === targetDraftId
                  ? {
                      ...t,
                      rawAudioKey: storageKey,
                      cleanupToken: cleanupToken,
                      audioUrl: publicUrl,
                      durationSeconds: durationSeconds || t.durationSeconds,
                      isUploadingAudio: false,
                    }
                  : t,
              ),
            )
          } catch (uploadErr: any) {
            console.error(`Failed to upload ${parsedTrack.file.name}:`, uploadErr)
            setDraftTracks((prev) =>
              prev.map((t) =>
                t.id === targetDraftId ? { ...t, isUploadingAudio: false } : t,
              ),
            )
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(poolLimit, uniqueParsedList.length) },
        () => uploadWorker(),
      )
      await Promise.all(workers)

      setSuccessNotice(
        duplicateNames.length > 0
          ? `Imported ${uniqueParsedList.length} cut(s) into release draft (${duplicateNames.length} duplicate(s) excluded).`
          : `Imported and extracted metadata for ${uniqueParsedList.length} cuts! All details can be reviewed and edited.`,
      )
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to batch import cuts')
    } finally {
      setIsBatchImporting(false)
      if (batchCutsInputRef.current) batchCutsInputRef.current.value = ''
      if (quickStartInputRef.current) quickStartInputRef.current.value = ''
    }
  }

  // Create Release Form Submit (handles both Single releases and Multi-track releases)
  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!releaseTitle.trim()) {
      setErrorNotice(
        releaseType === 'SINGLE'
          ? 'Please provide a single title'
          : 'Please provide a release title',
      )
      return
    }
    if (!releaseCoverFile && !releaseCoverUrl) {
      setErrorNotice('Please provide cover artwork for the release')
      return
    }

    setIsSubmittingRelease(true)
    setErrorNotice(null)

    const todayDate = new Date().toISOString().split('T')[0]

    let scheduledReleaseAtIso: string | undefined = undefined
    if (releaseMode === 'SCHEDULED') {
      if (!scheduledDate || !scheduledTime) {
        setErrorNotice('Please choose both a date and time for the scheduled release')
        setIsSubmittingRelease(false)
        return
      }
      const parsedTimestamp = new Date(`${scheduledDate}T${scheduledTime}`).getTime()
      if (isNaN(parsedTimestamp)) {
        setErrorNotice('Invalid scheduled release date/time')
        setIsSubmittingRelease(false)
        return
      }
      if (parsedTimestamp <= Date.now()) {
        setErrorNotice('Scheduled release time must be in the future')
        setIsSubmittingRelease(false)
        return
      }
      scheduledReleaseAtIso = new Date(parsedTimestamp).toISOString()
    }

    try {
      // 1. Upload deferred cover artwork to R2 if selected as local File
      let finalCoverUrl = releaseCoverUrl
      if (releaseCoverFile) {
        setIsUploadingCover(true)
        try {
          finalCoverUrl = await catalogApi.uploadAlbumCover(releaseCoverFile)
          setReleaseCoverUrl(finalCoverUrl)
          setReleaseCoverFile(null)
        } catch (covErr: any) {
          setErrorNotice(covErr.message || 'Failed to upload cover artwork to R2')
          setIsSubmittingRelease(false)
          setIsUploadingCover(false)
          return
        } finally {
          setIsUploadingCover(false)
        }
      }

      if (!finalCoverUrl) {
        setErrorNotice('Please provide cover artwork for the release')
        setIsSubmittingRelease(false)
        return
      }

      if (releaseType === 'SINGLE') {
        if (!singleTrackAudioUrl && !singleTrackAudioKey) {
          setErrorNotice('Please upload a master audio file for the single release')
          setIsSubmittingRelease(false)
          return
        }

        const singleTrackPayload = [
          {
            title: releaseTitle.trim(),
            genre: singleTrackGenre.trim() || undefined,
            durationSeconds: singleTrackDuration,
            trackNumber: 1,
            discNumber: 1,
            isExplicit: singleTrackExplicit,
            rawAudioKey: singleTrackAudioKey || undefined,
            audioUrl: singleTrackAudioUrl || undefined,
            coverImageUrl: finalCoverUrl,
            credits:
              singleTrackCredits.length > 0
                ? singleTrackCredits.map((c) => ({
                    artistId: c.artistId,
                    role: c.role,
                  }))
                : undefined,
          },
        ]

        await catalogApi.createAlbum({
          title: releaseTitle.trim(),
          albumType: 'SINGLE',
          coverImageUrl: finalCoverUrl,
          description: releaseDescription.trim() || undefined,
          releaseDate: todayDate,
          scheduledReleaseAt: scheduledReleaseAtIso,
          visibility: releaseVisibility,
          allowComments: releaseAllowComments,
          tracks: singleTrackPayload,
        })

        setSuccessNotice(
          releaseMode === 'SCHEDULED'
            ? `🗓️ Standalone single release "${releaseTitle}" scheduled for ${new Date(scheduledReleaseAtIso!).toLocaleString()} (${releaseVisibility})!`
            : `🎉 Standalone single release "${releaseTitle}" published successfully (${releaseVisibility})!`,
        )
      } else {
        if (draftTracks.length === 0) {
          setErrorNotice('Please add at least one cut to the release')
          setIsSubmittingRelease(false)
          return
        }

        const tracksPayload = draftTracks.map((t, idx) => ({
          title: t.title.trim() || `Cut ${idx + 1}`,
          genre: t.genre.trim() || undefined,
          durationSeconds: t.durationSeconds,
          trackNumber: idx + 1,
          discNumber: 1,
          isExplicit: t.isExplicit,
          rawAudioKey: t.rawAudioKey,
          audioUrl: t.audioUrl,
          coverImageUrl: t.coverImageUrl,
          credits:
            t.credits && t.credits.length > 0
              ? t.credits.map((c) => ({
                  artistId: c.artistId,
                  role: c.role,
                }))
              : undefined,
        }))

        await catalogApi.createAlbum({
          title: releaseTitle.trim(),
          albumType: releaseType,
          coverImageUrl: finalCoverUrl,
          description: releaseDescription.trim() || undefined,
          releaseDate: todayDate,
          scheduledReleaseAt: scheduledReleaseAtIso,
          visibility: releaseVisibility,
          allowComments: releaseAllowComments,
          tracks: tracksPayload.length > 0 ? tracksPayload : undefined,
        })

        setSuccessNotice(
          releaseMode === 'SCHEDULED'
            ? `🗓️ Master ${releaseType} release "${releaseTitle}" scheduled for ${new Date(scheduledReleaseAtIso!).toLocaleString()} (${releaseVisibility})!`
            : `🎉 Master ${releaseType} release "${releaseTitle}" published successfully (${releaseVisibility})!`,
        )
      }

      setIsCreateReleaseOpen(false)
      resetReleaseForm()
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to create release')
    } finally {
      setIsSubmittingRelease(false)
    }
  }

  // Quick Visibility Changer from Release Card
  const handleQuickChangeVisibility = async (
    album: Album,
    newVisibility: ReleaseVisibility,
  ) => {
    if (album.visibility === newVisibility) return
    setErrorNotice(null)
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
      setSuccessNotice(
        `Visibility for "${album.title}" updated to ${newVisibility}${
          newVisibility === 'UNLISTED'
            ? ' (Secret share token generated)'
            : ''
        }.`,
      )
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update visibility')
    }
  }

  // Open Full Edit Release Modal
  const handleOpenEditModal = async (album: Album) => {
    setEditingAlbum(album)
    setIsLoadingEditData(true)
    setErrorNotice(null)

    setEditReleaseTitle(album.title)
    setEditReleaseType(album.albumType)
    setEditReleaseGenre(album.genre || '')
    setEditReleaseDescription(album.description || '')
    setEditReleaseCoverUrl(album.coverImageUrl)
    setEditReleaseVisibility(album.visibility || 'PUBLIC')
    setEditReleaseAllowComments(album.allowComments ?? true)

    if (album.status === 'SCHEDULED' && album.scheduledReleaseAt) {
      setEditReleaseMode('SCHEDULED')
      const dt = new Date(album.scheduledReleaseAt)
      const yr = dt.getFullYear()
      const mo = String(dt.getMonth() + 1).padStart(2, '0')
      const day = String(dt.getDate()).padStart(2, '0')
      const hr = String(dt.getHours()).padStart(2, '0')
      const mn = String(dt.getMinutes()).padStart(2, '0')
      setEditReleaseDate(`${yr}-${mo}-${day}`)
      setEditReleaseTime(`${hr}:${mn}`)
    } else {
      setEditReleaseMode('IMMEDIATE')
      setEditReleaseDate('')
      setEditReleaseTime('')
    }

    try {
      const detail = await catalogApi.getAlbum(
        album.id,
        album.shareToken || undefined,
      )
      if (detail && detail.tracks) {
        setEditTracks(
          detail.tracks.map((t) => ({
            id: t.id,
            title: t.title,
            genre: t.genre || '',
            isExplicit: t.isExplicit,
            coverImageUrl: t.coverImageUrl || undefined,
            durationSeconds: t.durationSeconds,
            credits: (t.credits || []).map((c) => ({
              artistId: c.artistId,
              stageName: c.stageName,
              slug: c.slug,
              verified: c.verified,
              role: c.role,
            })),
          })),
        )
      } else {
        setEditTracks([])
      }
    } catch (err: any) {
      console.warn('Could not load album tracks for edit modal:', err)
      setEditTracks([])
    } finally {
      setIsLoadingEditData(false)
    }
  }

  const handleCloseEditModal = () => {
    setEditingAlbum(null)
    setEditTracks([])
    if (editCoverInputRef.current) editCoverInputRef.current.value = ''
  }

  const handleEditCoverSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingEditCover(true)
    setErrorNotice(null)

    try {
      const publicUrl = await catalogApi.uploadAlbumCover(file)
      setEditReleaseCoverUrl(publicUrl)
      setSuccessNotice('Replacement cover artwork uploaded to Cloudflare R2.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload cover artwork')
    } finally {
      setIsUploadingEditCover(false)
    }
  }

  const handleSaveReleaseEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAlbum) return
    if (!editReleaseTitle.trim()) {
      setErrorNotice('Release title cannot be blank')
      return
    }

    setIsSavingRelease(true)
    setErrorNotice(null)

    try {
      let scheduledReleaseAtIso: string | null | undefined = undefined
      if (editReleaseMode === 'SCHEDULED') {
        if (!editReleaseDate || !editReleaseTime) {
          setErrorNotice(
            'Please select both a date and time for the scheduled drop',
          )
          setIsSavingRelease(false)
          return
        }
        const parsed = new Date(
          `${editReleaseDate}T${editReleaseTime}`,
        ).getTime()
        if (isNaN(parsed)) {
          setErrorNotice('Invalid scheduled drop timestamp')
          setIsSavingRelease(false)
          return
        }
        if (parsed <= Date.now()) {
          setErrorNotice('Scheduled release time must be in the future')
          setIsSavingRelease(false)
          return
        }
        scheduledReleaseAtIso = new Date(parsed).toISOString()
      } else if (
        editingAlbum.status === 'SCHEDULED' &&
        editReleaseMode === 'IMMEDIATE'
      ) {
        // Switching to immediate publishes the album and clears scheduled timestamp
        scheduledReleaseAtIso = null
      }

      // 1. Update Album Level Metadata
      await catalogApi.updateAlbum(editingAlbum.id, {
        title: editReleaseTitle.trim(),
        albumType: editReleaseType,
        genre: editReleaseGenre.trim() || null,
        description: editReleaseDescription.trim() || null,
        coverImageUrl: editReleaseCoverUrl,
        visibility: editReleaseVisibility,
        scheduledReleaseAt: scheduledReleaseAtIso,
        allowComments: editReleaseAllowComments,
      })

      // 2. Update all tracks (title, genre, explicit, cover, credits)
      if (editTracks.length > 0) {
        for (const track of editTracks) {
          await catalogApi.updateSong(track.id, {
            title: track.title.trim() || undefined,
            genre: track.genre.trim() || null,
            isExplicit: track.isExplicit,
            coverImageUrl: track.coverImageUrl || undefined,
            credits: track.credits.map((c) => ({
              artistId: c.artistId,
              role: c.role,
            })),
          })
        }
      }

      setSuccessNotice(`🎉 Master release "${editReleaseTitle}" updated successfully!`)
      handleCloseEditModal()
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update release')
    } finally {
      setIsSavingRelease(false)
    }
  }

  if (isAuthLoading || (user?.role === 'ARTIST' && isLoadingProfile)) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
        Initializing Creator Studio...
      </div>
    )
  }

  if (!user) return null

  // =========================================================================
  // STATE A: LISTENER UPGRADE EXPERIENCE
  // =========================================================================
  if (user.role === 'LISTENER' && !artistProfile) {
    const previewSlug = customSlug.trim()
      ? slugifyText(customSlug)
      : slugifyText(stageName) || 'your-stage-name'

    const handleInstantUpgrade = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!stageName.trim()) {
        setErrorNotice('Please provide a stage name')
        return
      }

      setIsSubmittingUpgrade(true)
      setErrorNotice(null)

      try {
        const socialLinks: Record<string, string> = {}
        if (instagram.trim()) socialLinks.instagram = instagram.trim()
        if (website.trim()) socialLinks.website = website.trim()
        if (spotify.trim()) socialLinks.spotify = spotify.trim()

        const res = await artistsApi.createProfile({
          stageName: stageName.trim(),
          slug: customSlug.trim() ? slugifyText(customSlug) : undefined,
          bio: bio.trim() || undefined,
          socialLinks:
            Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        })

        setArtistProfile(res.profile)
        setSuccessNotice(
          '🎉 Welcome to Groovy Creator Studio! Your artist identity is live.',
        )
      } catch (err: any) {
        setErrorNotice(
          err.message || 'Instant upgrade failed. Please check your details.',
        )
      } finally {
        setIsSubmittingUpgrade(false)
      }
    }

    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <div className="border-b border-line pb-6 mb-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-2">
            Maison Creator Studio
          </span>
          <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
            Launch Your Artist Identity
          </h1>
          <p className="font-sans text-xs text-ink-soft mt-2 leading-relaxed">
            Upgrade instantly from a listener account to an official Groovy
            artist profile. Release master tracks, manage your presence, and
            curate your discography.
          </p>
        </div>

        {errorNotice && (
          <div className="p-4 mb-6 border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-mono text-xs">
            {errorNotice}
          </div>
        )}

        <form onSubmit={handleInstantUpgrade} className="flex flex-col gap-6">
          <div className="p-6 border border-line bg-panel flex flex-col gap-5 shadow-2xs">
            <div>
              <label className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink block mb-2">
                Stage / Ensemble Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="e.g. Hélène Vane, The Cinematic Trio"
                className="w-full font-serif italic text-base py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink">
                  Vanity Handle (Slug)
                </label>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                  Auto-generated if blank
                </span>
              </div>
              <input
                type="text"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                placeholder="e.g. helene-vane"
                className="w-full font-mono text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink transition-colors"
              />
              <div className="mt-2 font-mono text-[10px] text-ink-soft flex items-center gap-1">
                <span>Public profile URL:</span>
                <span className="text-blue font-semibold">
                  groovy.app/artists/{previewSlug}
                </span>
              </div>
            </div>

            <div>
              <label className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink block mb-2">
                Artist Biography
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your musical background, style, influences, or instruments..."
                className="w-full font-sans text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink transition-colors resize-y leading-relaxed"
              />
            </div>

            <div className="pt-4 border-t border-line-soft">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft block mb-3">
                Official Channels (Optional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                    Instagram URL
                  </label>
                  <input
                    type="url"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="https://instagram.com/..."
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                    Spotify Artist URL
                  </label>
                  <input
                    type="url"
                    value={spotify}
                    onChange={(e) => setSpotify(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingUpgrade}
            className="w-full font-mono text-xs uppercase tracking-[0.16em] py-3.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
          >
            {isSubmittingUpgrade
              ? 'Activating Studio...'
              : '✦ Activate Artist Studio (Instant Upgrade)'}
          </button>
        </form>
      </div>
    )
  }

  // =========================================================================
  // STATE B: FULL ARTIST STUDIO DASHBOARD
  // =========================================================================
  if (!artistProfile) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center">
        <p className="font-serif italic text-lg text-ink">
          No artist profile detected.
        </p>
        <p className="font-mono text-xs text-ink-soft mt-1">
          Please try refreshing the page.
        </p>
      </div>
    )
  }

  // Handle Banner Select -> Launch Cropper
  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerCropFile(file)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  // Handle Cropped Banner Upload via Cloudflare R2
  const handleBannerCropComplete = async (croppedFile: File) => {
    if (!artistProfile) return
    setIsUploadingBanner(true)
    setErrorNotice(null)

    try {
      const publicUrl = await artistsApi.uploadBanner(artistProfile.id, croppedFile)
      setArtistProfile((prev) =>
        prev ? { ...prev, bannerUrl: publicUrl } : null,
      )
      setSuccessNotice('Banner image cropped, uploaded to Cloudflare R2, and synced.')
      setBannerCropFile(null)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload banner')
    } finally {
      setIsUploadingBanner(false)
    }
  }

  // Handle Avatar Select -> Launch Cropper
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarCropFile(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  // Handle Cropped Avatar Upload via Cloudflare R2
  const handleAvatarCropComplete = async (croppedFile: File) => {
    if (!artistProfile) return
    setIsUploadingAvatar(true)
    setErrorNotice(null)

    try {
      const publicUrl = await artistsApi.uploadAvatar(artistProfile.id, croppedFile)
      setArtistProfile((prev) =>
        prev ? { ...prev, avatarUrl: publicUrl } : null,
      )
      setSuccessNotice('Artist avatar cropped, uploaded to Cloudflare R2, and synced.')
      setAvatarCropFile(null)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Handle Remove Avatar
  const handleRemoveAvatar = async () => {
    if (!artistProfile) return
    setIsUploadingAvatar(true)
    setErrorNotice(null)
    try {
      await artistsApi.updateMyProfile({ avatarUrl: null })
      setArtistProfile((prev) => (prev ? { ...prev, avatarUrl: null } : null))
      setSuccessNotice('Artist avatar removed.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to remove avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Handle Profile Update Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingEdit(true)
    setErrorNotice(null)

    try {
      const socialLinks: Record<string, string> = {}
      if (editInstagram.trim()) socialLinks.instagram = editInstagram.trim()
      if (editWebsite.trim()) socialLinks.website = editWebsite.trim()
      if (editSpotify.trim()) socialLinks.spotify = editSpotify.trim()

      const res = await artistsApi.updateMyProfile({
        stageName: editStageName.trim() || undefined,
        slug: editSlug.trim() ? slugifyText(editSlug) : undefined,
        bio: editBio.trim() || null,
        socialLinks,
      })

      setArtistProfile(res.profile)
      setIsEditingProfile(false)
      setSuccessNotice('Artist profile details updated successfully.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update profile')
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Handle Verification Application Submission
  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanLinks = verifyLinks.map((l) => l.trim()).filter(Boolean)

    if (cleanLinks.length === 0) {
      setErrorNotice(
        'Please provide at least one proof link (e.g. Spotify, official website)',
      )
      return
    }

    setIsSubmittingVerify(true)
    setErrorNotice(null)

    try {
      const res = await artistsApi.requestVerification({
        message: verifyPitch.trim(),
        contactEmail: verifyContactEmail.trim() || undefined,
        contactPhone: verifyContactPhone.trim() || undefined,
        links: cleanLinks,
      })

      setArtistProfile(res.profile)
      setShowResubmitForm(false)
      setSuccessNotice(
        'Verification application submitted for administrative review.',
      )
    } catch (err: any) {
      setErrorNotice(err.message || 'Verification submission failed')
    } finally {
      setIsSubmittingVerify(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 w-full">
      {/* Toast Alerts */}
      {successNotice && (
        <div className="p-4 mb-6 border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 font-mono text-xs shadow-2xs">
          {successNotice}
        </div>
      )}
      {errorNotice && (
        <div className="p-4 mb-6 border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-mono text-xs shadow-2xs">
          {errorNotice}
        </div>
      )}

      {/* Studio Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line mb-8">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-1">
            Maison Studio Suite
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif italic text-3xl text-ink">
              {artistProfile.stageName}
            </h1>
            {artistProfile.verified && (
              <VerifiedBadgeSVG className="w-5 h-5 text-blue" />
            )}
          </div>
          <span className="font-mono text-xs text-ink-soft">
            @{artistProfile.slug}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/artists/$idOrSlug"
            params={{ idOrSlug: artistProfile.slug }}
            className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors flex items-center gap-1.5"
          >
            <span>Public Profile</span>
            <ExternalLinkSVG className="w-3 h-3 text-ink-soft" />
          </Link>
        </div>
      </div>

      {/* Studio Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-px mb-8 font-mono text-xs uppercase tracking-[0.14em] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('releases')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'releases'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Catalog & Releases ({albums.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trash')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'trash'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          30-Day Trash ({trashAlbums.length + trashSongs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'profile'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Profile & Branding
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('verification')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'verification'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Verification Desk
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CATALOG & RELEASES */}
      {/* ========================================================================= */}
      {activeTab === 'releases' && (
        <div className="space-y-10">
          {/* Top Actions & Overview */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-serif italic text-2xl text-ink">
                Master Releases & Recordings
              </h2>
              <p className="font-sans text-xs text-ink-soft mt-0.5">
                Manage your studio master tapes, published albums, and
                standalone singles.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  resetReleaseForm()
                  setIsCreateReleaseOpen(true)
                }}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-2xs font-semibold"
              >
                <PlusIconSVG className="w-3.5 h-3.5" />
                <span>✦ New Release</span>
              </button>
            </div>
          </div>

          {/* Unified Master Release Modal */}
          {isCreateReleaseOpen && (
            <div className="p-6 border-2 border-line bg-panel shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="font-serif italic text-xl text-ink">
                    {releaseType === 'SINGLE'
                      ? 'Publish Standalone Single Release'
                      : `Publish New Master ${releaseType}`}
                  </h3>
                  <p className="font-mono text-[9.5px] text-ink-soft mt-0.5">
                    {releaseType === 'SINGLE'
                      ? 'Streamlined single release with dedicated master artwork, R2 lossless audio, and collaborator credits.'
                      : 'Multi-cut studio release with sequential tracklist ordering, R2 master cuts, and contributor attribution.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateReleaseOpen(false)}
                  className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              {/* Release Format / Type Selector */}
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-2">
                  Release Format / Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['SINGLE', 'ALBUM', 'EP', 'LP', 'MIXTAPE'] as AlbumType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setReleaseType(type)}
                      className={`font-mono text-xs uppercase tracking-wider py-1.5 px-3.5 border transition-colors cursor-pointer ${
                        releaseType === type
                          ? 'border-ink bg-ink text-canvas font-semibold'
                          : 'border-line bg-canvas text-ink-soft hover:text-ink'
                      }`}
                    >
                      {type === 'SINGLE' ? '✦ Single (1 Cut)' : type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Start: Auto-fill Metadata Assistant Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const droppedFiles = Array.from(e.dataTransfer.files).filter(
                    (f) =>
                      f.type.startsWith('audio/') ||
                      /\.(mp3|wav|flac|m4a|aac|ogg|wma)$/i.test(f.name),
                  )
                  if (droppedFiles.length === 0) return
                  if (releaseType === 'SINGLE' && droppedFiles.length === 1) {
                    handleSingleAudioFile(droppedFiles[0])
                  } else {
                    if (releaseType === 'SINGLE') {
                      setReleaseType(droppedFiles.length <= 6 ? 'EP' : 'ALBUM')
                    }
                    handleBatchImportFiles(droppedFiles)
                  }
                }}
                className="p-4 border-2 border-dashed border-line hover:border-ink bg-canvas/60 transition-colors flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 border border-line bg-panel flex items-center justify-center shrink-0">
                    <UploadCloudSVG className="w-5 h-5 text-ink" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs uppercase tracking-wider text-ink font-semibold flex items-center gap-1.5">
                      <span>✦ Quick Start: Auto-Fill from Audio Metadata</span>
                    </div>
                    <p className="font-sans text-xs text-ink-soft mt-0.5">
                      Drop audio file{releaseType !== 'SINGLE' ? 's' : ''} or browse to auto-extract release title, embedded artwork, track titles, genres, and durations. All prefilled fields remain completely editable.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="font-mono text-xs uppercase tracking-wider py-2 px-3.5 border border-ink bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5 font-semibold">
                    <span>
                      {isBatchImporting || isUploadingSingleAudio
                        ? 'Extracting & Uploading...'
                        : releaseType === 'SINGLE'
                          ? 'Select Single Audio'
                          : 'Select Audio Cuts'}
                    </span>
                    <input
                      ref={quickStartInputRef}
                      type="file"
                      accept="audio/*"
                      multiple={releaseType !== 'SINGLE'}
                      disabled={isBatchImporting || isUploadingSingleAudio}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        if (files.length === 0) return
                        if (releaseType === 'SINGLE' && files.length === 1) {
                          handleSingleAudioFile(files[0])
                        } else {
                          if (releaseType === 'SINGLE') {
                            setReleaseType(files.length <= 6 ? 'EP' : 'ALBUM')
                          }
                          handleBatchImportFiles(files)
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <form onSubmit={handlePublishRelease} className="space-y-6">
                {/* Basic Release Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      {releaseType === 'SINGLE' ? 'Single Title' : 'Release Title'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={releaseTitle}
                      onChange={(e) => setReleaseTitle(e.target.value)}
                      placeholder={
                        releaseType === 'SINGLE'
                          ? 'e.g. Autumn in Saint-Germain'
                          : 'e.g. Kind of Blue, Rue de Sèvres Sessions'
                      }
                      className="w-full font-serif italic text-base py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Release Timing
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReleaseMode('IMMEDIATE')}
                        className={`font-mono text-xs uppercase tracking-wider py-2 px-3 border transition-colors cursor-pointer text-center ${
                          releaseMode === 'IMMEDIATE'
                            ? 'border-ink bg-ink text-canvas font-semibold'
                            : 'border-line bg-canvas text-ink-soft hover:text-ink'
                        }`}
                      >
                        Immediate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReleaseMode('SCHEDULED')
                          if (!scheduledDate) {
                            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
                            setScheduledDate(tomorrow.toISOString().split('T')[0])
                            setScheduledTime('00:00')
                          }
                        }}
                        className={`font-mono text-xs uppercase tracking-wider py-2 px-3 border transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                          releaseMode === 'SCHEDULED'
                            ? 'border-ink bg-ink text-canvas font-semibold'
                            : 'border-line bg-canvas text-ink-soft hover:text-ink'
                        }`}
                      >
                        <CalendarIconSVG className="w-3.5 h-3.5" />
                        <span>Scheduled Drop</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scheduled Release Date & Time Settings */}
                {releaseMode === 'SCHEDULED' && (
                  <div className="p-4 border border-blue/40 bg-blue/5 space-y-3">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-blue font-semibold">
                      <CalendarIconSVG className="w-3.5 h-3.5" />
                      <span>Scheduled Drop & Pre-Save Configuration</span>
                    </div>
                    <p className="font-sans text-xs text-ink-soft">
                      Specify when your {releaseType.toLowerCase()} officially drops. Listeners can pre-save the release to their library immediately. Full audio playback remains locked until this exact timestamp.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft block mb-1">
                          Release Date (Local) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          min={new Date().toISOString().split('T')[0]}
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                        />
                      </div>
                      <div>
                        <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft block mb-1">
                          Release Time (Local) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="time"
                          required
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Catalog Visibility Tier Selector */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Catalog Visibility Tier
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      {
                        key: 'PUBLIC',
                        label: 'Public',
                        desc: 'Discoverable in search, artist profile, and pre-save feeds.',
                      },
                      {
                        key: 'UNLISTED',
                        label: 'Unlisted',
                        desc: 'Hidden from search; accessible only via private secret share token link.',
                      },
                      {
                        key: 'PRIVATE',
                        label: 'Private',
                        desc: 'Strictly restricted to you and collaborators in Studio.',
                      },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setReleaseVisibility(opt.key as ReleaseVisibility)}
                        className={`text-left p-3 border transition-colors cursor-pointer ${
                          releaseVisibility === opt.key
                            ? 'border-ink bg-canvas shadow-2xs ring-1 ring-ink'
                            : 'border-line bg-panel hover:bg-canvas'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink">
                            {opt.label}
                          </span>
                          {releaseVisibility === opt.key && (
                            <span className="font-mono text-xs text-blue">●</span>
                          )}
                        </div>
                        <p className="font-sans text-[11px] text-ink-soft leading-snug">
                          {opt.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Release Artwork Upload (Square 1:1) */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    {releaseType === 'SINGLE' ? 'Single Cover Artwork (Cloudflare R2)' : 'Release Cover Artwork (Cloudflare R2)'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <p className="font-sans text-xs text-ink-soft mb-2">
                    Square artwork (1:1 ratio), minimum 1400x1400px recommended (JPEG, PNG, or WebP). Stored on Cloudflare R2 edge CDN.
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 border border-line bg-canvas-deep flex items-center justify-center overflow-hidden shrink-0">
                      {releaseCoverPreview || releaseCoverUrl ? (
                        <img
                          src={releaseCoverPreview || releaseCoverUrl}
                          alt="Cover preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <DiscIconSVG className="w-8 h-8 text-ink-soft/40" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-1.5">
                          <span>
                            {isUploadingCover
                              ? 'Uploading to R2...'
                              : releaseCoverPreview || releaseCoverUrl
                                ? 'Replace Artwork'
                                : 'Upload Cover Artwork'}
                          </span>
                          <input
                            ref={coverInputRef}
                            type="file"
                            accept="image/*"
                            disabled={isUploadingCover}
                            onChange={handleCoverSelect}
                            className="hidden"
                          />
                        </label>
                        {(releaseCoverPreview || releaseCoverUrl) && (
                          <button
                            type="button"
                            onClick={handleRemoveCover}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-2.5 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <span className="font-mono text-[9px] text-ink-soft">
                        {releaseCoverPreview || releaseCoverUrl
                          ? '✓ Artwork attached to release'
                          : 'Official release artwork required'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Liner Notes & Description */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Liner Notes & Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={releaseDescription}
                    onChange={(e) => setReleaseDescription(e.target.value)}
                    placeholder="Recording location, inspiration, gear, or credits..."
                    className="w-full font-sans text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y"
                  />
                </div>

                {/* Creator Governance: Comments & Discussions */}
                <div className="p-3.5 border border-line bg-panel flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block font-semibold">
                      Discussion &amp; Comments
                    </span>
                    <p className="font-sans text-xs text-ink-soft">
                      Allow listeners and curators to post comments and replies on this release.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={releaseAllowComments}
                      onChange={(e) => setReleaseAllowComments(e.target.checked)}
                      className="accent-blue w-4 h-4"
                    />
                    <span className="font-mono text-xs text-ink font-medium">
                      {releaseAllowComments ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                {/* ADAPTIVE SECTION A: SINGLE RELEASE STREAMLINED FLOW */}
                {releaseType === 'SINGLE' ? (
                  <div className="pt-4 border-t border-line-soft space-y-4">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink block">
                      Single Master Recording
                    </span>

                    {/* Master Audio Section */}
                    <div className="p-3.5 border border-line bg-canvas space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink font-semibold">
                          Master Audio Recording
                        </span>
                        <label className="font-mono text-xs uppercase tracking-wider text-ink-soft flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleTrackExplicit}
                            onChange={(e) => setSingleTrackExplicit(e.target.checked)}
                          />
                          <span>Explicit Content</span>
                        </label>
                      </div>

                      {singleTrackAudioKey || singleTrackAudioUrl ? (
                        <div className="p-3 border border-green-500/40 bg-green-500/10 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-green-600 text-canvas flex items-center justify-center font-mono text-xs font-bold shrink-0">
                              ✓
                            </span>
                            <div className="min-w-0">
                              <div className="font-serif italic text-sm text-ink truncate">
                                {singleTrackAudioFileName || releaseTitle || 'Master Audio Track'}
                              </div>
                              <div className="font-mono text-[9.5px] text-ink-soft">
                                Audio file added successfully &bull; Duration: {formatDuration(singleTrackDuration)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled
                              className="font-mono text-[9.5px] uppercase tracking-wider py-1.5 px-3 border border-line-soft bg-canvas text-ink-soft/60 cursor-not-allowed"
                              title="An audio master is already uploaded. Reset audio to choose another."
                            >
                              ✓ Audio Attached
                            </button>
                            <button
                              type="button"
                              onClick={handleResetSingleAudio}
                              className="font-mono text-[9.5px] uppercase tracking-wider py-1.5 px-3 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 bg-panel cursor-pointer transition-colors"
                              title="Remove uploaded audio and select a new file"
                            >
                              ✕ Reset Audio
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-dashed border-line bg-panel">
                          <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-4 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-2 self-start">
                            <span>
                              {isUploadingSingleAudio
                                ? 'Uploading Master Audio to R2...'
                                : 'Select Audio Master (FLAC/WAV/MP3)'}
                            </span>
                            <input
                              ref={singleAudioInputRef}
                              type="file"
                              accept="audio/*"
                              disabled={isUploadingSingleAudio}
                              onChange={handleSingleAudioSelect}
                              className="hidden"
                            />
                          </label>
                          <span className="font-mono text-[9.5px] text-ink-soft">
                            Lossless FLAC, WAV, or 320kbps MP3
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Genre Input */}
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                        Genre
                      </label>
                      <input
                        type="text"
                        value={singleTrackGenre}
                        onChange={(e) => setSingleTrackGenre(e.target.value)}
                        placeholder="e.g. Modern Jazz, Neo-Soul, Ambient Electronic"
                        className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                      />
                    </div>

                    {/* Collaborator & Credit Attribution */}
                    <div className="pt-2 border-t border-line-soft">
                      <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft block mb-1.5">
                        Collaborators & Credits (Featured / Producers / Composers / Lyricists / Engineers)
                      </span>
                      <ArtistCreditPicker
                        credits={singleTrackCredits}
                        onChange={setSingleTrackCredits}
                        currentArtistId={artistProfile.id}
                      />
                    </div>
                  </div>
                ) : (
                  /* ADAPTIVE SECTION B: MULTI-TRACK ALBUM / EP / LP / MIXTAPE BUILDER */
                  <div className="pt-4 border-t border-line-soft space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink">
                        Master Cuts / Tracklist ({draftTracks.length})
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] py-1 px-2.5 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-1 font-medium">
                          <span>{isBatchImporting ? 'Importing Cuts...' : '✦ Batch Import Cuts'}</span>
                          <input
                            ref={batchCutsInputRef}
                            type="file"
                            accept="audio/*"
                            multiple
                            disabled={isBatchImporting}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || [])
                              if (files.length > 0) handleBatchImportFiles(files)
                            }}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftTracks([
                              ...draftTracks,
                              {
                                id: crypto.randomUUID(),
                                title: '',
                                genre: '',
                                durationSeconds: 0,
                                isExplicit: false,
                                credits: [],
                              },
                            ])
                          }
                          className="font-mono text-[9.5px] uppercase tracking-[0.12em] py-1 px-2.5 border border-dashed border-line text-ink-soft hover:text-ink cursor-pointer"
                        >
                          + Add Cut
                        </button>
                      </div>
                    </div>

                    {duplicateNotice && duplicateNotice.count > 0 && (
                      <div className="p-3 border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2.5 rounded-xs animate-in fade-in duration-150">
                        <span className="font-mono text-xs shrink-0 mt-0.5">⚠️</span>
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <p className="font-sans font-medium">
                            <strong>{duplicateNotice.count}</strong> duplicate cut(s) were automatically detected and excluded:
                          </p>
                          <p className="font-sans text-[11px] opacity-90 truncate">
                            {duplicateNotice.titles.join(', ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDuplicateNotice(null)}
                          className="font-mono text-[10px] text-ink-soft hover:text-ink cursor-pointer ml-auto shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div className="space-y-3">
                      {draftTracks.map((draft, idx) => (
                        <div
                          key={draft.id}
                          className="p-3.5 border border-line bg-canvas space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <span className="font-mono text-xs text-ink-soft w-6">
                              {String(idx + 1).padStart(2, '0')}
                            </span>

                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                              <input
                                type="text"
                                required
                                placeholder="Cut Title"
                                value={draft.title}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setDraftTracks((prev) =>
                                    prev.map((t) =>
                                      t.id === draft.id ? { ...t, title: val } : t,
                                    ),
                                  )
                                }}
                                className="font-serif italic text-xs py-1.5 px-2.5 border border-line bg-panel text-ink"
                              />

                              <input
                                type="text"
                                placeholder="Genre (e.g. Jazz)"
                                value={draft.genre}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setDraftTracks((prev) =>
                                    prev.map((t) =>
                                      t.id === draft.id ? { ...t, genre: val } : t,
                                    ),
                                  )
                                }}
                                className="font-mono text-xs py-1.5 px-2.5 border border-line bg-panel text-ink"
                              />

                              <div className="flex items-center gap-2">
                                <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={draft.isExplicit}
                                    onChange={(e) => {
                                      const val = e.target.checked
                                      setDraftTracks((prev) =>
                                        prev.map((t) =>
                                          t.id === draft.id
                                            ? { ...t, isExplicit: val }
                                            : t,
                                        ),
                                      )
                                    }}
                                  />
                                  <span>Explicit</span>
                                </label>

                                {draft.durationSeconds > 0 && (
                                  <span className="font-mono text-[10px] text-ink-soft ml-auto">
                                    {formatDuration(draft.durationSeconds)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Audio Upload Input for this track */}
                            <div className="flex items-center gap-2 shrink-0">
                              {draft.audioUrl || draft.rawAudioKey ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300 flex items-center gap-1">
                                    <span>✓</span>
                                    <span>{formatDuration(draft.durationSeconds)}</span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled
                                    className="font-mono text-[9px] uppercase tracking-wider py-1 px-2 border border-line-soft bg-canvas text-ink-soft/60 cursor-not-allowed"
                                    title="Master audio attached. Use reset to replace."
                                  >
                                    Attached
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResetDraftAudio(draft.id)}
                                    className="font-mono text-[9px] uppercase tracking-wider py-1 px-2 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 bg-panel cursor-pointer transition-colors"
                                    title="Reset audio file for this cut"
                                  >
                                    ✕ Reset
                                  </button>
                                </div>
                              ) : (
                                <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] py-1.5 px-2.5 border border-line bg-panel hover:border-ink text-ink cursor-pointer">
                                  <span>
                                    {draft.isUploadingAudio
                                      ? 'Uploading...'
                                      : 'Select Audio (FLAC/MP3)'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="audio/*"
                                    disabled={draft.isUploadingAudio}
                                    onChange={(e) =>
                                      handleDraftAudioSelect(draft.id, e)
                                    }
                                    className="hidden"
                                  />
                                </label>
                              )}

                              {draftTracks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDraftCut(draft.id)}
                                  className="p-1 text-ink-soft hover:text-red-500 cursor-pointer"
                                  title="Remove Cut"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Collaborator & Credit Attribution */}
                          <div className="pt-2 border-t border-line-soft/60">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                                Collaborators & Credits (Featured / Producers / Composers)
                              </span>
                            </div>
                            <ArtistCreditPicker
                              credits={draft.credits || []}
                              onChange={(newCredits) =>
                                setDraftTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === draft.id ? { ...t, credits: newCredits } : t,
                                  ),
                                )
                              }
                              currentArtistId={artistProfile.id}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-3 border-t border-line">
                  <button
                    type="submit"
                    disabled={isSubmittingRelease}
                    className="font-mono text-xs uppercase tracking-[0.16em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold flex items-center gap-2"
                  >
                    {isSubmittingRelease ? (
                      <span>
                        {releaseMode === 'SCHEDULED'
                          ? 'Scheduling Master Release...'
                          : 'Publishing Master Release...'}
                      </span>
                    ) : releaseMode === 'SCHEDULED' ? (
                      <>
                        <CalendarIconSVG className="w-3.5 h-3.5" />
                        <span>Schedule {releaseType === 'SINGLE' ? 'Single' : releaseType}</span>
                      </>
                    ) : releaseType === 'SINGLE' ? (
                      <span>✦ Publish Single Release</span>
                    ) : (
                      <span>Publish Master {releaseType}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreateReleaseOpen(false)}
                    className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Releases List */}
          <div className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Active Releases ({albums.length})
            </h3>

            {isLoadingReleases ? (
              <div className="p-8 text-center font-mono text-xs text-ink-soft animate-pulse">
                Querying studio releases...
              </div>
            ) : albums.length === 0 ? (
              <div className="p-10 border border-dashed border-line bg-panel text-center">
                <DiscIconSVG className="w-10 h-10 text-ink-soft/40 mx-auto mb-2" />
                <p className="font-serif italic text-base text-ink">
                  No active master releases yet
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft mt-1">
                  Click "+ New Release" above to release your first album, EP or
                  single.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {albums.map((album) => {
                  const isExpanded = expandedAlbumId === album.id
                  const tracks = albumTrackMap[album.id] || []

                  return (
                    <div
                      key={album.id}
                      className="border border-line bg-panel p-4 sm:p-5 shadow-2xs space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-16 h-16 bg-canvas-deep border border-line shrink-0 overflow-hidden relative">
                            {album.coverImageUrl ? (
                              <img
                                src={album.coverImageUrl}
                                alt={album.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <DiscIconSVG className="w-6 h-6 text-ink-soft/40" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-line bg-canvas text-blue font-semibold">
                                {album.albumType}
                              </span>

                              {/* Status Badge */}
                              {album.status === 'SCHEDULED' ? (
                                <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-blue/40 bg-blue/10 text-blue font-semibold flex items-center gap-1">
                                  <CalendarIconSVG className="w-2.5 h-2.5" />
                                  <span>
                                    Scheduled &bull;{' '}
                                    {album.scheduledReleaseAt
                                      ? new Date(album.scheduledReleaseAt).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : 'Upcoming'}
                                  </span>
                                </span>
                              ) : album.status === 'DRAFT' ? (
                                <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold">
                                  Draft
                                </span>
                              ) : (
                                <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold">
                                  Published
                                </span>
                              )}

                              {/* Quick Visibility Selector */}
                              <div className="flex items-center gap-1">
                                <select
                                  value={album.visibility || 'PUBLIC'}
                                  onChange={(e) =>
                                    handleQuickChangeVisibility(
                                      album,
                                      e.target.value as ReleaseVisibility,
                                    )
                                  }
                                  className={`font-mono text-[8.5px] uppercase tracking-wider px-2 py-0.5 border cursor-pointer focus:outline-none font-semibold ${
                                    album.visibility === 'UNLISTED'
                                      ? 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                                      : album.visibility === 'PRIVATE'
                                        ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                                        : 'border-line bg-canvas text-ink-soft hover:text-ink'
                                  }`}
                                  title="Change release visibility tier"
                                >
                                  <option value="PUBLIC">🌍 Public</option>
                                  <option value="UNLISTED">🔗 Unlisted</option>
                                  <option value="PRIVATE">🔒 Private</option>
                                </select>
                              </div>

                              {/* Pre-saves Count for Scheduled Releases */}
                              {album.status === 'SCHEDULED' && (
                                <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-line bg-canvas text-ink-soft">
                                  ✦ {album.preSavesCount ?? 0} Pre-saves
                                </span>
                              )}

                              <span className="font-mono text-[10px] text-ink-soft">
                                {album.releaseDate
                                  ? new Date(
                                      album.releaseDate,
                                    ).toLocaleDateString()
                                  : 'Recent'}
                              </span>
                            </div>
                            <h4 className="font-serif italic text-lg text-ink truncate mt-0.5">
                              {album.title}
                            </h4>
                            <div className="font-mono text-[10px] text-ink-soft">
                              {album.totalTracks} cuts &bull;{' '}
                              {formatDuration(album.totalDurationSeconds)}{' '}
                              &bull; {album.likesCount} likes
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                          {album.visibility === 'UNLISTED' && album.shareToken && (
                            <button
                              type="button"
                              onClick={() => {
                                const shareUrl = `${window.location.origin}/albums/${album.slug}?shareToken=${album.shareToken}`
                                navigator.clipboard.writeText(shareUrl)
                                setSuccessNotice(`Copied secret share link for "${album.title}"!`)
                              }}
                              className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 cursor-pointer transition-colors"
                              title="Copy secret link with share token"
                            >
                              Copy Secret Link
                            </button>
                          )}

                          <Link
                            to="/albums/$idOrSlug"
                            params={{ idOrSlug: album.slug }}
                            search={album.shareToken ? { shareToken: album.shareToken } : {}}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink transition-colors flex items-center gap-1"
                          >
                            <span>View</span>
                            <ExternalLinkSVG className="w-2.5 h-2.5 text-ink-soft" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(album)}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Edit release metadata, artwork, genre, credits and visibility"
                          >
                            <EditIconSVG className="w-3 h-3 text-ink-soft" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleAlbumExpand(album.id)}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer"
                          >
                            {isExpanded ? 'Hide Cuts' : 'Inspect Cuts'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteAlbum(
                                album.id,
                                album.title,
                                album.totalTracks || tracks.length || 1,
                              )
                            }
                            className="p-1.5 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                            title="Move to 30-Day Trash"
                          >
                            <TrashIconSVG className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Tracklist & Detach Feature */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-line-soft space-y-2">
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft block mb-2">
                            Included Master Cuts ({tracks.length})
                          </span>

                          {isLoadingAlbumTracks && tracks.length === 0 ? (
                            <div className="font-mono text-xs text-ink-soft animate-pulse">
                              Loading tracks...
                            </div>
                          ) : tracks.length === 0 ? (
                            <div className="font-sans text-xs text-ink-soft italic">
                              No tracks in this album.
                            </div>
                          ) : (
                            <div className="divide-y divide-line/40 border border-line-soft bg-canvas">
                              {tracks.map((track, i) => (
                                <div
                                  key={track.id}
                                  className="p-2.5 flex items-center justify-between text-xs gap-3"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="font-mono text-[10px] text-ink-soft w-5">
                                      {String(
                                        track.trackNumber || i + 1,
                                      ).padStart(2, '0')}
                                    </span>
                                    <span className="font-serif italic text-ink truncate">
                                      {track.title}
                                    </span>
                                    {track.isExplicit && (
                                      <span className="font-mono text-[8px] px-1 border border-line text-ink-soft">
                                        E
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono text-[10px] text-ink-soft">
                                      {formatDuration(track.durationSeconds)}
                                    </span>

                                    {album.albumType !== 'SINGLE' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenDetachModal(track, album)
                                        }
                                        className="font-mono text-[9px] uppercase tracking-wider py-1 px-2 border border-line-soft bg-panel hover:border-ink text-ink-soft hover:text-ink cursor-pointer"
                                        title="Detach cut and spin off into standalone single with optional custom artwork"
                                      >
                                        Detach Cut
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteSong(
                                          track.id,
                                          track.title,
                                          album.id,
                                          tracks.length,
                                        )
                                      }
                                      className="p-1 text-ink-soft hover:text-red-500 cursor-pointer"
                                      title="Trash track"
                                    >
                                      <TrashIconSVG className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 30-DAY TRASH & ARCHIVE */}
      {/* ========================================================================= */}
      {activeTab === 'trash' && (
        <div className="space-y-6">
          <div className="p-4 border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 font-sans text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] font-semibold block mb-0.5">
                30-Day Recovery Guarantee
              </span>
              <p className="leading-relaxed">
                Archived releases and master recordings are retained in this safe
                vault for 30 days before irreversible purging. You can restore
                them to your active catalog at any time, or permanently purge them.
              </p>
            </div>
            {(trashAlbums.length > 0 || trashSongs.length > 0) && (
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setTrashConfirm({ type: 'empty' })}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors font-semibold cursor-pointer shrink-0"
              >
                {isPurging ? 'Emptying...' : 'Empty Trash'}
              </button>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Archived Releases ({trashAlbums.length})
            </h3>

            {isLoadingTrash ? (
              <div className="p-6 text-center font-mono text-xs text-ink-soft animate-pulse">
                Loading trash archive...
              </div>
            ) : trashAlbums.length === 0 ? (
              <div className="p-6 border border-line bg-panel text-center font-mono text-xs text-ink-soft">
                Trash is empty. No deleted albums found.
              </div>
            ) : (
              <div className="space-y-3">
                {trashAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="p-4 border border-line bg-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 bg-canvas border border-line text-ink-soft">
                          {album.albumType}
                        </span>
                        <h4 className="font-serif italic text-base text-ink truncate">
                          {album.title}
                        </h4>
                      </div>
                      <span className="font-mono text-[9px] text-ink-soft mt-0.5 block">
                        Deleted:{' '}
                        {album.deletedAt
                          ? new Date(album.deletedAt).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreAlbum(album.id)}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3.5 bg-ink text-canvas hover:opacity-90 cursor-pointer flex items-center gap-1.5"
                      >
                        <UndoIconSVG className="w-3 h-3" />
                        <span>Restore Release</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPurging}
                        onClick={() =>
                          setTrashConfirm({
                            type: 'permanent_release',
                            id: album.id,
                            title: album.title,
                          })
                        }
                        className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3 border border-red-500/40 hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold cursor-pointer transition-colors"
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archived Songs */}
          {trashSongs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-line-soft">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Archived Master Cuts ({trashSongs.length})
              </h3>

              <div className="space-y-2">
                {trashSongs.map((song) => (
                  <div
                    key={song.id}
                    className="p-3 border border-line bg-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <span className="font-serif italic text-sm text-ink truncate block">
                        {song.title}
                      </span>
                      <span className="font-mono text-[9px] text-ink-soft">
                        Deleted:{' '}
                        {song.deletedAt
                          ? new Date(song.deletedAt).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreSong(song.id)}
                        className="font-mono text-[9.5px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer flex items-center gap-1"
                      >
                        <UndoIconSVG className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPurging}
                        onClick={() =>
                          setTrashConfirm({
                            type: 'permanent_song',
                            id: song.id,
                            title: song.title,
                          })
                        }
                        className="font-mono text-[9.5px] uppercase tracking-[0.14em] py-1.5 px-3 border border-red-500/40 hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold cursor-pointer transition-colors"
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* ========================================================================= */}
      {/* TAB 3: PROFILE & BRANDING */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-10">
          {/* Avatar Customizer */}
          <div className="p-6 border border-line bg-panel shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="font-serif italic text-xl text-ink">
                  Artist Avatar / Profile Picture
                </h2>
                <p className="font-sans text-xs text-ink-soft mt-0.5">
                  Square profile artwork used for artist credits, jam sessions, and search results.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {artistProfile.avatarUrl && (
                  <button
                    type="button"
                    disabled={isUploadingAvatar}
                    onClick={handleRemoveAvatar}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3 border border-line bg-canvas hover:border-red-500/40 hover:text-red-500 text-ink-soft transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  disabled={isUploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-xs"
                >
                  <UploadCloudSVG className="w-4 h-4" />
                  <span>
                    {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
                  </span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-line bg-canvas-deep overflow-hidden relative shrink-0 flex items-center justify-center shadow-inner">
                {artistProfile.avatarUrl ? (
                  <img
                    src={artistProfile.avatarUrl}
                    alt={artistProfile.stageName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-serif italic text-3xl sm:text-4xl text-ink-soft select-none">
                    {artistProfile.stageName.charAt(0).toUpperCase()}
                  </span>
                )}
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-canvas/80 backdrop-blur-xs flex items-center justify-center font-mono text-[9px] text-ink animate-pulse text-center p-1">
                    Uploading...
                  </div>
                )}
              </div>

              <div className="font-mono text-xs text-ink-soft space-y-1">
                <div className="text-ink font-serif italic text-base">
                  {artistProfile.stageName}
                </div>
                <p className="text-[11px] text-ink-soft/80">
                  Recommended: Minimum 500 × 500px square image. An interactive cropper with circular guide is provided before upload.
                </p>
              </div>
            </div>
          </div>

          {/* Banner Customizer */}
          <div className="p-6 border border-line bg-panel shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-serif italic text-xl text-ink">
                  Artist Profile Banner
                </h2>
                <p className="font-sans text-xs text-ink-soft mt-0.5">
                  Panoramic cover displayed across your public artist page. Interactive cropping and framing preview is provided before upload.
                </p>
              </div>

              <button
                type="button"
                disabled={isUploadingBanner}
                onClick={() => bannerInputRef.current?.click()}
                className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0"
              >
                <UploadCloudSVG className="w-4 h-4" />
                <span>
                  {isUploadingBanner ? 'Uploading to R2...' : 'Upload Banner'}
                </span>
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                onChange={handleBannerSelect}
                className="hidden"
              />
            </div>

            <div className="w-full h-44 sm:h-56 bg-canvas-deep border border-line overflow-hidden relative">
              {artistProfile.bannerUrl ? (
                <img
                  src={artistProfile.bannerUrl}
                  alt="Artist banner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-ink-soft font-mono text-xs">
                  <UploadCloudSVG className="w-8 h-8 opacity-40 mb-2" />
                  <span>No banner uploaded yet</span>
                </div>
              )}
              {isUploadingBanner && (
                <div className="absolute inset-0 bg-canvas/80 backdrop-blur-xs flex items-center justify-center font-mono text-xs text-ink animate-pulse">
                  Transferring asset to Cloudflare R2 storage...
                </div>
              )}
            </div>
          </div>

          {/* Identity & Details Editor */}
          <div className="p-6 border border-line bg-panel shadow-2xs">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-line-soft">
              <div>
                <h2 className="font-serif italic text-xl text-ink">
                  Identity & Presentation
                </h2>
                <p className="font-sans text-xs text-ink-soft mt-0.5">
                  Customize your public stage name, biography, and external links.
                </p>
              </div>

              {!isEditingProfile && (
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink transition-colors cursor-pointer"
                >
                  Edit Details
                </button>
              )}
            </div>

            {isEditingProfile ? (
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Stage Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editStageName}
                      onChange={(e) => setEditStageName(e.target.value)}
                      className="w-full font-serif italic text-sm py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Vanity Slug
                    </label>
                    <input
                      type="text"
                      required
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Biography
                  </label>
                  <textarea
                    rows={4}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full font-sans text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                      Instagram
                    </label>
                    <input
                      type="url"
                      value={editInstagram}
                      onChange={(e) => setEditInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className="w-full font-mono text-xs py-1.5 px-2.5 border border-line bg-canvas text-ink"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      placeholder="https://..."
                      className="w-full font-mono text-xs py-1.5 px-2.5 border border-line bg-canvas text-ink"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                      Spotify
                    </label>
                    <input
                      type="url"
                      value={editSpotify}
                      onChange={(e) => setEditSpotify(e.target.value)}
                      placeholder="https://open.spotify.com/..."
                      className="w-full font-mono text-xs py-1.5 px-2.5 border border-line bg-canvas text-ink"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4 text-xs font-sans text-ink">
                <div>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block mb-1">
                    Biography
                  </span>
                  <p className="leading-relaxed whitespace-pre-line text-ink-soft">
                    {artistProfile.bio || 'No biography set yet.'}
                  </p>
                </div>

                {artistProfile.socialLinks &&
                  Object.keys(artistProfile.socialLinks).length > 0 && (
                    <div>
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block mb-2">
                        Social Channels
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(artistProfile.socialLinks).map(
                          ([k, v]) => (
                            <a
                              key={k}
                              href={v}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[10px] py-1 px-2.5 border border-line bg-canvas hover:border-ink text-ink capitalize inline-flex items-center gap-1"
                            >
                              <span>{k}</span>
                              <ExternalLinkSVG className="w-2.5 h-2.5 text-ink-soft" />
                            </a>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VERIFICATION DESK */}
      {/* ========================================================================= */}
      {activeTab === 'verification' && (
        <div className="p-6 border border-line bg-panel shadow-2xs">
          <div className="mb-6 pb-4 border-b border-line-soft">
            <h2 className="font-serif italic text-xl text-ink">
              Creator Verification
            </h2>
            <p className="font-sans text-xs text-ink-soft mt-0.5">
              Verified badges certify official recording artists and unlock
              prominent catalog placement.
            </p>
          </div>

          {artistProfile.verificationStatus === 'VERIFIED' ? (
            <div className="p-6 border border-blue/20 bg-blue/5 flex items-center gap-4">
              <VerifiedBadgeSVG className="w-8 h-8 text-blue shrink-0" />
              <div>
                <h3 className="font-serif italic text-base text-ink">
                  Officially Verified Artist
                </h3>
                <p className="font-sans text-xs text-ink-soft mt-0.5">
                  Your artist profile has been verified by the administration desk.
                  The verified emblem is active on your public profile and catalog
                  releases.
                </p>
              </div>
            </div>
          ) : artistProfile.verificationStatus === 'PENDING' ? (
            <div className="p-6 border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/10 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                <h3 className="font-serif italic text-base text-ink">
                  Application Under Review
                </h3>
              </div>
              <p className="font-sans text-xs text-ink-soft leading-relaxed">
                Your verification application was received and is queued for
                administrative audit. Proof links and official artist identities
                are usually reviewed within 24-48 hours.
              </p>
              {artistProfile.verificationDetails?.message && (
                <div className="mt-2 p-3 border border-line-soft bg-canvas/60 font-sans text-xs text-ink-soft italic">
                  "{artistProfile.verificationDetails.message}"
                </div>
              )}
            </div>
          ) : artistProfile.verificationStatus === 'REJECTED' &&
            !showResubmitForm ? (
            <div className="p-6 border border-red-300/60 bg-red-50/40 dark:bg-red-950/10 flex flex-col gap-4">
              <div>
                <h3 className="font-serif italic text-base text-red-600 dark:text-red-400">
                  Application Needs Revision
                </h3>
                <p className="font-sans text-xs text-ink-soft mt-1">
                  The administrative review requested adjustments to your
                  verification materials:
                </p>
                <div className="mt-2 p-3 border border-red-200 dark:border-red-900/40 bg-canvas font-mono text-xs text-red-700 dark:text-red-300">
                  {artistProfile.rejectionReason ||
                    'Please provide verifiable official links.'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowResubmitForm(true)
                  setVerifyPitch(
                    artistProfile.verificationDetails?.message || '',
                  )
                  if (artistProfile.verificationDetails?.links) {
                    setVerifyLinks(artistProfile.verificationDetails.links)
                  }
                }}
                className="self-start font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer"
              >
                Update & Resubmit Application &rarr;
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitVerification}
              className="flex flex-col gap-5"
            >
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                  Verification Pitch / Artist Background{' '}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={verifyPitch}
                  onChange={(e) => setVerifyPitch(e.target.value)}
                  placeholder="Briefly describe your musical career, past releases, live performances, or label affiliations..."
                  className="w-full font-sans text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={verifyContactEmail}
                    onChange={(e) => setVerifyContactEmail(e.target.value)}
                    placeholder="artist@example.com"
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={verifyContactPhone}
                    onChange={(e) => setVerifyContactPhone(e.target.value)}
                    placeholder="+1 555-0199"
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                  Official Proof & Portfolio Links{' '}
                  <span className="text-red-500">*</span>
                </label>
                <p className="font-sans text-xs text-ink-soft mb-3">
                  Include links to verified Spotify, Apple Music, Bandcamp,
                  official website, or press articles.
                </p>

                <div className="flex flex-col gap-2">
                  {verifyLinks.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="url"
                        required
                        value={link}
                        onChange={(e) => {
                          const copy = [...verifyLinks]
                          copy[idx] = e.target.value
                          setVerifyLinks(copy)
                        }}
                        placeholder="https://open.spotify.com/artist/..."
                        className="flex-1 font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                      />
                      {verifyLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyLinks(
                              verifyLinks.filter((_, i) => i !== idx),
                            )
                          }}
                          className="font-mono text-xs py-2 px-3 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}

                  {verifyLinks.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setVerifyLinks([...verifyLinks, ''])}
                      className="self-start font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-dashed border-line text-ink-soft hover:text-ink hover:border-ink cursor-pointer mt-1"
                    >
                      + Add Another Link
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingVerify}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
                >
                  {isSubmittingVerify
                    ? 'Submitting...'
                    : 'Submit Verification Request'}
                </button>
                {showResubmitForm && (
                  <button
                    type="button"
                    onClick={() => setShowResubmitForm(false)}
                    className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Detach Cut Modal */}
      {detachModalData && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-panel border-2 border-line shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft block">
                  Catalog Action &bull; Spin-off Single
                </span>
                <h3 className="font-serif italic text-xl text-ink">
                  Detach Cut
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseDetachModal}
                disabled={isSubmittingDetach}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50"
              >
                ✕ Close
              </button>
            </div>

            <p className="font-sans text-xs text-ink-soft leading-relaxed">
              Detaching <strong className="text-ink font-medium font-serif italic">"{detachModalData.song.title}"</strong> from <strong className="text-ink font-medium font-serif italic">{detachModalData.parentAlbum.title}</strong> will turn it into an independent standalone <span className="font-mono text-[11px] font-semibold text-ink">SINGLE</span> release.
            </p>

            {/* Artwork Selection */}
            <div className="space-y-3 pt-1 border-t border-line-soft">
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block">
                Cover Artwork for New Single
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 border border-line bg-canvas-deep flex items-center justify-center overflow-hidden shrink-0">
                  {detachCoverUrl || detachModalData.parentAlbum.coverImageUrl ? (
                    <img
                      src={
                        detachCoverUrl ||
                        detachModalData.parentAlbum.coverImageUrl ||
                        ''
                      }
                      alt="Single Cover Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <DiscIconSVG className="w-8 h-8 text-ink-soft/40" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-1.5">
                      <span>
                        {isUploadingDetachCover
                          ? 'Uploading to R2...'
                          : detachCoverUrl
                            ? 'Replace Custom Artwork'
                            : 'Upload Custom Single Artwork'}
                      </span>
                      <input
                        ref={detachCoverInputRef}
                        type="file"
                        accept="image/*"
                        disabled={isUploadingDetachCover || isSubmittingDetach}
                        onChange={handleDetachCoverSelect}
                        className="hidden"
                      />
                    </label>
                    {detachCoverUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setDetachCoverUrl('')
                          if (detachCoverInputRef.current)
                            detachCoverInputRef.current.value = ''
                        }}
                        className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-2 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                      >
                        Revert to Album Art
                      </button>
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-ink-soft">
                    {detachCoverUrl
                      ? 'Custom cover uploaded (Cloudflare R2 edge).'
                      : 'Will inherit parent album cover if no custom image is uploaded.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={handleCloseDetachModal}
                disabled={isSubmittingDetach}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDetach}
                disabled={isSubmittingDetach || isUploadingDetachCover}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
              >
                {isSubmittingDetach
                  ? 'Detaching Cut...'
                  : '✦ Detach & Spin Off Single'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Master Release Modal */}
      {editingAlbum && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-3xl w-full bg-panel border-2 border-line shadow-2xl p-6 sm:p-7 space-y-6 my-auto max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft block">
                  Studio Suite &bull; Master Release Editor
                </span>
                <h3 className="font-serif italic text-2xl text-ink">
                  Edit Release: {editingAlbum.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isSavingRelease}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50"
              >
                ✕ Close
              </button>
            </div>

            {isLoadingEditData ? (
              <div className="py-16 text-center font-mono text-xs text-ink-soft animate-pulse">
                Loading release details, master cuts &amp; collaborator credits...
              </div>
            ) : (
              <form onSubmit={handleSaveReleaseEdit} className="space-y-6">
                {/* Basic Metadata Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Release Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editReleaseTitle}
                      onChange={(e) => setEditReleaseTitle(e.target.value)}
                      placeholder="Release title"
                      className="w-full font-serif italic text-base py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Release Format
                    </label>
                    <select
                      value={editReleaseType}
                      onChange={(e) => setEditReleaseType(e.target.value as AlbumType)}
                      className="w-full font-mono text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    >
                      {(['SINGLE', 'ALBUM', 'EP', 'LP', 'MIXTAPE'] as AlbumType[]).map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Genre & Cover Art Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Primary Genre
                    </label>
                    <input
                      type="text"
                      value={editReleaseGenre}
                      onChange={(e) => setEditReleaseGenre(e.target.value)}
                      placeholder="e.g. Neo-Soul, Ambient Jazz, Synthwave"
                      className="w-full font-mono text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    />
                    <p className="font-mono text-[9px] text-ink-soft mt-1.5">
                      Used for catalog indexing, genre discovery &amp; radio curation.
                    </p>
                  </div>

                  {/* Cover Artwork */}
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Master Cover Artwork
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-canvas-deep border border-line shrink-0 overflow-hidden flex items-center justify-center">
                        {editReleaseCoverUrl ? (
                          <img
                            src={editReleaseCoverUrl}
                            alt="Cover preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <DiscIconSVG className="w-6 h-6 text-ink-soft/40" />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-1.5">
                          <span>
                            {isUploadingEditCover
                              ? 'Uploading to R2...'
                              : 'Upload Replacement Artwork'}
                          </span>
                          <input
                            ref={editCoverInputRef}
                            type="file"
                            accept="image/*"
                            disabled={isUploadingEditCover || isSavingRelease}
                            onChange={handleEditCoverSelect}
                            className="hidden"
                          />
                        </label>
                        <p className="font-mono text-[9px] text-ink-soft">
                          Direct Cloudflare R2 upload (PNG, JPG, WEBP).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Catalog Visibility Tier Selector */}
                <div className="space-y-2 pt-2 border-t border-line-soft">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                      Catalog Visibility Tier
                    </label>
                    <span className="font-mono text-[9.5px] text-ink-soft">
                      Current: <strong className="text-ink">{editReleaseVisibility}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditReleaseVisibility('PUBLIC')}
                      className={`p-3 border text-left cursor-pointer transition-colors ${
                        editReleaseVisibility === 'PUBLIC'
                          ? 'border-emerald-500/60 bg-emerald-500/10 dark:bg-emerald-950/20'
                          : 'border-line bg-canvas hover:border-ink/50'
                      }`}
                    >
                      <div className="font-mono text-[10.5px] uppercase tracking-wider font-semibold text-ink flex items-center gap-1.5">
                        <span>🌍 Public</span>
                      </div>
                      <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                        Discoverable on artist profile, search, and algorithmic radio.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditReleaseVisibility('UNLISTED')}
                      className={`p-3 border text-left cursor-pointer transition-colors ${
                        editReleaseVisibility === 'UNLISTED'
                          ? 'border-purple-500/60 bg-purple-500/10 dark:bg-purple-950/20'
                          : 'border-line bg-canvas hover:border-ink/50'
                      }`}
                    >
                      <div className="font-mono text-[10.5px] uppercase tracking-wider font-semibold text-ink flex items-center gap-1.5">
                        <span>🔗 Unlisted</span>
                      </div>
                      <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                        Hidden from search and profile. Accessible only via secret token URL.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditReleaseVisibility('PRIVATE')}
                      className={`p-3 border text-left cursor-pointer transition-colors ${
                        editReleaseVisibility === 'PRIVATE'
                          ? 'border-red-500/60 bg-red-500/10 dark:bg-red-950/20'
                          : 'border-line bg-canvas hover:border-ink/50'
                      }`}
                    >
                      <div className="font-mono text-[10.5px] uppercase tracking-wider font-semibold text-ink flex items-center gap-1.5">
                        <LockIconSVG className="w-3 h-3 text-red-500" />
                        <span>Private</span>
                      </div>
                      <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                        Strictly confidential. Visible only in your Studio suite.
                      </p>
                    </button>
                  </div>

                  {editReleaseVisibility === 'UNLISTED' && editingAlbum.shareToken && (
                    <div className="p-3 border border-purple-500/30 bg-purple-500/5 flex items-center justify-between gap-3 mt-2">
                      <div className="min-w-0 font-mono text-[10px] text-ink truncate">
                        <span className="text-ink-soft">Secret Link: </span>
                        <span className="underline">
                          {window.location.origin}/albums/{editingAlbum.slug}?shareToken={editingAlbum.shareToken}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/albums/${editingAlbum.slug}?shareToken=${editingAlbum.shareToken}`
                          navigator.clipboard.writeText(url)
                          setSuccessNotice('Copied secret share link to clipboard!')
                        }}
                        className="font-mono text-[9.5px] uppercase tracking-wider py-1 px-2.5 border border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 shrink-0 cursor-pointer"
                      >
                        Copy Link
                      </button>
                    </div>
                  )}
                </div>

                {/* Release Timing & Scheduling */}
                <div className="space-y-3 pt-2 border-t border-line-soft">
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block">
                    Release Timing &amp; Drop Scheduling
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditReleaseMode('IMMEDIATE')}
                      className={`font-mono text-xs uppercase tracking-wider py-2.5 px-3 border transition-colors cursor-pointer text-center ${
                        editReleaseMode === 'IMMEDIATE'
                          ? 'border-ink bg-ink text-canvas font-semibold'
                          : 'border-line bg-canvas text-ink-soft hover:text-ink'
                      }`}
                    >
                      Immediate / Published
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditReleaseMode('SCHEDULED')
                        if (!editReleaseDate) {
                          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
                          setEditReleaseDate(tomorrow.toISOString().split('T')[0])
                          setEditReleaseTime('00:00')
                        }
                      }}
                      className={`font-mono text-xs uppercase tracking-wider py-2.5 px-3 border transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                        editReleaseMode === 'SCHEDULED'
                          ? 'border-ink bg-ink text-canvas font-semibold'
                          : 'border-line bg-canvas text-ink-soft hover:text-ink'
                      }`}
                    >
                      <CalendarIconSVG className="w-3.5 h-3.5" />
                      <span>Scheduled Drop</span>
                    </button>
                  </div>

                  {editReleaseMode === 'SCHEDULED' && (
                    <div className="p-3.5 border border-blue/30 bg-blue/5 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft block mb-1">
                            Drop Date
                          </label>
                          <input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={editReleaseDate}
                            onChange={(e) => setEditReleaseDate(e.target.value)}
                            className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                          />
                        </div>
                        <div>
                          <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft block mb-1">
                            Drop Time (Local)
                          </label>
                          <input
                            type="time"
                            value={editReleaseTime}
                            onChange={(e) => setEditReleaseTime(e.target.value)}
                            className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                          />
                        </div>
                      </div>
                      <p className="font-mono text-[9px] text-ink-soft">
                        Fans can pre-save this release. The automated BullMQ scheduler will automatically release it to listeners at the specified time.
                      </p>
                    </div>
                  )}
                </div>

                {/* Description & Liner Notes */}
                <div className="pt-2 border-t border-line-soft">
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Release Description / Liner Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editReleaseDescription}
                    onChange={(e) => setEditReleaseDescription(e.target.value)}
                    placeholder="Liner notes, studio sessions, recording personnel, narrative..."
                    className="w-full font-sans text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y leading-relaxed"
                  />
                </div>

                {/* Creator Governance: Comments & Discussions */}
                <div className="p-3.5 border border-line bg-canvas flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block font-semibold">
                      Discussion &amp; Comments
                    </span>
                    <p className="font-sans text-xs text-ink-soft">
                      Allow listeners and curators to post comments and replies on this release.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={editReleaseAllowComments}
                      onChange={(e) => setEditReleaseAllowComments(e.target.checked)}
                      className="accent-blue w-4 h-4"
                    />
                    <span className="font-mono text-xs text-ink font-medium">
                      {editReleaseAllowComments ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                {/* Master Cuts & Collaborator Credits */}
                {editTracks.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-line-soft">
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                        Master Cuts &amp; Collaborator Credits ({editTracks.length})
                      </label>
                      <span className="font-mono text-[9.5px] text-ink-soft">
                        Edit titles, individual genres, explicit tags &amp; contributor credits
                      </span>
                    </div>

                    <div className="space-y-3">
                      {editTracks.map((track, idx) => (
                        <div
                          key={track.id}
                          className="p-3.5 border border-line bg-canvas space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <span className="font-mono text-xs text-ink-soft w-6">
                              {String(idx + 1).padStart(2, '0')}
                            </span>

                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                              <input
                                type="text"
                                required
                                value={track.title}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setEditTracks((prev) =>
                                    prev.map((t) =>
                                      t.id === track.id ? { ...t, title: val } : t,
                                    ),
                                  )
                                }}
                                placeholder="Cut Title"
                                className="font-serif italic text-xs py-1.5 px-2.5 border border-line bg-panel text-ink"
                              />

                              <input
                                type="text"
                                value={track.genre}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setEditTracks((prev) =>
                                    prev.map((t) =>
                                      t.id === track.id ? { ...t, genre: val } : t,
                                    ),
                                  )
                                }}
                                placeholder="Genre (e.g. Ambient)"
                                className="font-mono text-xs py-1.5 px-2.5 border border-line bg-panel text-ink"
                              />

                              <div className="flex items-center gap-2">
                                <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={track.isExplicit}
                                    onChange={(e) => {
                                      const val = e.target.checked
                                      setEditTracks((prev) =>
                                        prev.map((t) =>
                                          t.id === track.id ? { ...t, isExplicit: val } : t,
                                        ),
                                      )
                                    }}
                                  />
                                  <span>Explicit</span>
                                </label>

                                {track.durationSeconds > 0 && (
                                  <span className="font-mono text-[10px] text-ink-soft ml-auto">
                                    {formatDuration(track.durationSeconds)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Collaborator & Credit Attribution */}
                          <div className="pt-2 border-t border-line-soft/60">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block mb-1.5">
                              Collaborator Credits (Featured / Producers / Composers / Lyricists)
                            </span>
                            <ArtistCreditPicker
                              credits={track.credits || []}
                              onChange={(newCredits) =>
                                setEditTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === track.id ? { ...t, credits: newCredits } : t,
                                  ),
                                )
                              }
                              currentArtistId={artistProfile.id}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit / Cancel Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    disabled={isSavingRelease}
                    className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRelease || isUploadingEditCover}
                    className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold flex items-center gap-2"
                  >
                    {isSavingRelease ? (
                      <span>Saving Changes...</span>
                    ) : (
                      <span>✦ Save Release Changes</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Soft Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div className="w-full max-w-md border border-line bg-canvas p-6 shadow-2xl space-y-4 rounded-xs">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 border border-line bg-panel flex items-center justify-center text-red-500 shrink-0">
                <TrashIconSVG className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif italic text-lg text-ink font-normal">
                  {deleteConfirm.type === 'album'
                    ? 'Move Release to Trash?'
                    : 'Move Master Track to Trash?'}
                </h4>
                <p className="font-sans text-xs text-ink-soft mt-1 leading-relaxed">
                  {deleteConfirm.type === 'album' ? (
                    <>
                      Are you sure you want to move{' '}
                      <strong className="text-ink font-semibold">
                        "{deleteConfirm.title}"
                      </strong>{' '}
                      and its {deleteConfirm.trackCount || 'associated'} cut(s) to the 30-day trash? You can restore it anytime within 30 days.
                    </>
                  ) : (
                    <>
                      Are you sure you want to move{' '}
                      <strong className="text-ink font-semibold">
                        "{deleteConfirm.title}"
                      </strong>{' '}
                      to the 30-day trash?
                      {deleteConfirm.trackCount === 1 ? (
                        <span className="block text-ink font-medium mt-1">
                          Since this is the only cut in this release, the parent release will also be moved to the 30-day trash.
                        </span>
                      ) : (
                        <span className="block text-ink-soft mt-1">
                          You can restore it anytime within 30 days.
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setDeleteConfirm(null)}
                className="font-mono text-xs uppercase tracking-wider px-3.5 py-2 border border-line text-ink-soft hover:text-ink bg-panel transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={confirmSoftDelete}
                className="font-mono text-xs uppercase tracking-wider px-4 py-2 bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer font-semibold shadow-xs"
              >
                {isDeletingItem ? 'Moving...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete / Empty Trash Confirmation Modal */}
      {trashConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div className="w-full max-w-md border border-line bg-canvas p-6 shadow-2xl space-y-4 rounded-xs">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 border border-line bg-panel flex items-center justify-center text-red-500 shrink-0">
                <TrashIconSVG className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif italic text-lg text-ink font-normal">
                  {trashConfirm.type === 'empty'
                    ? 'Empty Studio Trash?'
                    : trashConfirm.type === 'permanent_release'
                      ? 'Permanently Delete Release?'
                      : 'Permanently Delete Master Cut?'}
                </h4>
                <p className="font-sans text-xs text-ink-soft mt-1 leading-relaxed">
                  {trashConfirm.type === 'empty'
                    ? 'Are you sure you want to permanently delete all items in the studio trash? All associated master audio recordings and artwork will be permanently purged from cloud storage. This action cannot be undone.'
                    : trashConfirm.type === 'permanent_release'
                      ? `Are you sure you want to permanently delete "${trashConfirm.title}" and all its audio files and artwork? This action cannot be undone.`
                      : `Are you sure you want to permanently delete "${trashConfirm.title}"? Master audio will be purged from storage. This action cannot be undone.`}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setTrashConfirm(null)}
                className="font-mono text-xs uppercase tracking-wider px-3.5 py-2 border border-line text-ink-soft hover:text-ink bg-panel transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPurging}
                onClick={() => {
                  if (trashConfirm.type === 'empty') {
                    handleEmptyTrash()
                  } else if (
                    trashConfirm.type === 'permanent_release' &&
                    trashConfirm.id
                  ) {
                    handlePermanentDeleteAlbum(trashConfirm.id)
                  } else if (
                    trashConfirm.type === 'permanent_song' &&
                    trashConfirm.id
                  ) {
                    handlePermanentDeleteSong(trashConfirm.id)
                  }
                }}
                className="font-mono text-xs uppercase tracking-wider px-4 py-2 bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer font-semibold shadow-xs"
              >
                {isPurging ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner Crop Modal */}
      <ImageCropModal
        isOpen={!!bannerCropFile}
        onClose={() => setBannerCropFile(null)}
        imageFile={bannerCropFile}
        title="Crop Artist Banner"
        subtitle="Maison Studio · Panoramic Banner"
        aspectRatio={3}
        isCircularMask={false}
        targetMaxWidth={1920}
        targetMaxHeight={640}
        isSubmitting={isUploadingBanner}
        onCropComplete={handleBannerCropComplete}
      />

      {/* Avatar Crop Modal */}
      <ImageCropModal
        isOpen={!!avatarCropFile}
        onClose={() => setAvatarCropFile(null)}
        imageFile={avatarCropFile}
        title="Crop Artist Avatar"
        subtitle="Maison Studio · Profile Avatar"
        aspectRatio={1}
        isCircularMask={true}
        targetMaxWidth={600}
        targetMaxHeight={600}
        isSubmitting={isUploadingAvatar}
        onCropComplete={handleAvatarCropComplete}
      />
    </div>
  )
}

