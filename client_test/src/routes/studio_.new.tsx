import { useState, useRef, useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  PartyPopper,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  X,
} from 'lucide-react'
import { notify } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import { isArtistAccount } from '../lib/artist-status'
import { parseAudioFile, parseAudioFilesWithPool } from '../lib/audio-metadata'
import type { SelectedCredit } from '../Components/ArtistCreditPicker'
import type { ArtistProfile } from '../types/artist'
import type { AlbumType, ReleaseVisibility } from '../types/catalog'
import { Button } from '../Components/ui'
import { Switch } from '../Components/ui/Switch'
import { H1, H3 } from '../Components/ui/typography'
import { StudioUpgradeScreen } from '../Components/studio/StudioUpgradeScreen'
import { ReleaseDetailsSection } from '../Components/studio/release/ReleaseDetailsSection'
import { TrackListEditor } from '../Components/studio/TrackListEditor'
import { ImageCropModal } from '../Components/common/ImageCropModal'
import {
  CreditPickerField,
  FieldLabel,
  MonoInput,
} from '../Components/studio/fields'

export const Route = createFileRoute('/studio_/new')({
  staticData: { layout: 'wide' },
  component: StudioNewReleasePage,
})

interface TrackDraft {
  id: string
  title: string
  genre: string
  primaryGenre?: string
  subGenre?: string
  moods?: string[]
  tags?: string[]
  bpm?: number | null
  musicalKey?: string | null
  energy?: number | null
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

const ALBUM_TYPES: { id: AlbumType; title: string; subtitle: string }[] = [
  { id: 'SINGLE', title: 'Single', subtitle: '1 track' },
  { id: 'EP', title: 'EP', subtitle: '2 to 6 tracks' },
  { id: 'ALBUM', title: 'Album', subtitle: '7+ tracks' },
  { id: 'LP', title: 'LP', subtitle: 'Full album' },
  { id: 'MIXTAPE', title: 'Mixtape', subtitle: 'Compilation' },
]

function StudioNewReleasePage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  // Deduplication notice
  const [duplicateNotice, setDuplicateNotice] = useState<{
    count: number
    titles: string[]
  } | null>(null)

  // Release metadata state
  const [releaseTitle, setReleaseTitle] = useState('')
  const [releaseType, setReleaseType] = useState<AlbumType>('SINGLE')
  const [releaseDescription, setReleaseDescription] = useState('')
  const [releasePrimaryGenre, setReleasePrimaryGenre] = useState<string>('')
  const [releaseSubGenre, setReleaseSubGenre] = useState<string>('')
  const [releaseMoods, setReleaseMoods] = useState<string[]>([])
  const [releaseTags, setReleaseTags] = useState<string[]>([])
  const [releaseCoverUrl, setReleaseCoverUrl] = useState('')
  const [releaseCoverFile, setReleaseCoverFile] = useState<File | null>(null)
  const [releaseCoverPreview, setReleaseCoverPreview] = useState<string | null>(
    null,
  )
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Scheduled drop & visibility state
  const [releaseMode, setReleaseMode] = useState<'IMMEDIATE' | 'SCHEDULED'>(
    'IMMEDIATE',
  )
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [releaseVisibility, setReleaseVisibility] =
    useState<ReleaseVisibility>('PUBLIC')
  const [releaseAllowComments, setReleaseAllowComments] = useState(true)

  // Single-release specific fields
  const [singleTrackGenre, setSingleTrackGenre] = useState('')
  const [singleTrackBpm, setSingleTrackBpm] = useState<number | null>(null)
  const [singleTrackKey, setSingleTrackKey] = useState('')
  const [singleTrackDuration, setSingleTrackDuration] = useState(0)
  const [singleTrackExplicit, setSingleTrackExplicit] = useState(false)
  const [singleTrackAudioUrl, setSingleTrackAudioUrl] = useState('')
  const [singleTrackAudioKey, setSingleTrackAudioKey] = useState('')
  const [singleTrackCleanupToken, setSingleTrackCleanupToken] = useState('')
  const [singleTrackAudioFileName, setSingleTrackAudioFileName] = useState('')
  const [isUploadingSingleAudio, setIsUploadingSingleAudio] = useState(false)
  const [singleTrackCredits, setSingleTrackCredits] = useState<
    SelectedCredit[]
  >([])
  const singleAudioInputRef = useRef<HTMLInputElement>(null)

  // Multi-track draft cuts
  const [draftTracks, setDraftTracks] = useState<TrackDraft[]>([])
  const [isBatchImporting, setIsBatchImporting] = useState(false)
  const batchCutsInputRef = useRef<HTMLInputElement>(null)

  // Auth gate
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/studio/new' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Fetch artist profile via studio overview
  useEffect(() => {
    if (!user) return
    setIsLoadingProfile(true)
    catalogApi
      .getStudioOverview()
      .then((overview) => {
        setArtistProfile(overview.artist || null)
      })
      .catch((err) => {
        console.warn('Could not load studio overview:', err)
        setArtistProfile(null)
      })
      .finally(() => {
        setIsLoadingProfile(false)
      })
  }, [user])

  // Revoke preview blob on unmount
  useEffect(() => {
    return () => {
      if (releaseCoverPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(releaseCoverPreview)
      }
    }
  }, [releaseCoverPreview])

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCoverCropFile(file)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  const handleCoverCropComplete = (croppedFile: File) => {
    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseCoverFile(croppedFile)
    setReleaseCoverPreview(URL.createObjectURL(croppedFile))
    setCoverCropFile(null)
    notify.success('Cover artwork framed and attached.')
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

  // Handle single track audio file
  const handleSingleAudioFile = async (file: File) => {
    setIsUploadingSingleAudio(true)
    notify.dismiss()

    try {
      const parsed = await parseAudioFile(file)

      if (
        !releaseTitle.trim() ||
        releaseTitle === file.name.replace(/\.[^/.]+$/, '')
      ) {
        setReleaseTitle(parsed.title)
      }

      if (!singleTrackGenre.trim() && parsed.genre) {
        setSingleTrackGenre(parsed.genre)
      }
      if (!releasePrimaryGenre && parsed.primaryGenre) {
        setReleasePrimaryGenre(parsed.primaryGenre)
        if (parsed.subGenre) {
          setReleaseSubGenre(parsed.subGenre)
        }
      }
      if (
        releaseMoods.length === 0 &&
        parsed.moods &&
        parsed.moods.length > 0
      ) {
        setReleaseMoods(parsed.moods.slice(0, 3))
      }
      if (parsed.bpm) {
        setSingleTrackBpm(parsed.bpm)
      }
      if (parsed.musicalKey) {
        setSingleTrackKey(parsed.musicalKey)
      }
      if (parsed.durationSeconds > 0) {
        setSingleTrackDuration(parsed.durationSeconds)
      }
      if (parsed.isExplicit) {
        setSingleTrackExplicit(true)
      }
      if (!releaseCoverFile && !releaseCoverUrl && parsed.coverFile) {
        setReleaseCoverFile(parsed.coverFile)
        setReleaseCoverPreview(
          parsed.coverPreviewUrl || URL.createObjectURL(parsed.coverFile),
        )
      }

      const { storageKey, publicUrl, durationSeconds, cleanupToken } =
        await catalogApi.uploadAudioRaw(file)

      if (
        singleTrackAudioKey &&
        singleTrackCleanupToken &&
        singleTrackAudioKey !== storageKey
      ) {
        catalogApi
          .cleanupUncommittedAudio(singleTrackAudioKey, singleTrackCleanupToken)
          .catch((err) =>
            console.warn(
              `Failed to cleanup replaced single audio: ${singleTrackAudioKey}`,
              err,
            ),
          )
      }

      setSingleTrackAudioKey(storageKey)
      setSingleTrackCleanupToken(cleanupToken || '')
      setSingleTrackAudioUrl(publicUrl)
      setSingleTrackAudioFileName(file.name)
      if (durationSeconds && durationSeconds > 0) {
        setSingleTrackDuration(durationSeconds)
      }

      notify.success(
        `Audio master "${file.name}" uploaded and metadata prefilled.`,
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to upload audio')
    } finally {
      setIsUploadingSingleAudio(false)
      if (singleAudioInputRef.current) singleAudioInputRef.current.value = ''
    }
  }

  const handleResetSingleAudio = () => {
    if (singleTrackAudioKey && singleTrackCleanupToken) {
      catalogApi
        .cleanupUncommittedAudio(singleTrackAudioKey, singleTrackCleanupToken)
        .catch((err) =>
          console.warn(
            `Failed to cleanup reset single audio: ${singleTrackAudioKey}`,
            err,
          ),
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

  // Handle batch import for albums / EPs
  const handleBatchImportFiles = async (files: File[]) => {
    if (files.length === 0) return
    setIsBatchImporting(true)
    notify.dismiss()

    try {
      const parsedList = await parseAudioFilesWithPool(files, 6)

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

      const isInitialEmptyDraft =
        draftTracks.length === 1 &&
        !draftTracks[0].title.trim() &&
        !draftTracks[0].audioUrl &&
        !draftTracks[0].rawAudioKey

      const existingDrafts = isInitialEmptyDraft ? [] : draftTracks

      const isMatch = (
        candidate: {
          title: string
          durationSeconds: number
          fileName: string
          fileSize: number
        },
        existing: {
          title: string
          durationSeconds: number
          audioFileName?: string
        },
      ) => {
        if (
          existing.audioFileName &&
          candidate.fileName.toLowerCase() ===
            existing.audioFileName.toLowerCase()
        ) {
          return true
        }
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
        notify.error(
          `All ${parsedList.length} selected audio file(s) are duplicates of cuts already in this draft.`,
        )
        return
      }

      if (!releaseTitle.trim()) {
        const taggedAlbum = uniqueParsedList.find(
          (t) => t.hasAlbumTag && t.albumTitle.trim(),
        )
        if (taggedAlbum) {
          setReleaseTitle(taggedAlbum.albumTitle.trim())
        }
      }

      if (!releasePrimaryGenre) {
        const taggedGenre = uniqueParsedList.find((t) => t.primaryGenre)
        if (taggedGenre) {
          setReleasePrimaryGenre(taggedGenre.primaryGenre!)
          if (taggedGenre.subGenre) {
            setReleaseSubGenre(taggedGenre.subGenre)
          }
        }
      }

      if (!releaseCoverFile && !releaseCoverUrl) {
        const coverCandidate = uniqueParsedList.find((t) => t.coverFile)
        if (coverCandidate?.coverFile) {
          setReleaseCoverFile(coverCandidate.coverFile)
          setReleaseCoverPreview(
            coverCandidate.coverPreviewUrl ||
              URL.createObjectURL(coverCandidate.coverFile),
          )
        }
      }

      const uploadTasks = uniqueParsedList.map(async (parsed) => {
        try {
          const { storageKey, publicUrl, durationSeconds, cleanupToken } =
            await catalogApi.uploadAudioRaw(parsed.file)

          return {
            id: crypto.randomUUID(),
            title: parsed.title,
            genre: parsed.genre || '',
            primaryGenre: parsed.primaryGenre,
            subGenre: parsed.subGenre,
            moods: parsed.moods,
            tags: parsed.tags,
            bpm: parsed.bpm,
            musicalKey: parsed.musicalKey,
            energy: parsed.energy,
            durationSeconds: durationSeconds || parsed.durationSeconds || 0,
            isExplicit: parsed.isExplicit,
            rawAudioKey: storageKey,
            cleanupToken: cleanupToken,
            audioUrl: publicUrl,
            audioFileName: parsed.file.name,
            credits: [],
          } as TrackDraft
        } catch (uploadErr) {
          console.error(
            `Failed to upload batch cut ${parsed.file.name}:`,
            uploadErr,
          )
          return null
        }
      })

      const completed = (await Promise.all(uploadTasks)).filter(
        Boolean,
      ) as TrackDraft[]

      setDraftTracks((prev) => {
        const cleanedPrev =
          prev.length === 1 &&
          !prev[0].title.trim() &&
          !prev[0].audioUrl &&
          !prev[0].rawAudioKey
            ? []
            : prev
        return [...cleanedPrev, ...completed]
      })

      notify.success(
        `Added ${completed.length} cut(s) to ${releaseType}. Metadata and audio stems synced.`,
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to batch import audio tracks')
    } finally {
      setIsBatchImporting(false)
      if (batchCutsInputRef.current) batchCutsInputRef.current.value = ''
    }
  }

  const handleDraftAudioFile = async (draftId: string, file: File) => {
    setDraftTracks((prev) =>
      prev.map((t) =>
        t.id === draftId ? { ...t, isUploadingAudio: true } : t,
      ),
    )
    notify.dismiss()

    try {
      const parsed = await parseAudioFile(file)

      if (!releaseTitle.trim() && parsed.albumTitle && parsed.hasAlbumTag) {
        setReleaseTitle(parsed.albumTitle)
      }

      if (!releaseCoverFile && !releaseCoverUrl && parsed.coverFile) {
        setReleaseCoverFile(parsed.coverFile)
        setReleaseCoverPreview(
          parsed.coverPreviewUrl || URL.createObjectURL(parsed.coverFile),
        )
      }

      const { storageKey, publicUrl, durationSeconds, cleanupToken } =
        await catalogApi.uploadAudioRaw(file)

      const existingCut = draftTracks.find((t) => t.id === draftId)
      if (
        existingCut?.rawAudioKey &&
        existingCut?.cleanupToken &&
        existingCut.rawAudioKey !== storageKey
      ) {
        catalogApi
          .cleanupUncommittedAudio(
            existingCut.rawAudioKey,
            existingCut.cleanupToken,
          )
          .catch((err) =>
            console.warn(
              `Failed to cleanup replaced cut audio: ${existingCut.rawAudioKey}`,
              err,
            ),
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
                durationSeconds:
                  durationSeconds ||
                  parsed.durationSeconds ||
                  t.durationSeconds,
                title: t.title.trim() ? t.title : parsed.title,
                genre: t.genre.trim() ? t.genre : parsed.genre || '',
                isExplicit: t.isExplicit || parsed.isExplicit,
                isUploadingAudio: false,
              }
            : t,
        ),
      )
      notify.success(
        `Master audio "${file.name}" uploaded to R2 and metadata prefilled.`,
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to upload audio cut')
      setDraftTracks((prev) =>
        prev.map((t) =>
          t.id === draftId ? { ...t, isUploadingAudio: false } : t,
        ),
      )
    }
  }

  const handleResetDraftAudio = (draftId: string) => {
    const target = draftTracks.find((t) => t.id === draftId)
    if (target?.rawAudioKey && target?.cleanupToken) {
      catalogApi
        .cleanupUncommittedAudio(target.rawAudioKey, target.cleanupToken)
        .catch((err) =>
          console.warn(
            `Failed to cleanup reset cut audio: ${target.rawAudioKey}`,
            err,
          ),
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

  const handleRemoveDraftTrack = (draftId: string) => {
    const target = draftTracks.find((t) => t.id === draftId)
    if (target?.rawAudioKey && target?.cleanupToken) {
      catalogApi
        .cleanupUncommittedAudio(target.rawAudioKey, target.cleanupToken)
        .catch((err) =>
          console.warn(
            `Failed to cleanup removed cut audio: ${target.rawAudioKey}`,
            err,
          ),
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
    setReleasePrimaryGenre('')
    setReleaseSubGenre('')
    setReleaseMoods([])
    setReleaseTags([])
    setReleaseCoverUrl('')
    setReleaseCoverFile(null)
    setReleaseCoverPreview(null)
    setReleaseMode('IMMEDIATE')
    setScheduledDate('')
    setScheduledTime('')
    setReleaseVisibility('PUBLIC')
    setReleaseAllowComments(true)
    setSingleTrackGenre('')
    setSingleTrackBpm(null)
    setSingleTrackKey('')
    setSingleTrackDuration(0)
    setSingleTrackExplicit(false)
    setSingleTrackAudioUrl('')
    setSingleTrackAudioKey('')
    setSingleTrackCleanupToken('')
    setSingleTrackAudioFileName('')
    setSingleTrackCredits([])
    setDraftTracks([])
    if (coverInputRef.current) coverInputRef.current.value = ''
    if (singleAudioInputRef.current) singleAudioInputRef.current.value = ''
    if (batchCutsInputRef.current) batchCutsInputRef.current.value = ''
    setDuplicateNotice(null)
    notify.success('Release workspace cleared.')
  }

  // Publish release handler
  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!releaseTitle.trim()) {
      notify.error('Please enter a release title')
      return
    }

    if (releaseMode === 'SCHEDULED' && (!scheduledDate || !scheduledTime)) {
      notify.error('Please specify both release date and time for scheduled drop')
      return
    }

    setIsSubmittingRelease(true)
    notify.dismiss()

    try {
      const todayDate = new Date().toISOString().split('T')[0]
      const scheduledReleaseAtIso =
        releaseMode === 'SCHEDULED' && scheduledDate && scheduledTime
          ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
          : undefined

      let finalCoverUrl = releaseCoverUrl
      if (releaseCoverFile) {
        setIsUploadingCover(true)
        try {
          finalCoverUrl = await catalogApi.uploadAlbumCover(releaseCoverFile)
          setReleaseCoverUrl(finalCoverUrl)
          setReleaseCoverFile(null)
        } catch (covErr: any) {
          notify.error(
            covErr.message || 'Failed to upload cover artwork to R2',
          )
          setIsSubmittingRelease(false)
          setIsUploadingCover(false)
          return
        } finally {
          setIsUploadingCover(false)
        }
      }

      if (!finalCoverUrl) {
        notify.error('Please provide cover artwork for the release')
        setIsSubmittingRelease(false)
        return
      }

      if (releaseType === 'SINGLE') {
        if (!singleTrackAudioUrl && !singleTrackAudioKey) {
          notify.error(
            'Please upload a master audio file for the single release',
          )
          setIsSubmittingRelease(false)
          return
        }

        const singleTrackPayload = [
          {
            title: releaseTitle.trim(),
            genre: releasePrimaryGenre || singleTrackGenre.trim() || undefined,
            primaryGenre: releasePrimaryGenre || undefined,
            subGenre: releaseSubGenre || undefined,
            moods: releaseMoods.length > 0 ? releaseMoods : undefined,
            tags: releaseTags.length > 0 ? releaseTags : undefined,
            bpm: singleTrackBpm || undefined,
            musicalKey: singleTrackKey.trim() || undefined,
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
          genre: releasePrimaryGenre || singleTrackGenre.trim() || undefined,
          primaryGenre: releasePrimaryGenre || undefined,
          subGenre: releaseSubGenre || undefined,
          moods: releaseMoods.length > 0 ? releaseMoods : undefined,
          tags: releaseTags.length > 0 ? releaseTags : undefined,
          releaseDate: todayDate,
          scheduledReleaseAt: scheduledReleaseAtIso,
          visibility: releaseVisibility,
          allowComments: releaseAllowComments,
          tracks: singleTrackPayload,
        })

        if (releaseMode === 'SCHEDULED') {
          notify.success(
            `Standalone single release "${releaseTitle}" scheduled (${releaseVisibility})!`,
            { icon: <CalendarClock className="h-4 w-4" /> },
          )
        } else {
          notify.success(
            `Standalone single release "${releaseTitle}" published successfully!`,
            { icon: <PartyPopper className="h-4 w-4" /> },
          )
        }
      } else {
        if (draftTracks.length === 0) {
          notify.error('Please add at least one cut to the release')
          setIsSubmittingRelease(false)
          return
        }

        const tracksPayload = draftTracks.map((t, idx) => ({
          title: t.title.trim() || `Cut ${idx + 1}`,
          genre:
            t.primaryGenre ||
            t.genre.trim() ||
            releasePrimaryGenre ||
            undefined,
          primaryGenre: t.primaryGenre || releasePrimaryGenre || undefined,
          subGenre: t.subGenre || releaseSubGenre || undefined,
          moods:
            t.moods && t.moods.length > 0
              ? t.moods
              : releaseMoods.length > 0
                ? releaseMoods
                : undefined,
          tags:
            t.tags && t.tags.length > 0
              ? t.tags
              : releaseTags.length > 0
                ? releaseTags
                : undefined,
          bpm: t.bpm || undefined,
          musicalKey: t.musicalKey?.trim() || undefined,
          durationSeconds: t.durationSeconds,
          trackNumber: idx + 1,
          discNumber: 1,
          isExplicit: t.isExplicit,
          rawAudioKey: t.rawAudioKey || undefined,
          audioUrl: t.audioUrl || undefined,
          coverImageUrl: finalCoverUrl,
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
          genre: releasePrimaryGenre || undefined,
          primaryGenre: releasePrimaryGenre || undefined,
          subGenre: releaseSubGenre || undefined,
          moods: releaseMoods.length > 0 ? releaseMoods : undefined,
          tags: releaseTags.length > 0 ? releaseTags : undefined,
          releaseDate: todayDate,
          scheduledReleaseAt: scheduledReleaseAtIso,
          visibility: releaseVisibility,
          allowComments: releaseAllowComments,
          tracks: tracksPayload.length > 0 ? tracksPayload : undefined,
        })

        if (releaseMode === 'SCHEDULED') {
          notify.success(
            `Master ${releaseType} release "${releaseTitle}" scheduled (${releaseVisibility})!`,
            { icon: <CalendarClock className="h-4 w-4" /> },
          )
        } else {
          notify.success(
            `Master ${releaseType} release "${releaseTitle}" published successfully!`,
            { icon: <PartyPopper className="h-4 w-4" /> },
          )
        }
      }

      navigate({ to: '/studio', search: { tab: 'releases' } })
    } catch (err: any) {
      notify.error(err.message || 'Failed to create release')
    } finally {
      setIsSubmittingRelease(false)
    }
  }

  if (isAuthLoading || isLoadingProfile) {
    return (
      <div className="py-24 text-center font-mono text-caption text-muted-foreground animate-pulse">
        Loading studio release workspace...
      </div>
    )
  }

  if (!isArtistAccount(user)) {
    return <StudioUpgradeScreen setArtistProfile={setArtistProfile} />
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Top Navigation & Breadcrumb */}
      <div>
        <Link
          to="/studio"
          className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 rounded-full bg-card hover:bg-background text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Studio</span>
        </Link>

        <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-0.5">
          Artist Studio
        </span>
        <H1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          New Release
        </H1>
        <p className="font-sans text-caption text-muted-foreground mt-1 max-w-xl">
          Upload audio recordings, artwork, and release details to publish to your catalog.
        </p>
      </div>

      {/* Format Selector Pills */}
      <div className="p-5 sm:p-6 bg-card rounded-2xl shadow-raised space-y-4">
        <div>
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-0.5">
            Step 1 · Format
          </span>
          <H3 className="text-title font-semibold text-foreground">
            Release Format
          </H3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {ALBUM_TYPES.map((type) => {
            const isSelected = releaseType === type.id
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setReleaseType(type.id)
                  if (type.id !== 'SINGLE' && draftTracks.length === 0) {
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
                  }
                }}
                className={`p-3 sm:p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between gap-2 min-w-0 ${
                  isSelected
                    ? 'bg-foreground text-background shadow-raised font-semibold'
                    : 'bg-background hover:bg-muted text-foreground'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-eyebrow text-caption uppercase tracking-wider truncate">
                    {type.title}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </div>
                <span
                  className={`font-mono text-eyebrow truncate ${
                    isSelected
                      ? 'text-background/80'
                      : 'text-muted-foreground'
                  }`}
                >
                  {type.subtitle}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <form onSubmit={handlePublishRelease} className="space-y-6 sm:space-y-7">
        {/* Release Metadata Details Card */}
        <div className="p-5 sm:p-6 bg-card rounded-2xl shadow-raised space-y-5">
          <div className="pb-3 border-b border-border-soft">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-0.5">
              Step 2 · Details
            </span>
            <H3 className="text-title font-semibold text-foreground">
              Release Details
            </H3>
          </div>

          <ReleaseDetailsSection
            releaseType={releaseType}
            title={releaseTitle}
            onTitleChange={setReleaseTitle}
            mode={releaseMode}
            onModeChange={setReleaseMode}
            scheduledDate={scheduledDate}
            onScheduledDateChange={setScheduledDate}
            scheduledTime={scheduledTime}
            onScheduledTimeChange={setScheduledTime}
            visibility={releaseVisibility}
            onVisibilityChange={setReleaseVisibility}
            coverPreview={releaseCoverPreview}
            coverUrl={releaseCoverUrl}
            isUploadingCover={isUploadingCover}
            coverInputRef={coverInputRef}
            onCoverSelect={handleCoverSelect}
            onRemoveCover={handleRemoveCover}
            primaryGenre={releasePrimaryGenre}
            onPrimaryGenreChange={setReleasePrimaryGenre}
            subGenre={releaseSubGenre}
            onSubGenreChange={setReleaseSubGenre}
            moods={releaseMoods}
            onMoodsChange={setReleaseMoods}
            tags={releaseTags}
            onTagsChange={setReleaseTags}
            description={releaseDescription}
            onDescriptionChange={setReleaseDescription}
            allowComments={releaseAllowComments}
            onAllowCommentsChange={setReleaseAllowComments}
          />
        </div>

        {/* Audio Tracks Section */}
        <div className="p-5 sm:p-6 bg-card rounded-2xl shadow-raised space-y-5">
          <div className="pb-3 border-b border-border-soft flex items-center justify-between gap-4">
            <div>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-0.5">
                Step 3 · Audio
              </span>
              <H3 className="text-title font-semibold text-foreground">
                {releaseType === 'SINGLE'
                  ? 'Audio Track'
                  : `Tracklist (${draftTracks.length})`}
              </H3>
            </div>

            {releaseType !== 'SINGLE' && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="rounded-full"
                  onClick={() =>
                    setDraftTracks((prev) => [
                      ...prev,
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
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Add Cut</span>
                </Button>

                <Button
                  variant="pixel"
                  size="sm"
                  type="button"
                  onClick={() => batchCutsInputRef.current?.click()}
                  disabled={isBatchImporting}
                >
                  <UploadCloud className="w-3.5 h-3.5 shrink-0" />
                  <span>Import Audio Files</span>
                </Button>
              </div>
            )}
          </div>

          {/* SINGLE AUDIO WORKFLOW */}
          {releaseType === 'SINGLE' ? (
            <div className="space-y-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-background space-y-3.5 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold">
                    Audio Recording
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-eyebrow text-caption uppercase tracking-wider text-muted-foreground">
                      Explicit
                    </span>
                    <Switch
                      checked={singleTrackExplicit}
                      onChange={setSingleTrackExplicit}
                      size="sm"
                    />
                  </div>
                </div>

                {singleTrackAudioKey || singleTrackAudioUrl ? (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-success-soft flex items-center justify-between gap-3 text-success">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-success text-success-foreground flex items-center justify-center font-bold text-caption shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-sans font-semibold text-body text-foreground truncate">
                          {singleTrackAudioFileName ||
                            releaseTitle ||
                            'Audio File'}
                        </div>
                        <div className="font-mono text-eyebrow text-muted-foreground">
                          Uploaded &bull; Duration:{' '}
                          {formatDuration(singleTrackDuration)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => singleAudioInputRef.current?.click()}
                        className="rounded-full"
                      >
                        Replace
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={handleResetSingleAudio}
                        className="rounded-full text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => singleAudioInputRef.current?.click()}
                    className="p-6 sm:p-7 rounded-xl border border-dashed border-border-soft hover:border-foreground/40 bg-background text-center cursor-pointer transition-colors space-y-2"
                  >
                    <UploadCloud className="w-7 h-7 text-muted-foreground/60 mx-auto" />
                    <div className="font-sans font-medium text-body text-foreground">
                      {isUploadingSingleAudio
                        ? 'Analyzing audio...'
                        : 'Upload Master Audio File'}
                    </div>
                    <p className="font-mono text-eyebrow text-muted-foreground">
                      WAV, FLAC, or high-quality MP3
                    </p>
                  </div>
                )}

                <input
                  ref={singleAudioInputRef}
                  type="file"
                  accept="audio/*"
                  disabled={isUploadingSingleAudio}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleSingleAudioFile(file)
                  }}
                  className="hidden"
                />
              </div>

              {/* Single Track Acoustics & Credits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <FieldLabel>BPM (Tempo)</FieldLabel>
                  <MonoInput
                    type="number"
                    min={30}
                    max={300}
                    value={singleTrackBpm || ''}
                    onChange={(e) =>
                      setSingleTrackBpm(
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                    placeholder="e.g. 120"
                    size="sm"
                  />
                </div>
                <div>
                  <FieldLabel>Musical Key</FieldLabel>
                  <MonoInput
                    type="text"
                    value={singleTrackKey}
                    onChange={(e) => setSingleTrackKey(e.target.value)}
                    placeholder="e.g. C Minor, F# Major"
                    size="sm"
                  />
                </div>
              </div>

              {artistProfile && (
                <CreditPickerField
                  credits={singleTrackCredits}
                  onChange={setSingleTrackCredits}
                  currentArtistId={artistProfile.id}
                  label="Collaborators & Credits"
                />
              )}
            </div>
          ) : (
            /* MULTI-TRACK ALBUM WORKFLOW */
            <div className="space-y-4">
              {duplicateNotice && (
                <div className="p-3.5 rounded-xl bg-warning-soft flex items-center justify-between gap-3 text-warning">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="w-4 h-4 shrink-0" />
                    <span className="font-sans text-caption">
                      Skipped {duplicateNotice.count} duplicate file(s):{' '}
                      {duplicateNotice.titles.join(', ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDuplicateNotice(null)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Batch Upload Drop Box */}
              <div
                onClick={() => batchCutsInputRef.current?.click()}
                className="p-6 rounded-xl border border-dashed border-border-soft hover:border-foreground/40 bg-background text-center cursor-pointer transition-colors space-y-2"
              >
                <UploadCloud className="w-7 h-7 text-muted-foreground/60 mx-auto" />
                <div className="font-sans font-medium text-body text-foreground">
                  {isBatchImporting
                    ? 'Analyzing audio files...'
                    : 'Drop Audio Files Here'}
                </div>
                <p className="font-mono text-eyebrow text-muted-foreground">
                  Select or drag multiple audio files (WAV, FLAC, MP3)
                </p>
              </div>

              <input
                ref={batchCutsInputRef}
                type="file"
                accept="audio/*"
                multiple
                disabled={isBatchImporting}
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  handleBatchImportFiles(files)
                }}
                className="hidden"
              />

              {/* Track List Editor */}
              <TrackListEditor
                tracks={draftTracks}
                currentArtistId={artistProfile?.id}
                genrePlaceholder={releasePrimaryGenre || 'Cut genre'}
                creditLabel="Collaborators & Credits"
                creditHeadingRow
                onUpdateTrack={(id, patch) =>
                  setDraftTracks((prev) =>
                    prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
                  )
                }
                renderTools={(draft) => (
                  <div className="flex items-center gap-2 shrink-0">
                    {draft.audioUrl || draft.rawAudioKey ? (
                      <div className="flex items-center gap-2">
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-1 bg-success-soft text-success rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3 shrink-0" />
                          <span>{formatDuration(draft.durationSeconds)}</span>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => handleResetDraftAudio(draft.id)}
                          className="rounded-full text-muted-foreground hover:text-destructive"
                        >
                          <RotateCcw className="w-3 h-3 shrink-0" />
                          <span>Reset</span>
                        </Button>
                      </div>
                    ) : (
                      <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 rounded-full bg-background hover:bg-muted text-foreground cursor-pointer transition-colors">
                        <span>
                          {draft.isUploadingAudio
                            ? 'Uploading...'
                            : 'Upload Audio'}
                        </span>
                        <input
                          type="file"
                          accept="audio/*"
                          disabled={draft.isUploadingAudio}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleDraftAudioFile(draft.id, file)
                          }}
                          className="hidden"
                        />
                      </label>
                    )}

                    {draftTracks.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => handleRemoveDraftTrack(draft.id)}
                        className="rounded-full p-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              />
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="p-4 sm:p-5 bg-card rounded-2xl shadow-raised flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={resetReleaseForm}
            className="rounded-full self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset</span>
          </Button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => navigate({ to: '/studio' })}
              className="rounded-full"
            >
              Cancel
            </Button>

            <Button
              variant="pixel"
              size="sm"
              type="submit"
              disabled={isSubmittingRelease}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isSubmittingRelease
                  ? 'Publishing...'
                  : releaseMode === 'SCHEDULED'
                    ? 'Schedule Release'
                    : 'Publish Release'}
              </span>
            </Button>
          </div>
        </div>
      </form>

      {/* Artwork Crop Modal */}
      <ImageCropModal
        isOpen={!!coverCropFile}
        onClose={() => setCoverCropFile(null)}
        imageFile={coverCropFile}
        title="Crop Cover Artwork"
        subtitle="Artist Studio · Cover Artwork"
        aspectRatio={1}
        isCircularMask={false}
        targetMaxWidth={1400}
        targetMaxHeight={1400}
        onCropComplete={handleCoverCropComplete}
      />
    </div>
  )
}
