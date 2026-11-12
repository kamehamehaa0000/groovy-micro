import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  type PersonalReleasesResponse,
  type PersonalArtistsResponse,
  type PersonalTrack,
} from '../lib/storage.api'
import { usePlayerStore } from '../stores/player.store'
import type { PlayerTrack } from '../types/player'
import { seedArtistCache } from '../lib/artist-resolver'
import { useLockerStore } from '../stores/locker.store'
import { socialApi } from '../lib/social.api'
import { VaultManageContext, type VaultManageContextValue } from '../Components/vault/manage/VaultManageContext'
import { ImportDesk } from '../Components/vault/manage/ImportDesk'
import { CollectionDesk } from '../Components/vault/manage/CollectionDesk'
import { ArtistsDesk } from '../Components/vault/manage/ArtistsDesk'
import { TrashDesk } from '../Components/vault/manage/TrashDesk'
import {
  TrashIconSVG,
  UploadCloudSVG,
} from '../Components/Icons'

interface CollectionManageSearchParams {
  tab?: 'import' | 'collection' | 'artists' | 'trash'
}

export const Route = createFileRoute('/vault/manage')({
  staticData: { layout: 'full' },
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const user = useAuthStore((s) => s.user)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
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

  // React Query owns the four datasets. A mutation now invalidates only the
  // queries it actually changed, instead of refetching three or four endpoints
  // every time something was restored, deleted or uploaded.
  const trashQuery = useQuery({
    queryKey: ['vault', 'trash'],
    queryFn: () => storageApi.getTrash(),
    enabled: isAuthenticated,
  })

  const artistsQuery = useQuery({
    queryKey: ['vault', 'artists'],
    queryFn: () => storageApi.getPersonalArtists(),
    enabled: isAuthenticated,
  })

  const collectionQuery = useQuery({
    queryKey: ['vault', 'collection'],
    queryFn: () => storageApi.getPersonalReleases(),
    enabled: isAuthenticated,
  })

  const quotaQuery = useQuery({
    queryKey: ['vault', 'quota'],
    queryFn: () => storageApi.getQuota(),
    enabled: isAuthenticated,
  })

  const invalidateVault = (keys: Array<'trash' | 'artists' | 'collection' | 'quota'>) => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: ['vault', key] })
    }
  }

  // Trash State
  const trashedSongs = trashQuery.data?.songs ?? []
  const trashedReleases = trashQuery.data?.releases ?? []
  const isLoadingTrash = trashQuery.isLoading
  const [isRestoring, setIsRestoring] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [trashConfirm, setTrashConfirm] = useState<{
    type: 'empty' | 'permanent_song' | 'permanent_release'
    id?: string
    title?: string
  } | null>(null)

  // Artists Roster State
  const personalArtists = artistsQuery.data?.artists ?? []
  const isLoadingArtists = artistsQuery.isLoading
  const [artistsSearch, setArtistsSearch] = useState('')
  const [isCreatingArtist, setIsCreatingArtist] = useState(false)
  const [newArtistName, setNewArtistName] = useState('')
  const [newArtistBio, setNewArtistBio] = useState('')
  const [isSubmittingArtist, setIsSubmittingArtist] = useState(false)
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<
    string | null
  >(null)

  // Collection State
  const personalReleases = collectionQuery.data?.releases ?? []
  const isLoadingReleases = collectionQuery.isLoading
  const [collectionSearch, setCollectionSearch] = useState('')
  const [expandedReleaseIds, setExpandedReleaseIds] = useState<Set<string>>(
    new Set(),
  )

  // Quota State
  const quota = quotaQuery.data?.quota ?? null
  const quotaLoading = quotaQuery.isLoading

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
  const queryClient = useQueryClient()

  // Load quota and personal releases when authenticated
  // The artist cache is seeded from the loaded data so the artist resolver
  // knows about personal artists.
  useEffect(() => {
    const artists = artistsQuery.data?.artists
    if (!artists || artists.length === 0) return
    seedArtistCache(
      artists.map((artist) => ({
        id: artist.id,
        stageName: artist.stageName,
        slug: artist.slug,
        scope: 'PERSONAL',
      })),
    )
  }, [artistsQuery.data])

  // The first release starts open, the way it did when the collection was
  // loaded by hand.
  useEffect(() => {
    const releases = collectionQuery.data?.releases
    if (!releases || releases.length === 0) return
    setExpandedReleaseIds((prev) =>
      prev.size === 0 ? new Set([releases[0].id]) : prev,
    )
  }, [collectionQuery.data])

  const handleRestoreSong = async (songId: string) => {
    try {
      setIsRestoring(true)
      setErrorMessage(null)
      await storageApi.restorePersonalSong(songId)
      setSuccessMessage('Song restored to your personal collection')
      invalidateVault(['quota', 'collection', 'trash', 'artists'])
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
      invalidateVault(['quota', 'collection', 'trash', 'artists'])
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
      invalidateVault(['trash', 'artists', 'quota'])
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
      invalidateVault(['trash', 'artists', 'quota'])
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
      invalidateVault(['trash', 'artists', 'quota'])
      triggerRefresh()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to empty recycle bin')
    } finally {
      setIsPurging(false)
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
        queryClient.setQueryData<PersonalArtistsResponse>(
          ['vault', 'artists'],
          (prev) =>
            prev
              ? { ...prev, artists: [res.artist, ...prev.artists] }
              : prev,
        )
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

      // Optimistically update the cached collection and quota.
      queryClient.setQueryData<PersonalReleasesResponse>(
        ['vault', 'collection'],
        (prev) => {
          const releases = prev?.releases ?? []
          return {
            ...prev,
            releases: releases
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
              .filter((rel) => rel.tracks.length > 0),
          }
        },
      )

      queryClient.setQueryData<{ quota: LockerQuota }>(
        ['vault', 'quota'],
        (prev) => {
          if (!prev?.quota) return prev
          return {
            quota: {
              ...prev.quota,
              usedSongs: Math.max(0, prev.quota.usedSongs - 1),
              remainingSongs: Math.min(
                prev.quota.maxSongs,
                prev.quota.remainingSongs + 1,
              ),
            },
          }
        },
      )

      triggerRefresh()
      setDeleteConfirm(null)
      setSuccessMessage('Track moved to recycle bin.')
      invalidateVault(['trash', 'artists'])
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

      // Optimistically remove the release from the cached collection.
      queryClient.setQueryData<PersonalReleasesResponse>(
        ['vault', 'collection'],
        (prev) =>
          prev
            ? {
                ...prev,
                releases: prev.releases.filter((r) => r.id !== releaseId),
              }
            : prev,
      )

      // Update the cached quota.
      queryClient.setQueryData<{ quota: LockerQuota }>(
        ['vault', 'quota'],
        (prev) => {
          if (!prev?.quota) return prev
          return {
            quota: {
              ...prev.quota,
              usedSongs: Math.max(0, prev.quota.usedSongs - deletedCount),
              remainingSongs: Math.min(
                prev.quota.maxSongs,
                prev.quota.remainingSongs + deletedCount,
              ),
            },
          }
        },
      )

      triggerRefresh()
      setDeleteConfirm(null)
      setSuccessMessage('Release moved to recycle bin.')
      invalidateVault(['trash', 'artists'])
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
      invalidateVault(['collection', 'quota', 'trash', 'artists'])
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

  const vaultManageContext: VaultManageContextValue = {
    trashedSongs,
    trashedReleases,
    isLoadingTrash,
    isRestoring,
    isPurging,
    trashConfirm,
    setTrashConfirm,
    handleRestoreSong,
    handleRestoreRelease,
    handlePermanentDeleteSong,
    handlePermanentDeleteRelease,
    handleEmptyTrash,
    personalArtists,
    isLoadingArtists,
    artistsSearch,
    setArtistsSearch,
    isCreatingArtist,
    setIsCreatingArtist,
    newArtistName,
    setNewArtistName,
    newArtistBio,
    setNewArtistBio,
    isSubmittingArtist,
    setIsSubmittingArtist,
    selectedArtistFilter,
    setSelectedArtistFilter,
    handleCreateArtist,
    filteredArtists,
    personalReleases,
    isLoadingReleases,
    collectionSearch,
    setCollectionSearch,
    expandedReleaseIds,
    setExpandedReleaseIds,
    toggleExpandRelease,
    filteredReleases,
    totalPersonalSongs,
    handlePlayPersonalTrack,
    handleQueuePersonalRelease,
    deletingItemId,
    setDeletingItemId,
    deleteConfirm,
    setDeleteConfirm,
    quota,
    quotaLoading,
    totalSelectedTracks,
    isOverQuota,
    importReleases,
    setImportReleases,
    isParsing,
    setIsParsing,
    parsingProgress,
    setParsingProgress,
    isUploading,
    setIsUploading,
    uploadProgress,
    setUploadProgress,
    uploadStatusText,
    setUploadStatusText,
    errorMessage,
    setErrorMessage,
    successMessage,
    setSuccessMessage,
    duplicateNotice,
    setDuplicateNotice,
    showDuplicateDetails,
    setShowDuplicateDetails,
    isCreatingContainer,
    setIsCreatingContainer,
    newContainerForm,
    setNewContainerForm,
    movingTrackInfo,
    setMovingTrackInfo,
    handleFilesSelected,
    fileInputRef,
    folderInputRef,
    handleCreateStagedContainer,
    handleDetachTrackAsSingle,
    handleMoveTrackToStagedRelease,
    handleAttachTrackToExistingLibraryAlbum,
    handleRemoveTrackFromStagedRelease,
    handleStartImport,
    toPlayerTrack,
    handleTabChange,
    navigate,
    user,
    lockerIncludeInHome,
    isUpdatingHomeSetting,
    handleToggleLockerInHome,
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
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors ${
              activeTab === 'import'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
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
            className={`inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border px-3 py-1.5 font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors ${
              activeTab === 'collection'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
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
            }}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border px-3 py-1.5 font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors ${
              activeTab === 'artists'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            }`}
          >
            Artists ({personalArtists.length})
          </button>

          <button
            type="button"
            onClick={() => {
              handleTabChange('trash')
            }}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors ${
              activeTab === 'trash'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
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


      <VaultManageContext.Provider value={vaultManageContext}>
        {/* ==================== TAB 1: IMPORT MUSIC ==================== */}
        {activeTab === 'import' && <ImportDesk />}

        {/* ==================== TAB 2: MY COLLECTION (RELEASES) ==================== */}
        {activeTab === 'collection' && <CollectionDesk />}

        {/* ==================== TAB 3: ARTISTS ROSTER ==================== */}
        {activeTab === 'artists' && <ArtistsDesk />}

        {/* ==================== TAB 4: TRASH / RECYCLE BIN ==================== */}
        {activeTab === 'trash' && <TrashDesk />}
      </VaultManageContext.Provider>
    </div>
  )
}
