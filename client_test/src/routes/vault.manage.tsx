import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '../stores/auth.store'
import {
  parseAudioFilesWithPool,
  clusterTracksIntoReleases,
  deduplicateParsedTracks,
  type ClusteredRelease,
  type ParsedTrack,
} from '../lib/audio-metadata'
import {
  storageApi,
  type LockerQuota,
  type PersonalRelease,
  type PersonalTrack,
  type PersonalArtist,
  type TrashedSong,
  type TrashedRelease,
} from '../lib/storage.api'
import { usePlayerStore } from '../stores/player.store'
import type { PlayerTrack } from '../types/player'
import { seedArtistCache } from '../lib/artist-resolver'
import { useLockerStore } from '../stores/locker.store'
import { socialApi } from '../lib/social.api'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { SongRow } from '../components/common/SongRow'
import {
  PlayIconSVG,
  TrashIconSVG,
  UploadCloudSVG,
  ChevronDownIconSVG,
  PlusIconSVG,
  ExternalLinkSVG,
  SearchIconSVG,
} from '../components/icons'

interface CollectionManageSearchParams {
  tab?: 'import' | 'collection' | 'artists' | 'trash'
}

export const Route = createFileRoute('/vault/manage')({
  component: PersonalCollectionManagePage,
  validateSearch: (
    search: Record<string, unknown>,
  ): CollectionManageSearchParams => {
    const rawTab = search.tab as string
    const validTabs = ['import', 'collection', 'artists', 'trash']
    return {
      tab: validTabs.includes(rawTab)
        ? (rawTab as CollectionManageSearchParams['tab'])
        : undefined,
    }
  },
})

function PersonalCollectionManagePage() {
  const { isAuthenticated, isLoading: isAuthLoading, user, refreshProfile } = useAuthStore()
  const searchParams = Route.useSearch()
  const navigate = useNavigate()

  // Quick Home & Recommendations Scope Toggle
  const [lockerIncludeInHome, setLockerIncludeInHome] = useState<boolean>(
    user?.lockerIncludeInHome ?? false,
  )
  const [isUpdatingHomeSetting, setIsUpdatingHomeSetting] = useState(false)

  useEffect(() => {
    if (user?.lockerIncludeInHome !== undefined) {
      setLockerIncludeInHome(user.lockerIncludeInHome)
    }
  }, [user?.lockerIncludeInHome])

  const handleToggleLockerInHome = async (enabled: boolean) => {
    setLockerIncludeInHome(enabled)
    setIsUpdatingHomeSetting(true)
    try {
      await socialApi.updatePrivacySettings({ lockerIncludeInHome: enabled })
      await refreshProfile()
    } catch (err) {
      console.error('Failed to update locker recommendation setting', err)
      setLockerIncludeInHome(!enabled)
    } finally {
      setIsUpdatingHomeSetting(false)
    }
  }

  // Navigation Tabs: default to "import"
  const [activeTab, setActiveTab] = useState<
    'import' | 'collection' | 'artists' | 'trash'
  >(searchParams.tab || 'import')

  // Keep synced if searchParam changes
  useEffect(() => {
    if (searchParams.tab && searchParams.tab !== activeTab) {
      setActiveTab(searchParams.tab)
    }
  }, [searchParams.tab])

  const handleTabChange = (
    tab: 'import' | 'collection' | 'artists' | 'trash',
  ) => {
    setActiveTab(tab)
    navigate({
      to: '/vault/manage',
      search: tab === 'import' ? {} : { tab },
      replace: true,
    })
  }

  // Trash State
  const [trashedSongs, setTrashedSongs] = useState<TrashedSong[]>([])
  const [trashedReleases, setTrashedReleases] = useState<TrashedRelease[]>([])
  const [isLoadingTrash, setIsLoadingTrash] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [trashConfirm, setTrashConfirm] = useState<{
    type: 'empty' | 'permanent_song' | 'permanent_release'
    id?: string
    title?: string
  } | null>(null)

  // Artists Roster State
  const [personalArtists, setPersonalArtists] = useState<PersonalArtist[]>([])
  const [isLoadingArtists, setIsLoadingArtists] = useState(false)
  const [artistsSearch, setArtistsSearch] = useState('')
  const [isCreatingArtist, setIsCreatingArtist] = useState(false)
  const [newArtistName, setNewArtistName] = useState('')
  const [newArtistBio, setNewArtistBio] = useState('')
  const [isSubmittingArtist, setIsSubmittingArtist] = useState(false)
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<
    string | null
  >(null)

  // Collection State
  const [personalReleases, setPersonalReleases] = useState<PersonalRelease[]>(
    [],
  )
  const [isLoadingReleases, setIsLoadingReleases] = useState(false)
  const [collectionSearch, setCollectionSearch] = useState('')
  const [expandedReleaseIds, setExpandedReleaseIds] = useState<Set<string>>(
    new Set(),
  )

  // Quota State
  const [quota, setQuota] = useState<LockerQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)

  // Deletion State
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'song' | 'release'
    id: string
    title: string
    parentReleaseId?: string
    trackCount?: number
  } | null>(null)

  // Import State
  const [isParsing, setIsParsing] = useState(false)
  const [parsingProgress, setParsingProgress] = useState({
    current: 0,
    total: 0,
  })
  const [importReleases, setImportReleases] = useState<ClusteredRelease[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusText, setUploadStatusText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [duplicateNotice, setDuplicateNotice] = useState<{
    count: number
    details: Array<{
      title: string
      artistName: string
      albumTitle: string
      reason: string
    }>
  } | null>(null)
  const [showDuplicateDetails, setShowDuplicateDetails] = useState(false)

  // Staging Workspace: Container creation & Track move state
  const [isCreatingContainer, setIsCreatingContainer] = useState(false)
  const [newContainerForm, setNewContainerForm] = useState<{
    title: string
    artistName: string
    albumType: 'ALBUM' | 'EP' | 'MIXTAPE' | 'LP' | 'SINGLE'
  }>({
    title: '',
    artistName: '',
    albumType: 'MIXTAPE',
  })

  const [movingTrackInfo, setMovingTrackInfo] = useState<{
    sourceReleaseId: string
    track: ParsedTrack
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Audio Player Store
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const triggerRefresh = useLockerStore((s) => s.triggerRefresh)

  // Load quota and personal releases when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadInitialData()
    }
  }, [isAuthenticated])

  const loadInitialData = async () => {
    await Promise.all([
      loadQuota(),
      loadCollection(),
      loadPersonalArtists(),
      loadTrash(),
    ])
  }

  const loadTrash = async () => {
    try {
      setIsLoadingTrash(true)
      const res = await storageApi.getTrash()
      setTrashedSongs(res.songs || [])
      setTrashedReleases(res.releases || [])
    } catch (err: any) {
      console.error('Failed to load trash:', err)
    } finally {
      setIsLoadingTrash(false)
    }
  }

  const handleRestoreSong = async (songId: string) => {
    try {
      setIsRestoring(true)
      setErrorMessage(null)
      await storageApi.restorePersonalSong(songId)
      setSuccessMessage('Song restored to your personal collection')
      await Promise.all([
        loadQuota(),
        loadCollection(),
        loadTrash(),
        loadPersonalArtists(),
      ])
      triggerRefresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restore song')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleRestoreRelease = async (releaseId: string) => {
    try {
      setIsRestoring(true)
      setErrorMessage(null)
      await storageApi.restorePersonalRelease(releaseId)
      setSuccessMessage('Release restored to your personal collection')
      await Promise.all([
        loadQuota(),
        loadCollection(),
        loadTrash(),
        loadPersonalArtists(),
      ])
      triggerRefresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restore release')
    } finally {
      setIsRestoring(false)
    }
  }

  const handlePermanentDeleteSong = async (songId: string) => {
    try {
      setIsPurging(true)
      setErrorMessage(null)
      await storageApi.permanentlyDeletePersonalSong(songId)
      setSuccessMessage('Song permanently deleted')
      setTrashConfirm(null)
      await Promise.all([loadTrash(), loadPersonalArtists(), loadQuota()])
      triggerRefresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete song permanently')
    } finally {
      setIsPurging(false)
    }
  }

  const handlePermanentDeleteRelease = async (releaseId: string) => {
    try {
      setIsPurging(true)
      setErrorMessage(null)
      await storageApi.permanentlyDeletePersonalRelease(releaseId)
      setSuccessMessage('Release permanently deleted')
      setTrashConfirm(null)
      await Promise.all([loadTrash(), loadPersonalArtists(), loadQuota()])
      triggerRefresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete release permanently')
    } finally {
      setIsPurging(false)
    }
  }

  const handleEmptyTrash = async () => {
    try {
      setIsPurging(true)
      setErrorMessage(null)
      await storageApi.emptyTrash()
      setSuccessMessage('Recycle bin permanently emptied')
      setTrashConfirm(null)
      await Promise.all([loadTrash(), loadPersonalArtists(), loadQuota()])
      triggerRefresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to empty recycle bin')
    } finally {
      setIsPurging(false)
    }
  }

  const loadPersonalArtists = async () => {
    try {
      setIsLoadingArtists(true)
      const res = await storageApi.getPersonalArtists()
      const artists = res.artists || []
      setPersonalArtists(artists)
      seedArtistCache(
        artists.map((a) => ({
          id: a.id,
          stageName: a.stageName,
          slug: a.slug,
          scope: 'PERSONAL',
        })),
      )
    } catch (err: any) {
      console.error('Failed to load personal artists:', err)
    } finally {
      setIsLoadingArtists(false)
    }
  }

  const handleCreateArtist = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newArtistName.trim()
    if (!name) return
    try {
      setIsSubmittingArtist(true)
      setErrorMessage(null)
      const res = await storageApi.createPersonalArtist({
        stageName: name,
        bio: newArtistBio.trim() || undefined,
      })
      if (res.isExisting) {
        setSuccessMessage(
          `Artist "${res.artist.stageName}" is already in your personal roster.`,
        )
      } else {
        setSuccessMessage(
          `Personal artist "${res.artist.stageName}" created successfully.`,
        )
        setPersonalArtists((prev) => [res.artist, ...prev])
        seedArtistCache([
          {
            id: res.artist.id,
            stageName: res.artist.stageName,
            slug: res.artist.slug,
            scope: 'PERSONAL',
          },
        ])
      }
      setNewArtistName('')
      setNewArtistBio('')
      setIsCreatingArtist(false)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create personal artist')
    } finally {
      setIsSubmittingArtist(false)
    }
  }

  const loadQuota = async () => {
    try {
      setQuotaLoading(true)
      const res = await storageApi.getQuota()
      setQuota(res.quota)
    } catch (err: any) {
      console.error('Failed to load personal collection quota:', err)
    } finally {
      setQuotaLoading(false)
    }
  }

  const loadCollection = async () => {
    try {
      setIsLoadingReleases(true)
      const res = await storageApi.getPersonalReleases()
      const releases = res.releases || []
      setPersonalReleases(releases)

      const seeds: Array<{
        id?: string
        stageName?: string
        slug?: string
        scope?: 'GLOBAL' | 'PERSONAL'
      }> = []

      for (const rel of releases) {
        if (rel.artistName && rel.artistSlug) {
          seeds.push({
            id: rel.artistId,
            stageName: rel.artistName,
            slug: rel.artistSlug,
            scope: 'PERSONAL',
          })
        }
        for (const trk of rel.tracks || []) {
          if (trk.credits && trk.credits.length > 0) {
            for (const c of trk.credits) {
              seeds.push({
                id: c.artistId,
                stageName: c.stageName,
                slug: c.slug,
                scope: 'PERSONAL',
              })
            }
          }
        }
      }

      if (seeds.length > 0) {
        seedArtistCache(seeds)
      }

      // Expand first release by default if available
      if (releases.length > 0) {
        setExpandedReleaseIds(new Set([releases[0].id]))
      }
    } catch (err: any) {
      console.error('Failed to load personal collection releases:', err)
    } finally {
      setIsLoadingReleases(false)
    }
  }

  const toggleExpandRelease = (releaseId: string) => {
    setExpandedReleaseIds((prev) => {
      const next = new Set(prev)
      if (next.has(releaseId)) {
        next.delete(releaseId)
      } else {
        next.add(releaseId)
      }
      return next
    })
  }

  // Helper to convert PersonalTrack + PersonalRelease into PlayerTrack
  const toPlayerTrack = (
    release: PersonalRelease,
    t: PersonalTrack,
  ): PlayerTrack => {
    const primaryCredit =
      t.credits?.find((c) => c.role === 'PRIMARY') || t.credits?.[0]
    return {
      id: t.id,
      title: t.title,
      artistId: primaryCredit?.artistId || release.artistId || '',
      artistName: t.artistName || release.artistName || 'Personal Artist',
      artistSlug: primaryCredit?.slug || release.artistSlug,
      albumId: release.id,
      albumTitle: release.title,
      albumSlug: release.slug,
      coverImageUrl: t.coverImageUrl || release.coverImageUrl || undefined,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      hlsManifestUrl: t.hlsManifestUrl,
      rawAudioKey: t.rawAudioKey,
      isExplicit: t.isExplicit ?? false,
      isStreamable: t.processingStatus !== 'PROCESSING',
      scope: 'PERSONAL',
      credits: (t.credits || []).map((c) => ({
        artistId: c.artistId,
        stageName: c.stageName,
        slug: c.slug,
        verified: false,
        role: (c.role as any) || 'PRIMARY',
      })),
    }
  }

  // Play a personal track within player context
  const handlePlayPersonalTrack = (
    release: PersonalRelease,
    track: PersonalTrack,
    trackIdx: number,
  ) => {
    if (track.processingStatus === 'PROCESSING') return
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }

    const contextTracks: PlayerTrack[] = release.tracks.map((t) =>
      toPlayerTrack(release, t),
    )

    playTrack(
      contextTracks[trackIdx],
      contextTracks,
      trackIdx,
      `personal:release:${release.id}`,
      `Personal Collection: ${release.title}`,
    )
  }

  // Queue entire release
  const handleQueuePersonalRelease = (release: PersonalRelease) => {
    if (!release.tracks || release.tracks.length === 0) return
    const readyTracks = release.tracks.filter(
      (t) => t.processingStatus !== 'PROCESSING',
    )
    if (readyTracks.length === 0) {
      setErrorMessage('Tracks are still processing, cannot queue yet.')
      return
    }
    readyTracks.forEach((t) => {
      addToQueue(toPlayerTrack(release, t))
    })
    setSuccessMessage(
      `Added ${readyTracks.length} ${readyTracks.length === 1 ? 'track' : 'tracks'} from "${release.title}" to queue.`,
    )
  }

  // Execute Song Deletion
  const confirmDeleteSong = async (songId: string, parentReleaseId: string) => {
    try {
      setDeletingItemId(songId)
      setErrorMessage(null)
      await storageApi.deletePersonalSong(songId)

      // Optimistically update collection state
      setPersonalReleases((prev) => {
        return prev
          .map((rel) => {
            if (rel.id !== parentReleaseId) return rel
            const updatedTracks = rel.tracks.filter((t) => t.id !== songId)
            return {
              ...rel,
              totalTracks: updatedTracks.length,
              totalDurationSeconds: updatedTracks.reduce(
                (acc, t) => acc + t.durationSeconds,
                0,
              ),
              tracks: updatedTracks,
            }
          })
          .filter((rel) => rel.tracks.length > 0)
      })

      // Update quota locally
      setQuota((prev) => {
        if (!prev) return null
        return {
          ...prev,
          usedSongs: Math.max(0, prev.usedSongs - 1),
          remainingSongs: Math.min(prev.maxSongs, prev.remainingSongs + 1),
        }
      })

      triggerRefresh()
      setDeleteConfirm(null)
      setSuccessMessage('Track moved to recycle bin.')
      loadTrash()
      loadPersonalArtists()
    } catch (err: any) {
      console.error('Failed to delete personal track:', err)
      setErrorMessage(err.message || 'Failed to delete track')
    } finally {
      setDeletingItemId(null)
    }
  }

  // Execute Release Deletion
  const confirmDeleteRelease = async (releaseId: string) => {
    try {
      setDeletingItemId(releaseId)
      setErrorMessage(null)
      const res = await storageApi.deletePersonalRelease(releaseId)

      const deletedCount = res.deletedTracks ?? 1

      // Optimistically remove release
      setPersonalReleases((prev) => prev.filter((r) => r.id !== releaseId))

      // Update quota locally
      setQuota((prev) => {
        if (!prev) return null
        return {
          ...prev,
          usedSongs: Math.max(0, prev.usedSongs - deletedCount),
          remainingSongs: Math.min(
            prev.maxSongs,
            prev.remainingSongs + deletedCount,
          ),
        }
      })

      triggerRefresh()
      setDeleteConfirm(null)
      setSuccessMessage('Release moved to recycle bin.')
      loadTrash()
      loadPersonalArtists()
    } catch (err: any) {
      console.error('Failed to delete personal release:', err)
      setErrorMessage(err.message || 'Failed to delete release')
    } finally {
      setDeletingItemId(null)
    }
  }

  // Process dropped or selected files for import
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) =>
      /\.(mp3|flac|wav|m4a|aac|ogg)$/i.test(f.name),
    )

    if (files.length === 0) {
      setErrorMessage(
        'No supported audio files found (.mp3, .flac, .wav, .m4a, .aac, .ogg)',
      )
      return
    }

    setErrorMessage(null)
    setIsParsing(true)
    setParsingProgress({ current: 0, total: files.length })

    try {
      // Concurrently parse files with a bounded pool of 6 workers
      const parsedTracks = await parseAudioFilesWithPool(
        files,
        6,
        (current, total) => {
          setParsingProgress({ current, total })
        },
      )

      // Deduplicate incoming files against current library and currently staged tracks
      const existingCollectionTracks = personalReleases.flatMap((r) =>
        r.tracks.map((t) => ({
          title: t.title,
          artistName: t.artistName || r.artistName || '',
          albumTitle: r.title,
          durationSeconds: t.durationSeconds,
        })),
      )
      const currentlyStagedTracks = importReleases.flatMap((r) => r.tracks)

      const dedupResult = deduplicateParsedTracks(
        parsedTracks,
        existingCollectionTracks,
        currentlyStagedTracks,
      )

      if (dedupResult.duplicateCount > 0) {
        setDuplicateNotice({
          count: dedupResult.duplicateCount,
          details: dedupResult.duplicateDetails,
        })
      }

      if (dedupResult.uniqueTracks.length === 0) {
        setErrorMessage(
          `All ${parsedTracks.length} file(s) selected are already in your personal collection or upload queue.`,
        )
        return
      }

      const clustered = clusterTracksIntoReleases(dedupResult.uniqueTracks)
      setImportReleases((prev) => [...prev, ...clustered])
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to parse audio tags')
    } finally {
      setIsParsing(false)
    }
  }

  const totalSelectedTracks = importReleases.reduce(
    (acc, r) => acc + r.tracks.length,
    0,
  )
  const isOverQuota = quota ? totalSelectedTracks > quota.remainingSongs : false

  // 1. Create Staged Container (Mixtape, EP, LP, Album)
  const handleCreateStagedContainer = (e: React.FormEvent) => {
    e.preventDefault()
    const title = newContainerForm.title.trim()
    if (!title) return

    const newContainer: ClusteredRelease = {
      id: `release_custom_${Date.now()}`,
      artistName: newContainerForm.artistName.trim() || 'Various Artists',
      albumTitle: title,
      albumType: newContainerForm.albumType,
      genre: null,
      releaseDate: new Date().toISOString().split('T')[0],
      coverFile: null,
      coverPreviewUrl: null,
      tracks: [],
    }

    setImportReleases((prev) => [newContainer, ...prev])
    setNewContainerForm({ title: '', artistName: '', albumType: 'MIXTAPE' })
    setIsCreatingContainer(false)
  }

  // 2. Detach Track as Standalone Single
  const handleDetachTrackAsSingle = (
    sourceReleaseId: string,
    trackId: string,
  ) => {
    setImportReleases((prev) => {
      const source = prev.find((r) => r.id === sourceReleaseId)
      if (!source) return prev
      const track = source.tracks.find((t) => t.id === trackId)
      if (!track) return prev

      const singleRelease: ClusteredRelease = {
        id: `release_single_${track.id}_${Date.now()}`,
        artistName: track.artistName || source.artistName,
        albumTitle: track.title,
        albumType: 'SINGLE',
        genre: track.genre || source.genre,
        releaseDate: source.releaseDate,
        coverFile: track.coverFile || source.coverFile,
        coverPreviewUrl: track.coverPreviewUrl || source.coverPreviewUrl,
        tracks: [
          {
            ...track,
            albumTitle: track.title,
            trackNumber: 1,
            discNumber: 1,
          },
        ],
      }

      return [
        singleRelease,
        ...prev
          .map((r) => {
            if (r.id !== sourceReleaseId) return r
            const remaining = r.tracks.filter((t) => t.id !== trackId)
            return {
              ...r,
              tracks: remaining.map((t, idx) => ({
                ...t,
                trackNumber: idx + 1,
              })),
            }
          })
          .filter((r) => r.tracks.length > 0),
      ]
    })
  }

  // 3. Move Track to Another Staged Release
  const handleMoveTrackToStagedRelease = (
    sourceReleaseId: string,
    targetReleaseId: string,
    track: ParsedTrack,
  ) => {
    setImportReleases((prev) => {
      const source = prev.find((r) => r.id === sourceReleaseId)
      const target = prev.find((r) => r.id === targetReleaseId)
      if (!source || !target) return prev

      const updatedSourceTracks = source.tracks.filter((t) => t.id !== track.id)
      const updatedTargetTracks = [
        ...target.tracks,
        {
          ...track,
          albumTitle: target.albumTitle,
          trackNumber: target.tracks.length + 1,
        },
      ]

      return prev
        .map((r) => {
          if (r.id === targetReleaseId) {
            return { ...r, tracks: updatedTargetTracks }
          }
          if (r.id === sourceReleaseId) {
            return {
              ...r,
              tracks: updatedSourceTracks.map((t, idx) => ({
                ...t,
                trackNumber: idx + 1,
              })),
            }
          }
          return r
        })
        .filter((r) => r.tracks.length > 0)
    })
    setMovingTrackInfo(null)
  }

  // 4. Attach Track to Existing Library Album
  const handleAttachTrackToExistingLibraryAlbum = (
    sourceReleaseId: string,
    existingAlbumId: string,
    track: ParsedTrack,
  ) => {
    const existingAlbum = personalReleases.find((a) => a.id === existingAlbumId)
    if (!existingAlbum) return

    setImportReleases((prev) => {
      let container = prev.find(
        (r) => r.targetExistingAlbumId === existingAlbumId,
      )
      let isNewContainer = false

      if (!container) {
        isNewContainer = true
        container = {
          id: `release_existing_${existingAlbum.id}_${Date.now()}`,
          artistName: existingAlbum.artistName || 'Personal Artist',
          albumTitle: existingAlbum.title,
          albumType: (existingAlbum.albumType as any) || 'ALBUM',
          genre: existingAlbum.genre || null,
          releaseDate:
            existingAlbum.releaseDate || new Date().toISOString().split('T')[0],
          coverFile: null,
          coverPreviewUrl: existingAlbum.coverImageUrl || null,
          tracks: [],
          targetExistingAlbumId: existingAlbum.id,
        }
      }

      const source = prev.find((r) => r.id === sourceReleaseId)
      const updatedSourceTracks = source
        ? source.tracks.filter((t) => t.id !== track.id)
        : []

      const updatedContainerTracks = [
        ...container.tracks,
        {
          ...track,
          albumTitle: existingAlbum.title,
          trackNumber: existingAlbum.totalTracks + container.tracks.length + 1,
        },
      ]

      const listWithContainer = isNewContainer ? [container, ...prev] : prev

      return listWithContainer
        .map((r) => {
          if (r.id === container!.id) {
            return { ...r, tracks: updatedContainerTracks }
          }
          if (r.id === sourceReleaseId) {
            return {
              ...r,
              tracks: updatedSourceTracks.map((t, idx) => ({
                ...t,
                trackNumber: idx + 1,
              })),
            }
          }
          return r
        })
        .filter((r) => r.tracks.length > 0)
    })
    setMovingTrackInfo(null)
  }

  // 5. Remove Track from Staged Release
  const handleRemoveTrackFromStagedRelease = (
    releaseId: string,
    trackId: string,
  ) => {
    setImportReleases((prev) =>
      prev
        .map((r) => {
          if (r.id !== releaseId) return r
          const remaining = r.tracks.filter((t) => t.id !== trackId)
          return {
            ...r,
            tracks: remaining.map((t, idx) => ({ ...t, trackNumber: idx + 1 })),
          }
        })
        .filter((r) => r.tracks.length > 0),
    )
  }

  // Execute Direct R2 Uploads + Bulk Release Registration
  const handleStartImport = async () => {
    const releasesToUpload = importReleases.filter((r) => r.tracks.length > 0)
    if (releasesToUpload.length === 0 || isOverQuota) return

    setIsUploading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setUploadProgress(0)

    try {
      // 1. Prepare batch presigned URL requests
      setUploadStatusText('Requesting presigned upload credentials...')
      const presignedBatch = []

      for (const release of releasesToUpload) {
        for (const track of release.tracks) {
          const ext = track.file.name.split('.').pop()?.toLowerCase() || 'mp3'
          const mime =
            track.file.type || (ext === 'flac' ? 'audio/flac' : 'audio/mpeg')
          presignedBatch.push({
            clientFileId: track.id,
            category: 'SONG_AUDIO_RAW' as const,
            resourceId: track.id,
            mimeType: mime,
            fileExtension: ext,
            fileSizeBytes: track.file.size,
          })
        }
        if (release.coverFile && !release.targetExistingAlbumId) {
          const cExt =
            release.coverFile.name.split('.').pop()?.toLowerCase() || 'jpg'
          presignedBatch.push({
            clientFileId: release.id,
            category: 'ALBUM_COVER' as const,
            resourceId: release.id,
            mimeType: release.coverFile.type || 'image/jpeg',
            fileExtension: cExt,
            fileSizeBytes: release.coverFile.size,
          })
        }
      }

      const { uploads } = await storageApi.getBatchPresignedUrls(presignedBatch)
      const uploadMap = new Map(uploads.map((u) => [u.clientFileId, u]))

      // 2. Upload files directly to Cloudflare R2 in concurrency of 3
      setUploadStatusText('Uploading media directly to storage...')
      const totalUploadsCount = presignedBatch.length
      let completedCount = 0

      const uploadQueue = []
      for (const release of releasesToUpload) {
        for (const track of release.tracks) {
          const urlInfo = uploadMap.get(track.id)
          if (urlInfo) {
            uploadQueue.push(async () => {
              await storageApi.uploadFileToR2(
                urlInfo.uploadUrl,
                track.file,
                track.file.type,
              )
              completedCount++
              setUploadProgress(
                Math.round((completedCount / totalUploadsCount) * 80),
              )
            })
          }
        }
        if (release.coverFile && !release.targetExistingAlbumId) {
          const coverUrlInfo = uploadMap.get(release.id)
          if (coverUrlInfo) {
            uploadQueue.push(async () => {
              await storageApi.uploadFileToR2(
                coverUrlInfo.uploadUrl,
                release.coverFile!,
                release.coverFile!.type,
              )
              completedCount++
              setUploadProgress(
                Math.round((completedCount / totalUploadsCount) * 80),
              )
            })
          }
        }
      }

      for (let i = 0; i < uploadQueue.length; i += 3) {
        const batch = uploadQueue.slice(i, i + 3).map((fn) => fn())
        await Promise.all(batch)
      }

      // 3. Register releases and outbox events in database
      setUploadStatusText('Registering releases & creating personal catalog...')
      setUploadProgress(85)

      for (let i = 0; i < releasesToUpload.length; i++) {
        const release = releasesToUpload[i]
        const coverUrlInfo = uploadMap.get(release.id)

        const tracksPayload = release.tracks.map((track) => {
          const songUrlInfo = uploadMap.get(track.id)
          return {
            title: track.title,
            trackNumber: track.trackNumber,
            discNumber: track.discNumber,
            durationSeconds: track.durationSeconds,
            genre: track.genre || release.genre || null,
            isExplicit: track.isExplicit,
            rawAudioKey: songUrlInfo?.storageKey || '',
            artistName:
              track.artistName !== release.artistName ? track.artistName : null,
          }
        })

        await storageApi.bulkImportRelease({
          artistName: release.artistName,
          albumTitle: release.albumTitle,
          albumType: release.albumType,
          genre: release.genre,
          releaseDate: release.releaseDate,
          coverImageUrl:
            coverUrlInfo?.publicUrl || release.coverPreviewUrl || null,
          existingAlbumId: release.targetExistingAlbumId || null,
          tracks: tracksPayload,
        })

        setUploadProgress(
          85 + Math.round(((i + 1) / releasesToUpload.length) * 15),
        )
      }

      setUploadStatusText('Import complete!')
      setUploadProgress(100)

      // Clear imported files
      setImportReleases([])
      setIsUploading(false)

      // Refresh collection and quota, trigger global refresh, and switch to collection tab
      await loadInitialData()
      triggerRefresh()
      handleTabChange('collection')
      setSuccessMessage(
        'Music successfully imported into your Personal Collection!',
      )
    } catch (err: any) {
      console.error('Personal collection import failed:', err)
      setErrorMessage(err.message || 'Failed to complete import')
      setIsUploading(false)
    }
  }

  // Filtered personal releases based on search query & selected artist filter
  const filteredReleases = useMemo(() => {
    let list = personalReleases
    if (selectedArtistFilter) {
      const filterLower = selectedArtistFilter.toLowerCase()
      list = list.filter((r) => {
        const matchesReleaseArtist = r.artistName?.toLowerCase() === filterLower
        const matchesTrackArtist = r.tracks?.some(
          (t) =>
            t.artistName?.toLowerCase().includes(filterLower) ||
            t.credits?.some((c) => c.stageName.toLowerCase() === filterLower),
        )
        return matchesReleaseArtist || matchesTrackArtist
      })
    }

    if (!collectionSearch.trim()) return list
    const query = collectionSearch.toLowerCase().trim()

    return list.filter((r) => {
      const matchAlbum = r.title.toLowerCase().includes(query)
      const matchArtist = r.artistName.toLowerCase().includes(query)
      const matchTrack = r.tracks.some((t) =>
        t.title.toLowerCase().includes(query),
      )
      return matchAlbum || matchArtist || matchTrack
    })
  }, [personalReleases, collectionSearch, selectedArtistFilter])

  // Filtered personal artists roster based on search query
  const filteredArtists = useMemo(() => {
    if (!artistsSearch.trim()) return personalArtists
    const q = artistsSearch.toLowerCase().trim()
    return personalArtists.filter(
      (a) =>
        a.stageName.toLowerCase().includes(q) ||
        (a.bio && a.bio.toLowerCase().includes(q)),
    )
  }, [personalArtists, artistsSearch])

  const totalPersonalSongs = useMemo(() => {
    return personalReleases.reduce((acc, r) => acc + (r.tracks?.length || 0), 0)
  }, [personalReleases])

  if (isAuthLoading) {
    return (
      <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
        Initializing Personal Vault...
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="py-12 w-full">
        <div className="border border-border bg-card p-10 sm:p-14 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 bg-background border border-border text-primary flex items-center justify-center mx-auto text-2xl">
            <UploadCloudSVG className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
              Private Audio Vault
            </div>
            <h2 className="font-serif italic text-3xl text-foreground font-normal">
              Sign in to Access Your Personal Collection
            </h2>
            <p className="font-sans text-caption text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Your Personal Collection lets you privately upload and stream your
              offline music library across devices. Files remain strictly
              confidential to your account.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              to="/login"
              search={{ redirect: '/vault/manage' }}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 bg-foreground text-background hover:opacity-90 transition-opacity font-semibold"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              search={{ redirect: '/vault/manage' }}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 border border-border bg-background hover:bg-card text-foreground transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="select-none">
      {/* Deletion Confirmation Modal Overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-2xl space-y-4 rounded-2xl">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 border border-border bg-background rounded-xl flex items-center justify-center text-destructive shrink-0 shadow-raised">
                <TrashIconSVG className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif italic text-lg text-foreground font-normal">
                  {deleteConfirm.type === 'song'
                    ? 'Delete Personal Track?'
                    : 'Delete Personal Release?'}
                </h4>
                <p className="font-sans text-caption text-muted-foreground mt-1 leading-relaxed">
                  Are you sure you want to remove{' '}
                  <strong className="text-foreground font-semibold">
                    "{deleteConfirm.title}"
                  </strong>{' '}
                  from your personal collection?
                  {deleteConfirm.type === 'release' && (
                    <span className="block text-foreground font-medium mt-1">
                      This will permanently delete all{' '}
                      {deleteConfirm.trackCount || 1} track(s) and immediately
                      free {deleteConfirm.trackCount || 1} quota slot(s).
                    </span>
                  )}
                  {deleteConfirm.type === 'song' && (
                    <span className="block text-foreground font-medium mt-1">
                      This will immediately free 1 quota slot.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingItemId !== null}
                onClick={() => setDeleteConfirm(null)}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border text-muted-foreground hover:text-foreground hover:border-foreground bg-background rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingItemId !== null}
                onClick={() => {
                  if (deleteConfirm.type === 'song') {
                    confirmDeleteSong(
                      deleteConfirm.id,
                      deleteConfirm.parentReleaseId!,
                    )
                  } else {
                    confirmDeleteRelease(deleteConfirm.id)
                  }
                }}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold transition-colors cursor-pointer flex items-center gap-1.5 rounded-control shadow-raised"
              >
                {deletingItemId !== null ? 'Deleting...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete / Empty Trash Confirmation Modal */}
      {trashConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-2xl space-y-4 rounded-2xl">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 border border-border bg-background rounded-xl flex items-center justify-center text-destructive shrink-0 shadow-raised">
                <TrashIconSVG className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif italic text-lg text-foreground font-normal">
                  {trashConfirm.type === 'empty'
                    ? 'Empty Recycle Bin?'
                    : trashConfirm.type === 'permanent_release'
                      ? 'Permanently Delete Release?'
                      : 'Permanently Delete Track?'}
                </h4>
                <p className="font-sans text-caption text-muted-foreground mt-1 leading-relaxed">
                  {trashConfirm.type === 'empty'
                    ? 'Are you sure you want to permanently delete all items in the recycle bin? Audio files will be removed from cloud storage. This action cannot be undone.'
                    : trashConfirm.type === 'permanent_release'
                      ? `Are you sure you want to permanently delete "${trashConfirm.title}" and all its audio files? This action cannot be undone.`
                      : `Are you sure you want to permanently delete "${trashConfirm.title}"? This action cannot be undone.`}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setTrashConfirm(null)}
                className="font-eyebrow text-caption uppercase tracking-wider px-3.5 py-2 border border-border text-muted-foreground hover:text-foreground bg-background rounded-md transition-colors cursor-pointer"
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
                    handlePermanentDeleteRelease(trashConfirm.id)
                  } else if (
                    trashConfirm.type === 'permanent_song' &&
                    trashConfirm.id
                  ) {
                    handlePermanentDeleteSong(trashConfirm.id)
                  }
                }}
                className="font-eyebrow text-caption uppercase tracking-wider px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors cursor-pointer font-semibold shadow-raised rounded-control"
              >
                {isPurging ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Move / Attach Modal Overlay */}
      {movingTrackInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div className="w-full max-w-lg border border-border bg-card p-6 shadow-2xl space-y-5 rounded-2xl max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-bold">
                  Staging Workspace &bull; Move or Attach
                </div>
                <h4 className="font-serif italic text-lg text-foreground font-normal mt-0.5">
                  "{movingTrackInfo.track.title}"
                </h4>
                <p className="font-sans text-caption text-muted-foreground">
                  {movingTrackInfo.track.artistName || 'Unknown Artist'} &bull;{' '}
                  {Math.floor(movingTrackInfo.track.durationSeconds / 60)}:
                  {(movingTrackInfo.track.durationSeconds % 60)
                    .toString()
                    .padStart(2, '0')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingTrackInfo(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 font-mono text-body"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-5 flex-1 pr-1">
              {/* Option A: Extract as Standalone Single */}
              <div className="space-y-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold">
                  1. Detach as Standalone Single
                </div>
                <div className="p-3 border border-border bg-background flex items-center justify-between gap-3 hover:border-foreground transition-colors rounded-xl shadow-raised">
                  <div>
                    <div className="font-serif italic text-caption text-foreground">
                      Create Standalone Single Release
                    </div>
                    <div className="font-sans text-eyebrow text-muted-foreground">
                      Extracts this song into its own Single release card
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleDetachTrackAsSingle(
                        movingTrackInfo.sourceReleaseId,
                        movingTrackInfo.track.id,
                      )
                      setMovingTrackInfo(null)
                    }}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-1.5 border border-border bg-card hover:border-foreground text-foreground transition-colors cursor-pointer shrink-0 font-semibold rounded-md shadow-raised"
                  >
                    Detach Single
                  </button>
                </div>
              </div>

              {/* Option B: Move to Another Staged Release */}
              <div className="space-y-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold">
                  2. Move to Another Staged Release
                </div>
                {importReleases.filter(
                  (r) => r.id !== movingTrackInfo.sourceReleaseId,
                ).length === 0 ? (
                  <div className="p-3 border border-dashed border-border bg-background/50 rounded-xl text-center font-mono text-eyebrow text-muted-foreground">
                    No other staged release cards in upload queue. Use "+ New
                    Release / Mixtape" on desk to create one.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {importReleases
                      .filter((r) => r.id !== movingTrackInfo.sourceReleaseId)
                      .map((targetRel) => (
                        <div
                          key={targetRel.id}
                          className="p-2.5 border border-border bg-background rounded-xl flex items-center justify-between gap-3 hover:border-primary transition-colors shadow-raised"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-serif italic text-caption text-foreground truncate">
                                {targetRel.albumTitle}
                              </span>
                              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1 py-0.2 border border-border bg-card text-primary font-semibold shrink-0 rounded-control">
                                {targetRel.albumType}
                              </span>
                            </div>
                            <div className="font-sans text-eyebrow text-muted-foreground truncate">
                              {targetRel.artistName} &bull;{' '}
                              {targetRel.tracks.length}{' '}
                              {targetRel.tracks.length === 1
                                ? 'track'
                                : 'tracks'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleMoveTrackToStagedRelease(
                                movingTrackInfo.sourceReleaseId,
                                targetRel.id,
                                movingTrackInfo.track,
                              )
                            }
                            className="font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-1.5 bg-primary text-background hover:opacity-90 transition-opacity cursor-pointer shrink-0 font-semibold rounded-md shadow-raised"
                          >
                            Move Here
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Option C: Attach to Existing Library Album */}
              <div className="space-y-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-semibold">
                  3. Attach to Existing Album in Your Personal Collection
                </div>
                {personalReleases.length === 0 ? (
                  <div className="p-3 border border-dashed border-border bg-background/50 rounded-xl text-center font-mono text-eyebrow text-muted-foreground">
                    No active releases in your personal library yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {personalReleases.map((libRel) => (
                      <div
                        key={libRel.id}
                        className="p-2.5 border border-border bg-background rounded-xl flex items-center justify-between gap-3 hover:border-primary transition-colors shadow-raised"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 border border-border bg-card shrink-0 overflow-hidden rounded-control">
                            {libRel.coverImageUrl ? (
                              <img
                                src={libRel.coverImageUrl}
                                alt={libRel.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif text-eyebrow text-muted-foreground">
                                🎵
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-serif italic text-caption text-foreground truncate">
                                {libRel.title}
                              </span>
                              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1 py-0.2 border border-border bg-card text-primary font-semibold shrink-0 rounded-control">
                                {libRel.albumType || 'ALBUM'}
                              </span>
                            </div>
                            <div className="font-sans text-eyebrow text-muted-foreground truncate">
                              {libRel.artistName} &bull; {libRel.totalTracks}{' '}
                              {libRel.totalTracks === 1 ? 'track' : 'tracks'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleAttachTrackToExistingLibraryAlbum(
                              movingTrackInfo.sourceReleaseId,
                              libRel.id,
                              movingTrackInfo.track,
                            )
                          }
                          className="font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-1.5 border border-primary text-primary hover:bg-primary hover:text-background transition-colors cursor-pointer shrink-0 font-semibold rounded-md"
                        >
                          Attach
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setMovingTrackInfo(null)}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground hover:border-foreground bg-background rounded-md transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== HERO BANNER ===================== */}
      <div className="border-b border-border pb-6 sm:pb-8 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 sm:gap-6">
          <div>
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-2 font-medium">
              Groovy Personal Vault
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground tracking-tight font-semibold">
              Locker Management
            </h1>
            <p className="font-sans text-caption sm:text-body text-muted-foreground max-w-xl mt-2 leading-relaxed">
              Stage and import audio files, organize private releases and artist
              rosters, and monitor your personal storage allocation.
            </p>
          </div>

          {/* Right Header Actions & Storage Quota */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {quotaLoading ? (
              <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground animate-pulse py-2">
                Checking quota...
              </div>
            ) : quota ? (
              <div className="bg-card border border-border rounded-xl p-3 sm:p-3.5 min-w-52.5 shadow-raised space-y-2">
                <div className="flex items-center justify-between font-eyebrow text-eyebrow uppercase tracking-wider">
                  <span className="text-muted-foreground">Storage Quota</span>
                  <span className="text-foreground font-semibold font-mono">
                    {quota.usedSongs} / {quota.maxSongs} Songs
                  </span>
                </div>
                <div className="w-full h-1.5 bg-background border border-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      quota.usedSongs >= quota.maxSongs
                        ? 'bg-destructive'
                        : 'bg-foreground'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((quota.usedSongs / quota.maxSongs) * 100),
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-eyebrow">
                  <span className="text-muted-foreground">
                    {quota.remainingSongs} slot
                    {quota.remainingSongs === 1 ? '' : 's'} left
                  </span>
                  <span
                    className={`font-semibold ${
                      quota.remainingSongs === 0 ? 'text-destructive' : 'text-primary'
                    }`}
                  >
                    {Math.round((quota.usedSongs / quota.maxSongs) * 100)}% Used
                  </span>
                </div>
              </div>
            ) : null}

            <Link
              to="/vault"
              className="inline-flex items-center justify-center gap-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 border border-border bg-card hover:bg-background text-foreground rounded-md transition-all shadow-raised cursor-pointer font-medium shrink-0 self-start sm:self-center"
            >
              <span>♫ View Vault</span>
            </Link>
          </div>
        </div>

        {/* Quick Personal Collection Recommendation Setting */}
        <div className="mt-5 p-3.5 border border-border bg-card/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-caption shadow-raised">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-semibold">
                Recommendation Scope
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-control font-eyebrow text-eyebrow uppercase tracking-wider ${
                  lockerIncludeInHome
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'bg-background text-muted-foreground border border-border'
                }`}
              >
                {lockerIncludeInHome ? 'Mixed (Personal + Global)' : 'Global Only (Default)'}
              </span>
            </div>
            <p className="text-muted-foreground text-eyebrow leading-snug">
              {lockerIncludeInHome
                ? 'Your personal uploads are blended into your personalized home shelves and recommendations.'
                : 'Personal uploads are isolated from your home shelves. Recommendations strictly surface global artists and releases.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={lockerIncludeInHome}
                disabled={isUpdatingHomeSetting}
                onChange={(e) => handleToggleLockerInHome(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5.5 bg-muted border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-background after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-muted-foreground peer-checked:after:bg-background after:border-border after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-foreground"></div>
            </label>
            <Link
              to="/profile"
              className="text-muted-foreground hover:text-foreground font-eyebrow text-eyebrow uppercase tracking-wider underline decoration-border/80 hover:decoration-foreground"
            >
              Preferences &rarr;
            </Link>
          </div>
        </div>

        {/* Scope Filter Tabs */}
        <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-2 border-b border-border pb-4">
          <button
            type="button"
            onClick={() => handleTabChange('import')}
            className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              activeTab === 'import'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            <span>Import Music</span>
            {importReleases.length > 0 && (
              <span className="font-bold">({totalSelectedTracks})</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('collection')}
            className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium ${
              activeTab === 'collection'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Releases (
            {filteredReleases.length !== personalReleases.length
              ? `${filteredReleases.length}/${personalReleases.length}`
              : personalReleases.length}
            ) &bull; {totalPersonalSongs} Tracks
          </button>

          <button
            type="button"
            onClick={() => {
              handleTabChange('artists')
              loadPersonalArtists()
            }}
            className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium ${
              activeTab === 'artists'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Artists ({personalArtists.length})
          </button>

          <button
            type="button"
            onClick={() => {
              handleTabChange('trash')
              loadTrash()
            }}
            className={`font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              activeTab === 'trash'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            <span>Recycle Bin</span>
            {trashedSongs.length + trashedReleases.length > 0 && (
              <span
                className={`font-mono text-eyebrow px-1.5 py-0.2 rounded-full ${
                  activeTab === 'trash'
                    ? 'bg-background text-foreground'
                    : 'bg-background border border-border text-muted-foreground'
                }`}
              >
                {trashedSongs.length + trashedReleases.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {errorMessage && (
        <div className="p-3.5 bg-destructive-soft border border-destructive/20 text-destructive font-mono text-caption flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-destructive font-bold ml-2 cursor-pointer font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 bg-success-soft border border-success/20 text-success font-mono text-caption flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-success font-bold ml-2 cursor-pointer font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================== TAB 1: IMPORT MUSIC ==================== */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Parsing progress indicator */}
          {isParsing && (
            <div className="p-4 bg-card border border-border text-caption text-foreground flex items-center gap-3 font-mono shadow-xs rounded-xl">
              <div className="w-4 h-4 border-2 border-border-soft border-t-foreground rounded-full animate-spin shrink-0" />
              <span>
                Extracting ID3 tags, duration &amp; artwork in browser (
                {parsingProgress.current} / {parsingProgress.total} files)...
              </span>
            </div>
          )}

          {/* Upload Progress Indicator */}
          {isUploading && (
            <div className="p-5 border border-border bg-card space-y-3 shadow-xs rounded-xl">
              <div className="flex justify-between font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                <span>{uploadStatusText}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-background border border-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-200 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Duplicate Detection Alert Banner */}
          {duplicateNotice && duplicateNotice.count > 0 && (
            <div className="p-4 bg-primary/10 border border-primary/20 text-primary font-mono text-caption flex flex-col gap-2 shadow-xs rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-body">⚡</span>
                  <span>
                    <strong>{duplicateNotice.count}</strong> duplicate track(s)
                    were automatically detected and excluded from the upload
                    queue.
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateDetails((v) => !v)}
                    className="underline hover:opacity-80 text-eyebrow uppercase tracking-wider cursor-pointer font-bold"
                  >
                    {showDuplicateDetails ? 'Hide details' : 'View skipped'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateNotice(null)}
                    className="cursor-pointer font-bold text-body leading-none"
                    title="Dismiss notification"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {showDuplicateDetails && (
                <div className="mt-2 border-t border-primary/20 pt-2 space-y-1.5 max-h-44 overflow-y-auto">
                  {duplicateNotice.details.map((d, i) => (
                    <div
                      key={i}
                      className="text-eyebrow text-muted-foreground flex items-center justify-between font-sans px-1"
                    >
                      <span className="truncate">
                        <strong>{d.artistName}</strong> &mdash; {d.title}{' '}
                        <span className="text-muted-foreground/60">
                          ({d.albumTitle})
                        </span>
                      </span>
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider shrink-0 text-primary ml-3">
                        {d.reason === 'already_in_collection'
                          ? 'In Library'
                          : 'Batch Duplicate'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Review Desk / Release List */}
          {importReleases.length > 0 ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h3 className="font-serif italic text-heading sm:text-2xl text-foreground font-semibold">
                    Import Staging Desk
                  </h3>
                  <p className="font-sans text-caption sm:text-body text-muted-foreground mt-0.5">
                    Review and refine release tags before uploading to your
                    private storage vault.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreatingContainer((v) => !v)}
                    disabled={isUploading}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline cursor-pointer font-semibold"
                  >
                    + New Release / Mixtape
                  </button>
                  <span className="text-border">&bull;</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    + Add More Files
                  </button>
                  <span className="text-border">&bull;</span>
                  <button
                    type="button"
                    onClick={() => setImportReleases([])}
                    disabled={isUploading}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Create Staged Container Form */}
              {isCreatingContainer && (
                <form
                  onSubmit={handleCreateStagedContainer}
                  className="p-5 border border-primary/30 bg-primary/5 space-y-3 shadow-xs rounded-xl"
                >
                  <div className="flex items-center justify-between font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-bold">
                    <span>Create Empty Staged Release / Mixtape Container</span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingContainer(false)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                        Release Title *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Summer Mixtape Vol. 1"
                        required
                        value={newContainerForm.title}
                        onChange={(e) =>
                          setNewContainerForm((f) => ({
                            ...f,
                            title: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground font-sans rounded-md"
                      />
                    </div>
                    <div>
                      <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                        Artist Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Various Artists"
                        value={newContainerForm.artistName}
                        onChange={(e) =>
                          setNewContainerForm((f) => ({
                            ...f,
                            artistName: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground font-sans rounded-md"
                      />
                    </div>
                    <div>
                      <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                        Release Type
                      </label>
                      <select
                        value={newContainerForm.albumType}
                        onChange={(e) =>
                          setNewContainerForm((f) => ({
                            ...f,
                            albumType: e.target.value as any,
                          }))
                        }
                        className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground font-sans rounded-md cursor-pointer"
                      >
                        <option value="MIXTAPE">Mixtape</option>
                        <option value="EP">EP</option>
                        <option value="ALBUM">Album</option>
                        <option value="LP">LP</option>
                        <option value="SINGLE">Single</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCreatingContainer(false)}
                      className="px-3 py-1.5 border border-border font-eyebrow text-eyebrow uppercase text-muted-foreground hover:text-foreground cursor-pointer bg-background rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-foreground text-background font-eyebrow text-eyebrow uppercase font-semibold hover:opacity-90 cursor-pointer rounded-md shadow-xs transition-opacity"
                    >
                      Create Container
                    </button>
                  </div>
                </form>
              )}

              {importReleases.map((release, relIdx) => (
                <div
                  key={release.id}
                  className="border border-border bg-card p-5 space-y-4 shadow-xs rounded-xl"
                >
                  {release.targetExistingAlbumId && (
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary font-eyebrow text-eyebrow uppercase tracking-wider font-semibold rounded-md">
                      <span>
                        ↳ Appending new track(s) to existing library album
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    {/* Cover Art Preview */}
                    <div className="w-20 h-20 bg-background border border-border shrink-0 overflow-hidden relative shadow-raised rounded-lg">
                      {release.coverPreviewUrl ? (
                        <img
                          src={release.coverPreviewUrl}
                          alt={release.albumTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ProceduralCover
                          title={release.albumTitle}
                          artistName={release.artistName}
                          size="md"
                          className="w-full h-full rounded-none"
                        />
                      )}
                    </div>

                    {/* Release metadata editor */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                          Album Title
                        </label>
                        <input
                          type="text"
                          value={release.albumTitle}
                          disabled={
                            isUploading || !!release.targetExistingAlbumId
                          }
                          onChange={(e) => {
                            const val = e.target.value
                            setImportReleases((prev) =>
                              prev.map((r, i) =>
                                i === relIdx ? { ...r, albumTitle: val } : r,
                              ),
                            )
                          }}
                          className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground transition-colors font-sans disabled:opacity-70 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                          Artist Name
                        </label>
                        <input
                          type="text"
                          value={release.artistName}
                          disabled={
                            isUploading || !!release.targetExistingAlbumId
                          }
                          onChange={(e) => {
                            const val = e.target.value
                            setImportReleases((prev) =>
                              prev.map((r, i) =>
                                i === relIdx ? { ...r, artistName: val } : r,
                              ),
                            )
                          }}
                          className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground transition-colors font-sans disabled:opacity-70 rounded-md"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                            Release Type
                          </label>
                          <select
                            value={release.albumType}
                            disabled={
                              isUploading || !!release.targetExistingAlbumId
                            }
                            onChange={(e) => {
                              const val = e.target.value as any
                              setImportReleases((prev) =>
                                prev.map((r, i) =>
                                  i === relIdx ? { ...r, albumType: val } : r,
                                ),
                              )
                            }}
                            className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground transition-colors font-sans disabled:opacity-70 rounded-md cursor-pointer"
                          >
                            <option value="ALBUM">Album</option>
                            <option value="EP">EP</option>
                            <option value="MIXTAPE">Mixtape</option>
                            <option value="LP">LP</option>
                            <option value="SINGLE">Single</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setImportReleases((prev) =>
                              prev.filter((_, i) => i !== relIdx),
                            )
                          }}
                          disabled={isUploading}
                          className="mt-4 p-2 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Remove release container"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tracks list */}
                  <div className="border border-border/60 bg-muted/20 divide-y divide-border/40 p-2 text-caption rounded-lg">
                    {release.tracks.map((track) => (
                      <div
                        key={track.id}
                        className="py-1.5 px-2 flex items-center justify-between hover:bg-background transition-colors gap-2 rounded-control"
                      >
                        <div className="flex items-center gap-2.5 truncate min-w-0">
                          <span className="font-mono text-eyebrow text-muted-foreground w-4 text-right shrink-0">
                            {track.trackNumber}
                          </span>
                          <span className="font-serif italic text-caption text-foreground truncate">
                            {track.title}
                          </span>
                          {track.artistName !== release.artistName && (
                            <span className="font-sans text-muted-foreground text-eyebrow truncate shrink-0">
                              ({track.artistName})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono text-eyebrow text-muted-foreground mr-1">
                            {Math.floor(track.durationSeconds / 60)}:
                            {(track.durationSeconds % 60)
                              .toString()
                              .padStart(2, '0')}
                          </span>

                          {/* Detach as Single */}
                          {(release.tracks.length > 1 ||
                            release.albumType !== 'SINGLE') && (
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() =>
                                handleDetachTrackAsSingle(release.id, track.id)
                              }
                              className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 border border-border text-muted-foreground hover:text-foreground hover:border-foreground bg-card transition-colors cursor-pointer rounded-control"
                              title="Extract this song into its own Single release"
                            >
                              Detach
                            </button>
                          )}

                          {/* Move / Attach to Release */}
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() =>
                              setMovingTrackInfo({
                                sourceReleaseId: release.id,
                                track,
                              })
                            }
                            className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 border border-border text-primary hover:border-primary bg-card transition-colors cursor-pointer rounded-control"
                            title="Move track to another staged release or attach to library album"
                          >
                            Move / Attach
                          </button>

                          {/* Remove Track */}
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() =>
                              handleRemoveTrackFromStagedRelease(
                                release.id,
                                track.id,
                              )
                            }
                            className="text-muted-foreground hover:text-destructive font-mono text-caption cursor-pointer p-0.5 ml-1"
                            title="Remove this track from upload"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}

                    {release.tracks.length === 0 && (
                      <div className="py-4 text-center font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground/60">
                        Container is empty. Move tracks into this container or
                        remove it.
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Action Bar */}
              <div className="p-4 border border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs rounded-xl">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                  <span>
                    Staged:{' '}
                    <strong className="text-foreground font-bold font-mono">
                      {totalSelectedTracks}
                    </strong>{' '}
                    track(s) across{' '}
                    <strong className="text-foreground font-bold font-mono">
                      {importReleases.length}
                    </strong>{' '}
                    release(s)
                  </span>
                  {isOverQuota && (
                    <span className="ml-2 text-destructive font-semibold">
                      (Exceeds remaining quota: {quota?.remainingSongs} slots
                      available)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (personalReleases.length > 0) {
                        handleTabChange('collection')
                      }
                    }}
                    disabled={isUploading}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground hover:border-foreground bg-background transition-colors cursor-pointer rounded-md"
                  >
                    Back to Collection
                  </button>
                  <button
                    type="button"
                    onClick={handleStartImport}
                    disabled={
                      importReleases.length === 0 || isUploading || isOverQuota
                    }
                    className={`font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 font-semibold transition-all cursor-pointer rounded-md ${
                      importReleases.length === 0 || isUploading || isOverQuota
                        ? 'bg-muted text-muted-foreground/50 border border-border cursor-not-allowed'
                        : 'bg-foreground text-background hover:opacity-90 shadow-xs'
                    }`}
                  >
                    {isUploading
                      ? 'Importing...'
                      : isOverQuota
                        ? 'Quota Exceeded'
                        : `Import ${totalSelectedTracks} Track${
                            totalSelectedTracks === 1 ? '' : 's'
                          } to Collection`}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty Drop Zone */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files) {
                  handleFilesSelected(e.dataTransfer.files)
                }
              }}
              className="border-2 border-dashed border-border bg-card hover:border-foreground/50 p-10 sm:p-14 text-center space-y-4 shadow-xs rounded-2xl transition-colors"
            >
              <div className="w-14 h-14 bg-background border border-border text-primary flex items-center justify-center mx-auto text-2xl rounded-xl shadow-raised">
                <UploadCloudSVG className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif italic text-2xl text-foreground font-normal">
                  Drop audio files or whole music folders here
                </h3>
                <p className="font-sans text-caption sm:text-body text-muted-foreground max-w-lg mx-auto leading-relaxed">
                  Supports MP3, FLAC, WAV, AAC, M4A, OGG. Tags and embedded
                  cover art are extracted in-browser using zero-copy streaming
                  tokens, automatically grouping albums and singles.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 bg-foreground text-background hover:opacity-90 transition-opacity font-semibold cursor-pointer shadow-xs rounded-md"
                >
                  Choose Audio Files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 border border-border text-foreground hover:border-foreground bg-background transition-colors cursor-pointer rounded-md shadow-raised"
                >
                  Choose Folder
                </button>
              </div>
            </div>
          )}

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp3,.flac,.wav,.m4a,.aac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFilesSelected(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFilesSelected(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* ==================== TAB 2: MY COLLECTION (RELEASES) ==================== */}
      {activeTab === 'collection' && (
        <div className="space-y-6">
          {/* Active Artist Filter Banner */}
          {selectedArtistFilter && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between font-mono text-caption text-primary">
              <div className="flex items-center gap-2">
                <span>Filtering collection by artist:</span>
                <strong className="text-foreground font-bold">
                  "{selectedArtistFilter}"
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArtistFilter(null)}
                className="underline hover:opacity-80 cursor-pointer font-bold"
              >
                Clear Filter
              </button>
            </div>
          )}

          {/* Search & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="relative w-full sm:max-w-md">
              <input
                type="text"
                placeholder="Search releases, artists, or songs in collection..."
                value={collectionSearch}
                onChange={(e) => setCollectionSearch(e.target.value)}
                className="w-full font-mono text-caption py-2.5 pl-9 pr-9 border border-border bg-card rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-raised"
              />
              <SearchIconSVG className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {collectionSearch && (
                <button
                  type="button"
                  onClick={() => setCollectionSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-caption p-1"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleTabChange('import')}
                className="inline-flex items-center justify-center gap-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 bg-foreground text-background hover:opacity-90 rounded-md transition-all shadow-xs shrink-0 cursor-pointer font-medium"
              >
                <PlusIconSVG className="w-3.5 h-3.5" />
                <span>Import Music</span>
              </button>
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground shrink-0 border-l border-border pl-3">
                {filteredReleases.length}{' '}
                {filteredReleases.length === 1 ? 'Release' : 'Releases'}
              </span>
            </div>
          </div>

          {/* Releases Content */}
          {isLoadingReleases ? (
            <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
              Loading personal collection...
            </div>
          ) : personalReleases.length === 0 ? (
            /* Empty Collection State */
            <div className="p-12 border border-dashed border-border bg-card/40 rounded-2xl text-center space-y-4 my-4">
              <div className="w-14 h-14 bg-background border border-border text-primary rounded-xl flex items-center justify-center mx-auto text-2xl shadow-raised">
                <UploadCloudSVG className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif italic text-2xl text-foreground font-normal">
                  Your Personal Collection is Empty
                </h3>
                <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Upload your offline MP3, FLAC, WAV, AAC, or OGG files. They
                  will be stored securely in your private vault with full
                  metadata tags and album clusters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange('import')}
                className="mt-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 bg-foreground text-background hover:opacity-90 rounded-md transition-all font-semibold cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <UploadCloudSVG className="w-4 h-4" />
                <span>Start Importing Music</span>
              </button>
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-caption font-mono border border-border bg-card rounded-xl">
              No releases match "{collectionSearch}".
            </div>
          ) : (
            /* Releases Cards List */
            <div className="space-y-4">
              {filteredReleases.map((release) => {
                const isExpanded = expandedReleaseIds.has(release.id)
                const isDeletingRelease = deletingItemId === release.id

                return (
                  <div
                    key={release.id}
                    className="border border-border bg-card shadow-xs overflow-hidden transition-all rounded-xl hover:border-foreground/40"
                  >
                    {/* Release Header */}
                    <div className="p-3.5 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                      {/* Left Info: Artwork + Title + Badges + Artist */}
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* Clickable Artwork Cover */}
                        <Link
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: release.slug || release.id }}
                          className="relative w-14 h-14 sm:w-16 sm:h-16 bg-background border border-border shrink-0 overflow-hidden shadow-raised group/cover block rounded-lg"
                          title={`View "${release.title}" album page`}
                        >
                          {release.coverImageUrl ? (
                            <img
                              src={release.coverImageUrl}
                              alt={release.title}
                              className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <ProceduralCover
                              size="md"
                              title={release.title}
                              artistName={release.artistName}
                              className="w-full h-full rounded-none"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLinkSVG className="w-4 h-4 text-white" />
                          </div>
                        </Link>

                        {/* Release Title & Artist */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <Link
                              to="/albums/$idOrSlug"
                              params={{ idOrSlug: release.slug || release.id }}
                              className="font-serif italic text-title sm:text-lg text-foreground font-medium hover:text-primary transition-colors line-clamp-1 truncate max-w-full"
                              title={release.title}
                            >
                              {release.title}
                            </Link>
                            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 font-semibold shrink-0 rounded-control">
                              {release.albumType || 'Album'}
                            </span>
                            {release.genre && (
                              <span className="hidden sm:inline-block font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground bg-background border border-border px-1.5 py-0.5 shrink-0 rounded-control">
                                {release.genre}
                              </span>
                            )}
                          </div>

                          {/* Artist Link & Track Stats */}
                          <p className="font-sans text-caption text-muted-foreground truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <Link
                              to="/artists/$idOrSlug"
                              params={{
                                idOrSlug:
                                  release.artistSlug || release.artistId,
                              }}
                              className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium truncate"
                              title={`View ${release.artistName}'s profile`}
                            >
                              {release.artistName}
                            </Link>
                            <span className="opacity-60">&bull;</span>
                            <span className="font-mono text-eyebrow">
                              {release.totalTracks}{' '}
                              {release.totalTracks === 1 ? 'track' : 'tracks'}
                            </span>
                            {release.totalDurationSeconds > 0 && (
                              <>
                                <span className="opacity-60">&bull;</span>
                                <span className="font-mono text-eyebrow">
                                  {Math.floor(
                                    release.totalDurationSeconds / 60,
                                  )}
                                  m {release.totalDurationSeconds % 60}s
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Action Controls (Responsive Bar) */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        <div className="flex items-center gap-2">
                          {/* Play Release Button */}
                          {release.tracks?.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handlePlayPersonalTrack(
                                  release,
                                  release.tracks[0],
                                  0,
                                )
                              }
                              className="h-8 px-2.5 sm:px-3 border border-border bg-background hover:bg-card flex items-center gap-1.5 text-foreground transition-colors cursor-pointer shadow-raised font-eyebrow text-eyebrow uppercase tracking-wider rounded-md"
                              title="Play Release from Beginning"
                            >
                              <PlayIconSVG className="w-3.5 h-3.5 text-primary ml-0.5" />
                              <span className="hidden sm:inline">Play</span>
                            </button>
                          )}

                          {/* Queue Entire Release Button */}
                          {release.tracks?.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleQueuePersonalRelease(release)
                              }
                              className="h-8 px-2.5 sm:px-3 border border-border bg-background hover:bg-card flex items-center gap-1.5 text-foreground transition-colors cursor-pointer shadow-raised font-eyebrow text-eyebrow uppercase tracking-wider rounded-md"
                              title="Add all tracks from this release to Queue"
                            >
                              <PlusIconSVG className="w-3 h-3 text-muted-foreground" />
                              <span>+ Queue</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Toggle Expand Tracks Button */}
                          <button
                            type="button"
                            onClick={() => toggleExpandRelease(release.id)}
                            className={`h-8 px-3 border border-border bg-background hover:bg-card text-foreground transition-colors cursor-pointer font-eyebrow text-eyebrow uppercase tracking-wider flex items-center gap-1.5 rounded-md ${
                              isExpanded ? 'bg-card border-muted-foreground' : ''
                            }`}
                            title={
                              isExpanded ? 'Hide tracklist' : 'View all tracks'
                            }
                          >
                            <span>
                              {isExpanded
                                ? 'Hide'
                                : `Tracklist (${release.totalTracks})`}
                            </span>
                            <ChevronDownIconSVG
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                isExpanded
                                  ? 'rotate-180 text-primary'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          </button>

                          {/* Delete Release Button */}
                          <button
                            type="button"
                            disabled={isDeletingRelease}
                            onClick={() =>
                              setDeleteConfirm({
                                type: 'release',
                                id: release.id,
                                title: release.title,
                                trackCount: release.totalTracks,
                              })
                            }
                            className="w-8 h-8 border border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground flex items-center justify-center transition-colors cursor-pointer shadow-raised rounded-md"
                            title="Delete Release from Personal Collection"
                          >
                            {isDeletingRelease ? (
                              <div className="w-3 h-3 border border-destructive border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <TrashIconSVG className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Tracks List */}
                    {isExpanded && release.tracks && (
                      <div className="border-t border-border bg-muted/20 divide-y divide-border/60">
                        {/* Tracklist Sub-header (Desktop) */}
                        <div className="hidden sm:flex items-center justify-between gap-4 px-4 py-2 border-b border-border/60 bg-background/30 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <span className="w-7 text-center">#</span>
                            <span>Cut Title &amp; Collaborators</span>
                          </div>
                          <div className="flex items-center justify-end gap-6 shrink-0 pr-3">
                            <span>Actions &amp; Duration</span>
                          </div>
                        </div>

                        {release.tracks.map((track, tIdx) => {
                          const primaryCredits = (track.credits || [])
                            .filter((c) => c.role === 'PRIMARY')
                            .map((c) => ({
                              artistId: c.artistId,
                              stageName: c.stageName,
                              slug: c.slug,
                              role: c.role,
                            }))
                          const featuredCredits = (track.credits || [])
                            .filter((c) => c.role === 'FEATURED')
                            .map((c) => ({
                              artistId: c.artistId,
                              stageName: c.stageName,
                              slug: c.slug,
                              role: c.role,
                            }))

                          return (
                            <SongRow
                              key={track.id}
                              track={toPlayerTrack(release, track)}
                              index={tIdx}
                              trackNumberDisplay={track.trackNumber || tIdx + 1}
                              variant="album"
                              isPersonal={true}
                              primaryCredits={primaryCredits}
                              featuredCredits={featuredCredits}
                              onPlay={() =>
                                handlePlayPersonalTrack(release, track, tIdx)
                              }
                              customActions={[
                                {
                                  label: 'Delete Track from Vault',
                                  danger: true,
                                  icon: (
                                    <TrashIconSVG className="w-3.5 h-3.5" />
                                  ),
                                  onClick: () => {
                                    setDeleteConfirm({
                                      type: 'song',
                                      id: track.id,
                                      title: track.title,
                                      parentReleaseId: release.id,
                                    })
                                  },
                                },
                              ]}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: ARTISTS ROSTER ==================== */}
      {activeTab === 'artists' && (
        <div className="space-y-6">
          {/* Action & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search personal artists..."
                value={artistsSearch}
                onChange={(e) => setArtistsSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 border border-border bg-card text-caption text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground transition-colors font-sans shadow-raised"
              />
              <span className="absolute left-2.5 top-2.5 text-muted-foreground text-caption">
                🔍
              </span>
              {artistsSearch && (
                <button
                  onClick={() => setArtistsSearch('')}
                  className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-caption cursor-pointer font-mono"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Inline Artist Creator Form */}
          {isCreatingArtist && (
            <form
              onSubmit={handleCreateArtist}
              className="p-5 border border-border bg-card space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-border pb-2 font-eyebrow text-caption uppercase tracking-wider text-foreground font-bold">
                <span>Create Sandboxed Personal Artist</span>
                <button
                  type="button"
                  onClick={() => setIsCreatingArtist(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                    Stage / Artist Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Miles Davis"
                    value={newArtistName}
                    onChange={(e) => setNewArtistName(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-background text-caption text-foreground focus:outline-none focus:border-foreground font-sans"
                  />
                </div>
                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                    Bio / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Private vault live recordings"
                    value={newArtistBio}
                    onChange={(e) => setNewArtistBio(e.target.value)}
                    className="w-full px-3 py-2 border border-border bg-background text-caption text-foreground focus:outline-none focus:border-foreground font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreatingArtist(false)}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border text-muted-foreground hover:text-foreground bg-background cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingArtist || !newArtistName.trim()}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingArtist ? 'Creating...' : 'Save Artist'}
                </button>
              </div>
            </form>
          )}

          {/* Artists Cards Grid */}
          {isLoadingArtists ? (
            <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
              Loading personal artists...
            </div>
          ) : personalArtists.length === 0 ? (
            <div className="p-12 border border-dashed border-border bg-muted/20 text-center space-y-3">
              <h3 className="font-serif italic text-2xl text-foreground font-normal">
                No Personal Artists Yet
              </h3>
              <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto">
                When you import audio files, artists are automatically
                identified and cataloged in your private roster with
                collaborator links.
              </p>
              <button
                type="button"
                onClick={() => setIsCreatingArtist(true)}
                className="mt-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background font-semibold cursor-pointer"
              >
                + Create Artist Manually
              </button>
            </div>
          ) : filteredArtists.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-caption font-mono border border-border bg-card">
              No personal artists match "{artistsSearch}".
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArtists.map((artist) => (
                <div
                  key={artist.id}
                  className="border border-border bg-card p-5 space-y-4 hover:border-foreground transition-colors shadow-xs flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 border border-border bg-background shrink-0 overflow-hidden flex items-center justify-center font-serif text-lg text-foreground font-bold shadow-raised">
                      {artist.stageName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-serif italic text-lg text-foreground font-medium truncate">
                          {artist.stageName}
                        </h4>
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-1 py-0.2 shrink-0 font-semibold">
                          Personal
                        </span>
                      </div>
                      {artist.bio ? (
                        <p className="font-sans text-caption text-muted-foreground line-clamp-2 mt-1">
                          {artist.bio}
                        </p>
                      ) : (
                        <p className="font-mono text-eyebrow text-muted-foreground/60 mt-1">
                          Personal Vault Artist
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <div className="font-mono text-eyebrow text-muted-foreground flex items-center gap-2">
                      <span>
                        <strong>{artist.releaseCount}</strong>{' '}
                        {artist.releaseCount === 1 ? 'Release' : 'Releases'}
                      </span>
                      <span>&bull;</span>
                      <span>
                        <strong>{artist.trackCount}</strong>{' '}
                        {artist.trackCount === 1 ? 'Track' : 'Tracks'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArtistFilter(artist.stageName)
                        handleTabChange('collection')
                      }}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 border border-border bg-background hover:border-primary hover:text-primary transition-colors cursor-pointer font-semibold"
                    >
                      View Music
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB: TRASH / RECYCLE BIN ==================== */}
      {activeTab === 'trash' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-border bg-card/60">
            <div>
              <h2 className="font-serif italic text-heading text-foreground">
                Recycle Bin
              </h2>
              <p className="font-sans text-caption text-muted-foreground mt-1">
                Soft-deleted songs and releases do not consume personal quota.
                You can restore them or permanently purge them.
              </p>
            </div>
            {(trashedSongs.length > 0 || trashedReleases.length > 0) && (
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setTrashConfirm({ type: 'empty' })}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-destructive/40 bg-destructive-soft hover:bg-destructive/20 text-destructive transition-colors font-semibold cursor-pointer shrink-0"
              >
                {isPurging ? 'Emptying...' : 'Empty Recycle Bin'}
              </button>
            )}
          </div>

          {isLoadingTrash ? (
            <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
              Loading recycle bin...
            </div>
          ) : trashedSongs.length === 0 && trashedReleases.length === 0 ? (
            <div className="p-16 border border-dashed border-border bg-muted/20 text-center space-y-2">
              <h3 className="font-serif italic text-2xl text-foreground font-normal">
                Recycle Bin is Empty
              </h3>
              <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto">
                No soft-deleted songs or releases found. When you delete items
                from your collection, they will appear here before being
                permanently purged.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Trashed Releases */}
              {trashedReleases.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 font-eyebrow text-caption uppercase tracking-wider text-foreground font-semibold">
                    <span>Trashed Releases ({trashedReleases.length})</span>
                  </div>

                  <div className="divide-y divide-border border border-border bg-card">
                    {trashedReleases.map((rel) => (
                      <div
                        key={rel.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-background transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 border border-border bg-background shrink-0 overflow-hidden">
                            {rel.coverImageUrl ? (
                              <img
                                src={rel.coverImageUrl}
                                alt={rel.title}
                                className="w-full h-full object-cover grayscale opacity-70"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif text-lg text-muted-foreground">
                                {rel.title.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-serif italic text-title text-foreground truncate">
                                {rel.title}
                              </span>
                              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 border border-border bg-background text-muted-foreground font-semibold">
                                {rel.albumType}
                              </span>
                            </div>
                            <div className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                              {rel.artistName} &bull; {rel.totalTracks}{' '}
                              {rel.totalTracks === 1 ? 'track' : 'tracks'}
                            </div>
                            <div className="font-mono text-eyebrow text-muted-foreground/70 mt-1">
                              Deleted on{' '}
                              {new Date(rel.deletedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isRestoring}
                            onClick={() => handleRestoreRelease(rel.id)}
                            className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-colors cursor-pointer"
                          >
                            Restore Release
                          </button>
                          <button
                            type="button"
                            disabled={isPurging}
                            onClick={() =>
                              setTrashConfirm({
                                type: 'permanent_release',
                                id: rel.id,
                                title: rel.title,
                              })
                            }
                            className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-destructive/40 hover:bg-destructive/20 text-destructive font-semibold transition-colors cursor-pointer"
                          >
                            Delete Forever
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trashed Individual Songs */}
              {trashedSongs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 font-eyebrow text-caption uppercase tracking-wider text-foreground font-semibold">
                    <span>
                      Trashed Standalone Songs ({trashedSongs.length})
                    </span>
                  </div>

                  <div className="divide-y divide-border border border-border bg-card">
                    {trashedSongs.map((song) => (
                      <div
                        key={song.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-serif italic text-body text-foreground truncate">
                            {song.title}
                          </div>
                          <div className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                            {song.artistName}{' '}
                            {song.albumTitle ? `— ${song.albumTitle}` : ''}{' '}
                            &bull; {Math.floor(song.durationSeconds / 60)}:
                            {(song.durationSeconds % 60)
                              .toString()
                              .padStart(2, '0')}
                          </div>
                          <div className="font-mono text-eyebrow text-muted-foreground/70 mt-1">
                            Deleted on{' '}
                            {new Date(song.deletedAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isRestoring}
                            onClick={() => handleRestoreSong(song.id)}
                            className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-colors cursor-pointer"
                          >
                            Restore Song
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
                            className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-destructive/40 hover:bg-destructive/20 text-destructive font-semibold transition-colors cursor-pointer"
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
        </div>
      )}
    </div>
  )
}
