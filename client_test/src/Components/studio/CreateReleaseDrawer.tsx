import { useState, useRef, useEffect } from 'react'
import { UploadCloud, Disc3, Calendar, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { SelectedCredit } from '../ArtistCreditPicker'
import { parseAudioFile, parseAudioFilesWithPool } from '../../lib/audio-metadata'
import { catalogApi, formatDuration } from '../../lib/catalog.api'
import { PRIMARY_GENRES, GENRE_SUBGENRES_MAP } from '../../lib/taxonomy'
import type { ArtistProfile } from '../../types/artist'
import type { AlbumType, ReleaseVisibility } from '../../types/catalog'
import {
  CreditPickerField,
  ExplicitCheckbox,
  FieldLabel,
  GovernanceToggle,
  MonoInput,
  MoodChipRow,
  SelectField,
  SerifInput,
  TagChipInput,
  TextAreaField,
} from './fields'
import { TrackListEditor } from './TrackListEditor'

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

interface CreateReleaseDrawerProps {
  /** The signed-in artist, used for credit attribution on new tracks. */
  artistProfile: ArtistProfile
  onClose: () => void
  /** Fired after a successful publish so the route can refetch the catalog. */
  onReleasesChanged: () => void
}

export function CreateReleaseDrawer({
  artistProfile,
  onClose,
  onReleasesChanged,
}: CreateReleaseDrawerProps) {
  // Batch Deduplication Notice State
  const [duplicateNotice, setDuplicateNotice] = useState<{
    count: number
    titles: string[]
  } | null>(null)
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
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  // Scheduled Release & Visibility State
  const [releaseMode, setReleaseMode] = useState<'IMMEDIATE' | 'SCHEDULED'>(
    'IMMEDIATE',
  )
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [releaseVisibility, setReleaseVisibility] =
    useState<ReleaseVisibility>('PUBLIC')
  const [releaseAllowComments, setReleaseAllowComments] = useState(true)
  // Single-release specific fields (when releaseType === 'SINGLE')
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
  // Multi-track draft cuts (when releaseType !== 'SINGLE')
  const [draftTracks, setDraftTracks] = useState<TrackDraft[]>([])
  const [isBatchImporting, setIsBatchImporting] = useState(false)
  const batchCutsInputRef = useRef<HTMLInputElement>(null)
  const quickStartInputRef = useRef<HTMLInputElement>(null)
  // Cover image select for new release (Deferred / Lazy Upload)
  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseCoverFile(file)
    setReleaseCoverPreview(URL.createObjectURL(file))
    toast.success('Cover artwork selected for release.')
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
      prev.map((t) =>
        t.id === draftId ? { ...t, isUploadingAudio: true } : t,
      ),
    )
    toast.dismiss()

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
        setReleaseCoverPreview(
          parsed.coverPreviewUrl || URL.createObjectURL(parsed.coverFile),
        )
      }

      // 2. Upload master audio to Cloudflare R2
      const { storageKey, publicUrl, durationSeconds, cleanupToken } =
        await catalogApi.uploadAudioRaw(file)

      // If replacing previously uploaded audio cut, clean up previous file from R2
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
      toast.success(
        `Master audio "${file.name}" uploaded to R2 and metadata prefilled.`,
      )
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload audio cut')
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
  const handleRemoveDraftCut = (draftId: string) => {
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
  // Revoke the local cover preview blob when the drawer goes away; the
  // close button unmounts us, so the last preview would otherwise leak.
  useEffect(() => {
    return () => {
      if (releaseCoverPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(releaseCoverPreview)
      }
    }
  }, [releaseCoverPreview])

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
    toast.dismiss()

    try {
      // 1. Extract metadata from audio file
      const parsed = await parseAudioFile(file)

      // Prefill Release Title if empty or equal to filename without extension
      if (
        !releaseTitle.trim() ||
        releaseTitle === file.name.replace(/\.[^/.]+$/, '')
      ) {
        setReleaseTitle(parsed.title)
      }

      // Prefill Genre if empty
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
        setReleaseCoverPreview(
          parsed.coverPreviewUrl || URL.createObjectURL(parsed.coverFile),
        )
      }

      // 2. Upload raw audio file to Cloudflare R2
      const { storageKey, publicUrl, durationSeconds, cleanupToken } =
        await catalogApi.uploadAudioRaw(file)

      // If replacing previously uploaded single audio, clean it up from R2
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

      toast.success(
        `Audio master "${file.name}" uploaded and metadata prefilled. You can review or edit all details.`,
      )
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload audio')
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
  // Batch import multiple audio cuts for multi-track releases
  const handleBatchImportFiles = async (files: File[]) => {
    if (files.length === 0) return
    setIsBatchImporting(true)
    toast.dismiss()

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
        // Match 1: Exact audio filename match
        if (
          existing.audioFileName &&
          candidate.fileName.toLowerCase() ===
            existing.audioFileName.toLowerCase()
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
        toast.error(
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

      // Prefill Primary Genre & Subgenre if empty
      if (!releasePrimaryGenre) {
        const firstWithPrimary = uniqueParsedList.find((t) => t.primaryGenre)
        if (firstWithPrimary && firstWithPrimary.primaryGenre) {
          setReleasePrimaryGenre(firstWithPrimary.primaryGenre)
          if (firstWithPrimary.subGenre) {
            setReleaseSubGenre(firstWithPrimary.subGenre)
          }
        }
      }
      // Prefill Moods if empty
      if (releaseMoods.length === 0) {
        const firstWithMoods = uniqueParsedList.find(
          (t) => t.moods && t.moods.length > 0,
        )
        if (firstWithMoods && firstWithMoods.moods) {
          setReleaseMoods(firstWithMoods.moods.slice(0, 3))
        }
      }

      // 4. Create TrackDraft entries
      const newDrafts: TrackDraft[] = uniqueParsedList.map((p) => ({
        id: crypto.randomUUID(),
        title: p.title,
        genre: p.primaryGenre || p.genre || '',
        primaryGenre: p.primaryGenre,
        subGenre: p.subGenre,
        moods: p.moods || [],
        tags: p.tags || [],
        bpm: p.bpm,
        musicalKey: p.musicalKey,
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
            console.error(
              `Failed to upload ${parsedTrack.file.name}:`,
              uploadErr,
            )
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

      toast.success(
        duplicateNames.length > 0
          ? `Imported ${uniqueParsedList.length} cut(s) into release draft (${duplicateNames.length} duplicate(s) excluded).`
          : `Imported and extracted metadata for ${uniqueParsedList.length} cuts! All details can be reviewed and edited.`,
      )
    } catch (err: any) {
      toast.error(err.message || 'Failed to batch import cuts')
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
      toast.error(
        releaseType === 'SINGLE'
          ? 'Please provide a single title'
          : 'Please provide a release title',
      )
      return
    }
    if (!releaseCoverFile && !releaseCoverUrl) {
      toast.error('Please provide cover artwork for the release')
      return
    }

    setIsSubmittingRelease(true)
    toast.dismiss()

    const todayDate = new Date().toISOString().split('T')[0]

    let scheduledReleaseAtIso: string | undefined = undefined
    if (releaseMode === 'SCHEDULED') {
      if (!scheduledDate || !scheduledTime) {
        toast.error(
          'Please choose both a date and time for the scheduled release',
        )
        setIsSubmittingRelease(false)
        return
      }
      const parsedTimestamp = new Date(
        `${scheduledDate}T${scheduledTime}`,
      ).getTime()
      if (isNaN(parsedTimestamp)) {
        toast.error('Invalid scheduled release date/time')
        setIsSubmittingRelease(false)
        return
      }
      if (parsedTimestamp <= Date.now()) {
        toast.error('Scheduled release time must be in the future')
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
          toast.error(
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
        toast.error('Please provide cover artwork for the release')
        setIsSubmittingRelease(false)
        return
      }

      if (releaseType === 'SINGLE') {
        if (!singleTrackAudioUrl && !singleTrackAudioKey) {
          toast.error(
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

        toast.success(
          releaseMode === 'SCHEDULED'
            ? `🗓️ Standalone single release "${releaseTitle}" scheduled for ${new Date(scheduledReleaseAtIso!).toLocaleString()} (${releaseVisibility})!`
            : `🎉 Standalone single release "${releaseTitle}" published successfully (${releaseVisibility})!`,
        )
      } else {
        if (draftTracks.length === 0) {
          toast.error('Please add at least one cut to the release')
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
          musicalKey: t.musicalKey || undefined,
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

        toast.success(
          releaseMode === 'SCHEDULED'
            ? `🗓️ Master ${releaseType} release "${releaseTitle}" scheduled for ${new Date(scheduledReleaseAtIso!).toLocaleString()} (${releaseVisibility})!`
            : `🎉 Master ${releaseType} release "${releaseTitle}" published successfully (${releaseVisibility})!`,
        )
      }

      onClose()
      resetReleaseForm()
      onReleasesChanged()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create release')
    } finally {
      setIsSubmittingRelease(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full sm:max-w-3xl bg-card border-t sm:border border-border rounded-control shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden my-0 sm:my-auto">
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto my-2.5 shrink-0" />

        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="font-serif italic text-lg sm:text-xl text-foreground font-semibold truncate">
              {releaseType === 'SINGLE'
                ? 'Publish Standalone Single'
                : `Publish New ${releaseType}`}
            </h3>
            <p className="font-mono text-eyebrow text-muted-foreground truncate mt-0.5">
              Lossless R2 master pipeline &bull; Contributor attribution
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="w-8 h-8 rounded-control border border-border flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 overscroll-contain">
          {/* Release Format / Type Selector */}
          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-2">
              Release Format / Type
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  'SINGLE',
                  'ALBUM',
                  'EP',
                  'LP',
                  'MIXTAPE',
                ] as AlbumType[]
              ).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setReleaseType(type)}
                  className={`font-eyebrow text-caption uppercase tracking-wider py-1.5 px-3.5 border transition-colors cursor-pointer ${
                    releaseType === type
                      ? 'border-foreground bg-foreground text-background font-semibold'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
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
              const droppedFiles = Array.from(
                e.dataTransfer.files,
              ).filter(
                (f) =>
                  f.type.startsWith('audio/') ||
                  /\.(mp3|wav|flac|m4a|aac|ogg|wma)$/i.test(f.name),
              )
              if (droppedFiles.length === 0) return
              if (
                releaseType === 'SINGLE' &&
                droppedFiles.length === 1
              ) {
                handleSingleAudioFile(droppedFiles[0])
              } else {
                if (releaseType === 'SINGLE') {
                  setReleaseType(
                    droppedFiles.length <= 6 ? 'EP' : 'ALBUM',
                  )
                }
                handleBatchImportFiles(droppedFiles)
              }
            }}
            className="p-4 border-2 border-dashed border-border hover:border-foreground bg-background/60 transition-colors flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 border border-border bg-card flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5 text-foreground shrink-0" />
              </div>
              <div className="min-w-0">
                <div className="font-eyebrow text-caption uppercase tracking-wider text-foreground font-semibold flex items-center gap-1.5">
                  <span>
                    ✦ Quick Start: Auto-Fill from Audio Metadata
                  </span>
                </div>
                <p className="font-sans text-caption text-muted-foreground mt-0.5">
                  Drop audio file{releaseType !== 'SINGLE' ? 's' : ''}{' '}
                  or browse to auto-extract release title, embedded
                  artwork, track titles, genres, and durations. All
                  prefilled fields remain completely editable.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="font-eyebrow text-caption uppercase tracking-wider py-2 px-3.5 border border-foreground bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5 font-semibold">
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
                    if (
                      releaseType === 'SINGLE' &&
                      files.length === 1
                    ) {
                      handleSingleAudioFile(files[0])
                    } else {
                      if (releaseType === 'SINGLE') {
                        setReleaseType(
                          files.length <= 6 ? 'EP' : 'ALBUM',
                        )
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
                <FieldLabel>
                  {releaseType === 'SINGLE'
                    ? 'Single Title'
                    : 'Release Title'}{' '}
                  <span className="text-destructive">*</span>
                </FieldLabel>
                <SerifInput
                  type="text"
                  required
                  value={releaseTitle}
                  onChange={(e) => setReleaseTitle(e.target.value)}
                  placeholder={
                    releaseType === 'SINGLE'
                      ? 'e.g. Autumn in Saint-Germain'
                      : 'e.g. Kind of Blue, Rue de Sèvres Sessions'
                  }
                />
              </div>

              <div>
                <FieldLabel>Release Timing</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReleaseMode('IMMEDIATE')}
                    className={`font-eyebrow text-caption uppercase tracking-wider py-2 px-3 border transition-colors cursor-pointer text-center ${
                      releaseMode === 'IMMEDIATE'
                        ? 'border-foreground bg-foreground text-background font-semibold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Immediate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReleaseMode('SCHEDULED')
                      if (!scheduledDate) {
                        const tomorrow = new Date(
                          Date.now() + 24 * 60 * 60 * 1000,
                        )
                        setScheduledDate(
                          tomorrow.toISOString().split('T')[0],
                        )
                        setScheduledTime('00:00')
                      }
                    }}
                    className={`font-eyebrow text-caption uppercase tracking-wider py-2 px-3 border transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                      releaseMode === 'SCHEDULED'
                        ? 'border-foreground bg-foreground text-background font-semibold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Scheduled Drop</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scheduled Release Date & Time Settings */}
            {releaseMode === 'SCHEDULED' && (
              <div className="p-4 border border-primary/40 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2 font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-semibold">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>Scheduled Drop & Pre-Save Configuration</span>
                </div>
                <p className="font-sans text-caption text-muted-foreground">
                  Specify when your {releaseType.toLowerCase()}{' '}
                  officially drops. Listeners can pre-save the release
                  to their library immediately. Full audio playback
                  remains locked until this exact timestamp.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel tone="muted" spacing="tight">
                      Release Date (Local){' '}
                      <span className="text-destructive">*</span>
                    </FieldLabel>
                    <MonoInput
                      type="date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel tone="muted" spacing="tight">
                      Release Time (Local){' '}
                      <span className="text-destructive">*</span>
                    </FieldLabel>
                    <MonoInput
                      type="time"
                      required
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Catalog Visibility Tier Selector */}
            <div>
              <FieldLabel>Catalog Visibility Tier</FieldLabel>
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
                    onClick={() =>
                      setReleaseVisibility(opt.key as ReleaseVisibility)
                    }
                    className={`text-left p-3 border rounded-control transition-colors cursor-pointer ${
                      releaseVisibility === opt.key
                        ? 'border-foreground bg-background shadow-raised ring-1 ring-foreground'
                        : 'border-border bg-card hover:bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-eyebrow text-caption font-semibold uppercase tracking-wider text-foreground">
                        {opt.label}
                      </span>
                      {releaseVisibility === opt.key && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Release Artwork Upload (Square 1:1) */}
            <div>
              <FieldLabel spacing="tight">
                {releaseType === 'SINGLE'
                  ? 'Single Cover Artwork (Cloudflare R2)'
                  : 'Release Cover Artwork (Cloudflare R2)'}{' '}
                <span className="text-destructive">*</span>
              </FieldLabel>
              <p className="font-sans text-caption text-muted-foreground mb-2">
                Square artwork (1:1 ratio), minimum 1400x1400px
                recommended (JPEG, PNG, or WebP). Stored on Cloudflare
                R2 edge CDN.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {releaseCoverPreview || releaseCoverUrl ? (
                    <img
                      src={releaseCoverPreview || releaseCoverUrl}
                      alt="Cover preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Disc3 className="w-8 h-8 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground cursor-pointer inline-flex items-center gap-1.5">
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
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-2.5 border border-border text-muted-foreground hover:text-destructive hover:border-destructive cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-eyebrow text-muted-foreground">
                    {releaseCoverPreview || releaseCoverUrl
                      ? '✓ Artwork attached to release'
                      : 'Official release artwork required'}
                  </span>
                </div>
              </div>
            </div>

            {/* Release Taxonomy & Classification */}
            <div className="space-y-4 pt-2 border-t border-border-soft">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Genre Dropdown */}
                <div>
                  <FieldLabel>Primary Genre</FieldLabel>
                  <SelectField
                    value={releasePrimaryGenre}
                    onChange={(e) => {
                      setReleasePrimaryGenre(e.target.value)
                      setReleaseSubGenre('')
                    }}
                  >
                    <option value="">Select Primary Genre...</option>
                    {PRIMARY_GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </SelectField>
                </div>

                {/* Sub-Genre Dropdown (Contextual to Primary Genre) */}
                <div>
                  <FieldLabel>Sub-Genre (Optional)</FieldLabel>
                  <SelectField
                    value={releaseSubGenre}
                    onChange={(e) => setReleaseSubGenre(e.target.value)}
                    disabled={
                      !releasePrimaryGenre ||
                      !GENRE_SUBGENRES_MAP[releasePrimaryGenre]?.length
                    }
                  >
                    <option value="">Select Sub-Genre...</option>
                    {releasePrimaryGenre &&
                      GENRE_SUBGENRES_MAP[releasePrimaryGenre]?.map(
                        (sg) => (
                          <option key={sg} value={sg}>
                            {sg}
                          </option>
                        ),
                      )}
                  </SelectField>
                </div>
              </div>

              {/* Mood Selection (1-3 optional) */}
              <MoodChipRow
                selected={releaseMoods}
                onChange={setReleaseMoods}
              />

              {/* Custom Tags */}
              <TagChipInput tags={releaseTags} onChange={setReleaseTags} />
            </div>

            {/* Liner Notes & Description */}
            <div>
              <FieldLabel>Liner Notes & Description (Optional)</FieldLabel>
              <TextAreaField
                rows={2}
                value={releaseDescription}
                onChange={(e) => setReleaseDescription(e.target.value)}
                placeholder="Recording location, inspiration, gear, or credits..."
              />
            </div>

            {/* Creator Governance: Comments & Discussions */}
            <GovernanceToggle
              checked={releaseAllowComments}
              onChange={setReleaseAllowComments}
              title="Discussion &amp; Comments"
              description="Allow listeners and curators to post comments and replies on this release."
            />

            {/* ADAPTIVE SECTION A: SINGLE RELEASE STREAMLINED FLOW */}
            {releaseType === 'SINGLE' ? (
              <div className="pt-4 border-t border-border-soft space-y-4">
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block">
                  Single Master Recording
                </span>

                {/* Master Audio Section */}
                <div className="p-3.5 border border-border bg-background space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold">
                      Master Audio Recording
                    </span>
                    <ExplicitCheckbox
                      checked={singleTrackExplicit}
                      onChange={setSingleTrackExplicit}
                      size="caption"
                      label="Explicit Content"
                    />
                  </div>

                  {singleTrackAudioKey || singleTrackAudioUrl ? (
                    <div className="p-3 border border-success/40 bg-success-soft flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-success text-background flex items-center justify-center font-mono text-caption font-bold shrink-0">
                          ✓
                        </span>
                        <div className="min-w-0">
                          <div className="font-sans font-semibold text-body text-foreground truncate">
                            {singleTrackAudioFileName ||
                              releaseTitle ||
                              'Master Audio Track'}
                          </div>
                          <div className="font-mono text-eyebrow text-muted-foreground">
                            Audio file added successfully &bull;
                            Duration:{' '}
                            {formatDuration(singleTrackDuration)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled
                          className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border-soft bg-background text-muted-foreground/60 cursor-not-allowed"
                          title="An audio master is already uploaded. Reset audio to choose another."
                        >
                          ✓ Audio Attached
                        </button>
                        <button
                          type="button"
                          onClick={handleResetSingleAudio}
                          className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border text-muted-foreground hover:text-destructive hover:border-destructive bg-card cursor-pointer transition-colors"
                          title="Remove uploaded audio and select a new file"
                        >
                          ✕ Reset Audio
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-dashed border-border bg-card">
                      <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-background hover:border-foreground text-foreground cursor-pointer inline-flex items-center gap-2 self-start">
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
                      <span className="font-mono text-eyebrow text-muted-foreground">
                        Lossless FLAC, WAV, or 320kbps MP3
                      </span>
                    </div>
                  )}
                </div>

                {/* Genre, BPM & Musical Key */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <FieldLabel spacing="tight">Track Genre</FieldLabel>
                    <MonoInput
                      type="text"
                      value={singleTrackGenre}
                      onChange={(e) =>
                        setSingleTrackGenre(e.target.value)
                      }
                      placeholder={
                        releasePrimaryGenre || 'e.g. Modern Jazz'
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel spacing="tight">BPM (Tempo)</FieldLabel>
                    <MonoInput
                      type="number"
                      min={30}
                      max={300}
                      value={singleTrackBpm ?? ''}
                      onChange={(e) =>
                        setSingleTrackBpm(
                          e.target.value
                            ? Number(e.target.value)
                            : null,
                        )
                      }
                      placeholder="e.g. 120"
                    />
                  </div>
                  <div>
                    <FieldLabel spacing="tight">Musical Key</FieldLabel>
                    <MonoInput
                      type="text"
                      value={singleTrackKey}
                      onChange={(e) =>
                        setSingleTrackKey(e.target.value)
                      }
                      placeholder="e.g. C min, F# maj"
                    />
                  </div>
                </div>

                {/* Collaborator & Credit Attribution */}
                <CreditPickerField
                  credits={singleTrackCredits}
                  onChange={setSingleTrackCredits}
                  currentArtistId={artistProfile.id}
                  label="Collaborators & Credits (Featured / Producers / Composers / Lyricists / Engineers)"
                />
              </div>
            ) : (
              /* ADAPTIVE SECTION B: MULTI-TRACK ALBUM / EP / LP / MIXTAPE BUILDER */
              <div className="pt-4 border-t border-border-soft space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                    Master Cuts / Tracklist ({draftTracks.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2.5 border border-border bg-background hover:border-foreground text-foreground cursor-pointer inline-flex items-center gap-1 font-medium">
                      <span>
                        {isBatchImporting
                          ? 'Importing Cuts...'
                          : '✦ Batch Import Cuts'}
                      </span>
                      <input
                        ref={batchCutsInputRef}
                        type="file"
                        accept="audio/*"
                        multiple
                        disabled={isBatchImporting}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          if (files.length > 0)
                            handleBatchImportFiles(files)
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
                      className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2.5 border border-dashed border-border text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      + Add Cut
                    </button>
                  </div>
                </div>

                {duplicateNotice && duplicateNotice.count > 0 && (
                  <div className="p-3 border border-warning/30 bg-warning-soft text-warning text-caption flex items-start gap-2.5 rounded-control animate-in fade-in duration-150">
                    <span className="font-mono text-caption shrink-0 mt-0.5">
                      ⚠️
                    </span>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="font-sans font-medium">
                        <strong>{duplicateNotice.count}</strong>{' '}
                        duplicate cut(s) were automatically detected and
                        excluded:
                      </p>
                      <p className="font-sans text-eyebrow opacity-90 truncate">
                        {duplicateNotice.titles.join(', ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDuplicateNotice(null)}
                      className="font-mono text-eyebrow text-muted-foreground hover:text-foreground cursor-pointer ml-auto shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <TrackListEditor
                  tracks={draftTracks}
                  currentArtistId={artistProfile.id}
                  genrePlaceholder="Genre (e.g. Jazz)"
                  creditLabel="Collaborators & Credits (Featured / Producers / Composers)"
                  creditHeadingRow
                  onUpdateTrack={(id, patch) =>
                    setDraftTracks((prev) =>
                      prev.map((t) =>
                        t.id === id ? { ...t, ...patch } : t,
                      ),
                    )
                  }
                  renderTools={(draft) => (
                    // Audio Upload Input for this track
                    <div className="flex items-center gap-2 shrink-0">
                      {draft.audioUrl || draft.rawAudioKey ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-1 border border-success/40 bg-success-soft text-success flex items-center gap-1">
                            <span>✓</span>
                            <span>
                              {formatDuration(
                                draft.durationSeconds,
                              )}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled
                            className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2 border border-border-soft bg-background text-muted-foreground/60 cursor-not-allowed"
                            title="Master audio attached. Use reset to replace."
                          >
                            Attached
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleResetDraftAudio(draft.id)
                            }
                            className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive bg-card cursor-pointer transition-colors"
                            title="Reset audio file for this cut"
                          >
                            ✕ Reset
                          </button>
                        </div>
                      ) : (
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-2.5 border border-border bg-card hover:border-foreground text-foreground cursor-pointer">
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
                          onClick={() =>
                            handleRemoveDraftCut(draft.id)
                          }
                          className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Remove Cut"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-border shrink-0 pb-safe">
              <button
                type="button"
                onClick={() => onClose()}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 border border-border rounded-control text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingRelease}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-6 bg-primary text-primary-foreground rounded-control hover:opacity-90 font-semibold cursor-pointer disabled:opacity-50 shadow-raised flex items-center gap-2"
              >
                {isSubmittingRelease ? (
                  <span>
                    {releaseMode === 'SCHEDULED'
                      ? 'Scheduling...'
                      : 'Publishing...'}
                  </span>
                ) : releaseMode === 'SCHEDULED' ? (
                  <>
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Schedule{' '}
                      {releaseType === 'SINGLE'
                        ? 'Single'
                        : releaseType}
                    </span>
                  </>
                ) : releaseType === 'SINGLE' ? (
                  <span>✦ Publish Single</span>
                ) : (
                  <span>Publish {releaseType}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
