import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { useState, useEffect, useRef, useMemo, useId } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { playlistsApi } from '../lib/playlists.api'
import { catalogApi } from '../lib/catalog.api'
import type { PlaylistDetail, PlaylistTrack } from '../types/playlist'
import type { Song } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { useAuthStore } from '../stores/auth.store'
import { usePlaylistsStore } from '../stores/playlists.store'
import { useLibraryStore } from '../stores/library.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { PlaylistCover } from '../components/PlaylistCover'
import {
  CollectionActionBar,
  CollectionHeader,
} from '../components/collection'
import { CommentSection } from '../components/comments/CommentSection'
import { PlaylistTrackReorderList } from '../components/playlists/PlaylistTrackReorderList'
import {
  PlaylistSettingsForm,
  type PlaylistSettingsValues,
} from '../components/playlists/PlaylistSettingsForm'
import { PlaylistActionMenu } from '../components/common/PlaylistActionMenu'
import { ImageCropModal } from '../components/common/ImageCropModal'
import {
  Badge,
  Button,
  Eyebrow,
  IconButton,
  Input,
  Sheet,
} from '../components/ui'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Heart, Pencil, Plus } from 'lucide-react'

interface PlaylistSearchParams {
  shareToken?: string
  collabToken?: string
}

export const Route = createFileRoute('/playlists/$id')({
  component: PlaylistDetailComponent,
  validateSearch: (search: Record<string, unknown>): PlaylistSearchParams => {
    return {
      shareToken:
        typeof search.shareToken === 'string' ? search.shareToken : undefined,
      collabToken:
        typeof search.collabToken === 'string' ? search.collabToken : undefined,
    }
  },
})

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function PlaylistDetailComponent() {
  const { id } = Route.useParams()
  const { shareToken, collabToken } = useSearch({ from: '/playlists/$id' })
  const navigate = useNavigate()

  const { isAuthenticated, user } = useAuthStore()
  const { isPlaylistSaved, toggleSavePlaylist, hydratePlaylists } =
    usePlaylistsStore()
  const { currentTrack, playbackStatus, playTrack, togglePlay, contextUri } =
    usePlayerStore()

  const isMobile = useMediaQuery('(max-width: 767px)')
  const settingsFormId = useId()

  // Interaction feedback states
  const [isCloning, setIsCloning] = useState(false)
  const [isJoiningCollab, setIsJoiningCollab] = useState(false)
  const [collabJoinSuccess, setCollabJoinSuccess] = useState<string | null>(
    null,
  )

  // Single Scrollable Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  // Image Cropping & Uploading State
  const [cropImageFile, setCropImageFile] = useState<File | null>(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false)
  const artworkFileInputRef = useRef<HTMLInputElement | null>(null)

  // Add tracks modal
  const [isAddTracksModalOpen, setIsAddTracksModalOpen] = useState(false)

  // In-app alert / confirm modal replacements
  const [toastNotice, setToastNotice] = useState<{
    message: string
    type: 'info' | 'error' | 'success'
  } | null>(null)
  const showToast = (
    message: string,
    type: 'info' | 'error' | 'success' = 'info',
  ) => {
    setToastNotice({ message, type })
    setTimeout(() => setToastNotice(null), 3200)
  }

  const [confirmModal, setConfirmModal] = useState<{
    title: string
    description: string
    confirmLabel?: string
    isDestructive?: boolean
    onConfirm: () => void
  } | null>(null)

  // Edit settings form state
  const [editForm, setEditForm] = useState<PlaylistSettingsValues>({
    title: '',
    description: '',
    coverUrl: null,
    visibility: 'PUBLIC',
    allowDuplicates: false,
    allowComments: true,
  })
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  const updateEditForm = (patch: Partial<PlaylistSettingsValues>) => {
    setEditForm((previous) => ({ ...previous, ...patch }))
  }

  // Add tracks search state
  const [songSearchQuery, setSongSearchQuery] = useState('')
  const [searchSongResults, setSearchSongResults] = useState<Song[]>([])
  const [isSearchingSongs, setIsSearchingSongs] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([])
  const [isAddingTracks, setIsAddingTracks] = useState(false)
  const [addTrackError, setAddTrackError] = useState<string | null>(null)

  // Collaboration management
  const [isUpdatingCollab, setIsUpdatingCollab] = useState(false)

  useEffect(() => {
    if (id === 'liked') {
      navigate({ to: '/liked', replace: true })
    }
  }, [id, navigate])

  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['playlist', id, shareToken, collabToken, user?.id],
    [id, shareToken, collabToken, user?.id],
  )

  const {
    data: playlist,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey,
    queryFn: () => playlistsApi.getPlaylistById(id, shareToken, collabToken),
    enabled: id !== 'liked',
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (!playlist) return
    // Don't overwrite in-progress edits when a refetch (e.g. after an artwork
    // upload) changes the cached playlist while the sheet is open.
    if (!isSettingsModalOpen) {
      setEditForm({
        title: playlist.title,
        description: playlist.description || '',
        coverUrl: playlist.coverImageUrl || null,
        visibility: playlist.visibility,
        allowDuplicates: playlist.allowDuplicates,
        allowComments: playlist.allowComments ?? true,
      })
    }
    hydratePlaylists([playlist])
  }, [playlist, hydratePlaylists, isSettingsModalOpen])

  const toPlayerTrack = (track: PlaylistTrack): PlayerTrack => {
    const song = track.song || (track as any)
    return {
      id: track.songId || song.id || track.id,
      title: song.title || track.title || 'Untitled',
      artistId: song.artistId || track.artistId || '',
      artistName:
        song.artistStageName || track.artistStageName || 'Unknown Artist',
      artistSlug: song.artistSlug || track.artistSlug,
      albumId: song.albumId || track.albumId || undefined,
      albumTitle: song.albumTitle || track.albumTitle || undefined,
      albumSlug: song.albumSlug || track.albumSlug || undefined,
      coverImageUrl:
        song.coverImageUrl ||
        track.coverImageUrl ||
        song.albumCoverUrl ||
        track.albumCoverUrl ||
        playlist?.coverImageUrl,
      durationSeconds: song.durationSeconds ?? track.durationSeconds ?? 0,
      audioUrl: song.audioUrl || track.audioUrl || undefined,
      hlsManifestUrl: song.hlsManifestUrl || track.hlsManifestUrl || undefined,
      rawAudioKey: song.rawAudioKey || (track as any).rawAudioKey || undefined,
      isExplicit: song.isExplicit ?? track.isExplicit ?? false,
      scope: song.scope || (track as any).scope || 'GLOBAL',
      credits: song.credits || (track as any).credits,
    }
  }

  const handlePlayTrack = (track: PlaylistTrack, index?: number) => {
    const song = track.song || track
    if (song.isStreamable === false) {
      showToast('This cut is scheduled and locked until release.', 'info')
      return
    }

    const songId = track.songId || song.id || track.id
    if (currentTrack?.id === songId) {
      togglePlay()
      return
    }

    if (!playlist) return
    const validTracks = (playlist.tracks || []).filter(
      (t) => (t.song || t).isStreamable !== false,
    )
    const contextTracks = validTracks.map(toPlayerTrack)
    const targetTrack = toPlayerTrack(track)
    const targetIdx = contextTracks.findIndex((t) => t.id === targetTrack.id)

    playTrack(
      targetTrack,
      contextTracks,
      targetIdx >= 0 ? targetIdx : (index ?? 0),
      `playlist:${playlist.id}`,
      playlist.title,
    )
  }

  const handlePlayPlaylistFromStart = () => {
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return
    const firstPlayableIdx = playlist.tracks.findIndex(
      (t) => (t.song || t).isStreamable !== false,
    )
    if (firstPlayableIdx >= 0) {
      handlePlayTrack(playlist.tracks[firstPlayableIdx], firstPlayableIdx)
    } else {
      showToast('No streamable tracks found in this playlist.', 'info')
    }
  }

  // 0ms Save toggle
  const handleToggleSave = async () => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Playlist Library',
        subtitle: 'Playlists',
        title: 'Save this playlist.',
        description:
          'Sign in or create an account to save playlists to your library and keep them synced across devices.',
      })
      return
    }
    if (!playlist) return

    try {
      const res = await toggleSavePlaylist(playlist.id)
      queryClient.setQueryData<PlaylistDetail>(queryKey, (prev) =>
        prev
          ? { ...prev, savesCount: res.savesCount, isSaved: res.saved }
          : prev,
      )
    } catch (err) {
      console.error('Failed to toggle playlist save:', err)
    }
  }

  // Clone playlist
  const handleClonePlaylist = async () => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Playlist Curation',
        subtitle: 'Playlists',
        title: 'Clone this playlist.',
        description:
          'Sign in or create an account to clone this playlist into your own private or public collection.',
      })
      return
    }
    if (!playlist || isCloning) return

    setIsCloning(true)
    try {
      const res = await playlistsApi.clonePlaylist(playlist.id, shareToken)
      hydratePlaylists([{ id: res.playlist.id, isSaved: true }])
      showToast(`Cloned into "${res.playlist.title}"`, 'success')
      navigate({ to: '/playlists/$id', params: { id: res.playlist.id } })
    } catch (err: any) {
      showToast(err.message || 'Failed to clone playlist', 'error')
    } finally {
      setIsCloning(false)
    }
  }

  // Join collaboration via token
  const handleJoinCollaboration = async () => {
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Collaborative Music',
        subtitle: 'Collaboration',
        title: 'Join collaboration.',
        description:
          'Sign in or create an account to join this playlist as an active collaborator and add tracks.',
      })
      return
    }
    if (!collabToken || isJoiningCollab) return

    setIsJoiningCollab(true)
    try {
      const res = await playlistsApi.joinCollaboration(id, collabToken)
      setCollabJoinSuccess(
        res.message || 'Successfully joined as a collaborator!',
      )
      showToast(
        res.message || 'Successfully joined as a collaborator!',
        'success',
      )
      hydratePlaylists([{ id, isSaved: true }])
      await queryClient.invalidateQueries({ queryKey })
    } catch (err: any) {
      showToast(err.message || 'Failed to join collaboration', 'error')
    } finally {
      setIsJoiningCollab(false)
    }
  }

  // Collaboration toggle (Owner only)
  const handleToggleCollabSetting = async () => {
    if (!playlist || isUpdatingCollab) return
    setIsUpdatingCollab(true)
    try {
      if (playlist.isCollaborative) {
        await playlistsApi.disableCollaboration(playlist.id)
        showToast('Collaboration disabled', 'info')
      } else {
        await playlistsApi.enableCollaboration(playlist.id)
        showToast('Collaboration enabled', 'success')
      }
      await queryClient.invalidateQueries({ queryKey })
    } catch (err: any) {
      showToast(err.message || 'Failed to update collaboration', 'error')
    } finally {
      setIsUpdatingCollab(false)
    }
  }

  // Regenerate invite link
  const handleRegenerateCollabToken = async () => {
    if (!playlist || isUpdatingCollab) return
    setConfirmModal({
      title: 'Regenerate Invite Link?',
      description:
        'Regenerating will invalidate existing invite links. Active collaborators will remain unaffected. Continue?',
      confirmLabel: 'Regenerate',
      isDestructive: false,
      onConfirm: async () => {
        setIsUpdatingCollab(true)
        try {
          await playlistsApi.regenerateCollaborationToken(playlist.id)
          await queryClient.invalidateQueries({ queryKey })
          showToast('Invite link regenerated', 'success')
        } catch (err: any) {
          showToast(err.message || 'Failed to regenerate invite link', 'error')
        } finally {
          setIsUpdatingCollab(false)
        }
      },
    })
  }

  // Kick collaborator
  const handleKickCollaborator = async (collaboratorUserId: string) => {
    if (!playlist) return
    try {
      await playlistsApi.removeCollaborator(playlist.id, collaboratorUserId)
      await queryClient.invalidateQueries({ queryKey })
      showToast('Collaborator removed', 'info')
    } catch (err: any) {
      showToast(err.message || 'Failed to remove collaborator', 'error')
    }
  }

  // Track removal
  const handleRemoveTrack = async (entryId: string) => {
    if (!playlist) return
    try {
      await playlistsApi.removeTrack(playlist.id, entryId)
      queryClient.setQueryData<PlaylistDetail>(queryKey, (prev) =>
        prev
          ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== entryId) }
          : prev,
      )
      showToast('Track removed from playlist', 'info')
    } catch (err: any) {
      showToast(err.message || 'Failed to remove track', 'error')
    }
  }

  // Atomic reorder: drag-and-drop or move track
  const handleReorderTracks = async (fromIndex: number, toIndex: number) => {
    if (!playlist || fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= playlist.tracks.length) return
    if (toIndex < 0 || toIndex >= playlist.tracks.length) return

    const newTracks = [...playlist.tracks]
    const [moved] = newTracks.splice(fromIndex, 1)
    newTracks.splice(toIndex, 0, moved)

    // Optimistic sequential position update
    const reorderedTracks = newTracks.map((t, idx) => ({ ...t, position: idx }))
    queryClient.setQueryData<PlaylistDetail>(queryKey, (prev) =>
      prev ? { ...prev, tracks: reorderedTracks } : prev,
    )

    try {
      const orderedEntryIds = reorderedTracks.map(
        (t) => t.id || (t as any).entryId,
      )
      await playlistsApi.reorderTracks(playlist.id, orderedEntryIds)
    } catch (err: any) {
      showToast(err.message || 'Failed to reorder tracks', 'error')
      await queryClient.invalidateQueries({ queryKey })
    }
  }

  // Search catalog songs to add
  useEffect(() => {
    if (!isAddTracksModalOpen || !songSearchQuery.trim()) {
      setSearchSongResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearchingSongs(true)
      try {
        const res = await catalogApi.searchSongs({
          search: songSearchQuery.trim(),
          limit: 10,
        })
        setSearchSongResults(res.data)
      } catch (err) {
        console.error('Song search failed:', err)
      } finally {
        setIsSearchingSongs(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [songSearchQuery, isAddTracksModalOpen])

  // Add selected tracks
  const handleAddTracksSubmit = async () => {
    if (!playlist || selectedSongIds.length === 0 || isAddingTracks) return
    setIsAddingTracks(true)
    setAddTrackError(null)

    try {
      await playlistsApi.addTracks(playlist.id, selectedSongIds)
      setIsAddTracksModalOpen(false)
      setSelectedSongIds([])
      setSongSearchQuery('')
      await queryClient.invalidateQueries({ queryKey })
      showToast('Track(s) added successfully', 'success')
    } catch (err: any) {
      setAddTrackError(err.message || 'Failed to add tracks')
    } finally {
      setIsAddingTracks(false)
    }
  }

  // File picker handler for custom artwork
  const handleArtworkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCropImageFile(file)
    setIsCropModalOpen(true)
  }

  // Crop completion & Cloudflare R2 upload
  const handleArtworkCropComplete = async (croppedFile: File) => {
    if (!playlist) return
    setIsUploadingArtwork(true)
    try {
      const publicUrl = await playlistsApi.uploadPlaylistCover(
        playlist.id,
        croppedFile,
      )
      await playlistsApi.updatePlaylist(playlist.id, {
        coverImageUrl: publicUrl,
      })
      queryClient.setQueryData<PlaylistDetail>(queryKey, (prev) =>
        prev ? { ...prev, coverImageUrl: publicUrl } : prev,
      )
      updateEditForm({ coverUrl: publicUrl })
      showToast('Playlist artwork updated!', 'success')
      setIsCropModalOpen(false)
      setCropImageFile(null)
    } catch (err: any) {
      showToast(err.message || 'Failed to upload artwork', 'error')
    } finally {
      setIsUploadingArtwork(false)
    }
  }

  // Remove custom artwork & revert to dynamic mosaic
  const handleRemoveArtwork = async () => {
    if (!playlist) return
    try {
      await playlistsApi.updatePlaylist(playlist.id, { coverImageUrl: null })
      queryClient.setQueryData<PlaylistDetail>(queryKey, (prev) =>
        prev ? { ...prev, coverImageUrl: null } : prev,
      )
      updateEditForm({ coverUrl: null })
      showToast('Reverted to dynamic track mosaic', 'info')
    } catch (err: any) {
      showToast(err.message || 'Failed to revert artwork', 'error')
    }
  }

  // Update playlist metadata & settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!playlist) return

    setIsSavingSettings(true)
    try {
      const updated = await playlistsApi.updatePlaylist(playlist.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        coverImageUrl: editForm.coverUrl,
        visibility: editForm.visibility,
        allowDuplicates: editForm.allowDuplicates,
        allowComments: editForm.allowComments,
      })
      queryClient.setQueryData<PlaylistDetail>(queryKey, (prev) =>
        prev ? { ...prev, ...updated } : prev,
      )
      setIsSettingsModalOpen(false)
      showToast('Playlist settings updated', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to update playlist', 'error')
    } finally {
      setIsSavingSettings(false)
    }
  }

  // Delete playlist
  const handleDeletePlaylist = async () => {
    if (!playlist) return
    setIsSettingsModalOpen(false)
    setConfirmModal({
      title: 'Delete Playlist?',
      description:
        'Are you sure you want to delete this playlist? This action cannot be undone.',
      confirmLabel: 'Delete Playlist',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await playlistsApi.deletePlaylist(playlist.id)
          useLibraryStore.getState().removePlaylist(playlist.id)
          useLibraryStore.getState().invalidate()
          queryClient.removeQueries({ queryKey })
          navigate({ to: '/library' })
        } catch (err: any) {
          showToast(err.message || 'Failed to delete playlist', 'error')
        }
      },
    })
  }

  const errorMessage = queryError instanceof Error ? queryError.message : null

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-8">
        <div className="animate-pulse font-eyebrow text-caption uppercase tracking-wider text-muted-foreground">
          Retrieving playlist acoustics &amp; curation...
        </div>
      </div>
    )
  }

  if (errorMessage || !playlist) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <Eyebrow
            as="span"
            tone="brand"
            className="mb-2 block tracking-widest"
          >
            404 Catalog Notice
          </Eyebrow>
          <h1 className="font-serif italic text-3xl text-foreground">
            Playlist Not Found
          </h1>
          <p className="mt-3 font-sans text-caption leading-relaxed text-muted-foreground">
            {errorMessage ||
              'The requested playlist could not be located in the archive.'}
          </p>
          <Link
            to="/playlists"
            className="mt-6 inline-block rounded-control border border-border bg-card px-4 py-2 font-eyebrow text-eyebrow uppercase tracking-wider text-foreground transition-colors hover:bg-background"
          >
            &larr; Return to Playlists
          </Link>
        </div>
      </div>
    )
  }

  const saved = isPlaylistSaved(playlist.id)
  const isOwner = !!playlist.isOwner || (!!user && playlist.ownerId === user.id)
  const isCollaborator =
    !!playlist.isCollaborator ||
    (!!user && (playlist.collaborators ?? []).some((c) => c.userId === user.id))
  const canEdit = isOwner || isCollaborator

  const mosaicCovers =
    playlist.mosaicCovers || (playlist as any).mosaicCoverUrls || []

  const hasTracks = (playlist.tracks ?? []).length > 0
  const playlistContextUri = `playlist:${playlist.id}`
  const isPlaylistActive = contextUri === playlistContextUri
  const isPlaylistPlaying = isPlaylistActive && playbackStatus === 'playing'

  const handleHeroPlay = () => {
    if (isPlaylistActive) {
      togglePlay()
      return
    }
    handlePlayPlaylistFromStart()
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 select-none sm:px-8 sm:pt-10">
      {/* Hidden File Input for Artwork Upload */}
      <input
        ref={artworkFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={handleArtworkFileSelect}
        className="hidden"
      />

      {/* ===================== COLLABORATION INVITE / STATUS BANNER ===================== */}
      {collabToken && !isOwner && isCollaborator && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-surface border border-success/40 bg-success-soft p-4">
            <div>
              <h4 className="font-serif italic text-title text-success flex items-center gap-2">
                <span>✓</span> You are a Collaborator on this playlist
              </h4>
              <p className="font-mono text-eyebrow text-muted-foreground mt-0.5">
                You have already joined as a collaborator. You can add tracks
                and reorder the tracklist.
              </p>
            </div>
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-success/30 bg-success-soft text-success font-semibold rounded-control">
              Active Collaborator
            </span>
          </div>
        </div>
      )}

      {collabToken && !isOwner && !isCollaborator && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-surface border border-primary bg-primary/10 p-4">
            <div>
              <h4 className="font-serif italic text-title text-foreground">
                Collaborator Invitation
              </h4>
              <p className="font-mono text-eyebrow text-muted-foreground mt-0.5">
                You were invited to contribute tracks and curate this playlist
                with the community.
              </p>
            </div>
            <button
              type="button"
              disabled={isJoiningCollab}
              onClick={handleJoinCollaboration}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 bg-primary text-background font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs rounded-control"
            >
              {isJoiningCollab
                ? 'Joining...'
                : '✦ Accept & Join as Collaborator'}
            </button>
          </div>
        </div>
      )}

      {collabJoinSuccess && (
        <div className="mb-4 rounded-control border border-success/40 bg-success-soft p-3 font-mono text-caption text-success">
          ✓ {collabJoinSuccess}
        </div>
      )}

      {/* ===================== COLLECTION HERO HEADER ===================== */}
      <CollectionHeader
        key={playlist.id}
        className="-mx-4 sm:-mx-8"
        stickyClassName="-mx-4 sm:-mx-8"
        title={playlist.title}
        eyebrow={
          <Eyebrow
            as="span"
            tone="brand"
            className="font-semibold tracking-widest"
          >
            Playlist
          </Eyebrow>
        }
        badges={
          <Badge
            tone={
              playlist.visibility === 'PRIVATE'
                ? 'warning'
                : playlist.visibility === 'UNLISTED'
                  ? 'neutral'
                  : 'success'
            }
          >
            {playlist.visibility}
          </Badge>
        }
        cover={
          <PlaylistCover
            coverImageUrl={playlist.coverImageUrl}
            mosaicCovers={mosaicCovers}
            title={playlist.title}
            className="h-full w-full"
          />
        }
        backdropImageUrl={playlist.coverImageUrl || mosaicCovers[0] || null}
        coverAction={
          canEdit ? (
            <button
              type="button"
              onClick={() => artworkFileInputRef.current?.click()}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background/85 text-foreground shadow-raised backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-background active:scale-95 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              title="Change playlist artwork"
              aria-label="Change playlist artwork"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null
        }
        meta={
          <>
            {playlist.ownerId ? (
              <Link
                to="/users/$id"
                params={{ id: playlist.ownerId }}
                className="max-w-full truncate font-sans text-caption text-muted-foreground transition-colors hover:text-foreground"
              >
                Curated by {playlist.ownerDisplayName || 'Curator'}
              </Link>
            ) : (
              <span className="max-w-full truncate font-sans text-caption text-muted-foreground">
                Curated by {playlist.ownerDisplayName || 'Curator'}
              </span>
            )}
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>
                {(playlist.tracks ?? []).length}{' '}
                {(playlist.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
              </span>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>{formatDuration(playlist.totalDurationSeconds ?? 0)}</span>
            </span>
            <span className="inline-flex items-center whitespace-nowrap">
              <span aria-hidden="true" className="mr-2 text-border">
                &bull;
              </span>
              <span>
                {(playlist.savesCount ?? 0).toLocaleString()}{' '}
                {(playlist.savesCount ?? 0) === 1 ? 'save' : 'saves'}
              </span>
            </span>
          </>
        }
        description={playlist.description || undefined}
        stickySubtitle={
          playlist.ownerDisplayName
            ? `Curated by ${playlist.ownerDisplayName}`
            : undefined
        }
        stickyThumbnail={
          <PlaylistCover
            coverImageUrl={playlist.coverImageUrl}
            mosaicCovers={mosaicCovers}
            title={playlist.title}
            className="h-full w-full"
          />
        }
      />

      {/* ===================== COLLECTION CONTROLS ===================== */}
      <CollectionActionBar
        className="pt-3.5 pb-2 md:pt-2 md:pb-5"
        onPlay={hasTracks ? handleHeroPlay : undefined}
        isPlaying={isPlaylistPlaying}
        playLabel={playlist.title}
        menu={
          <PlaylistActionMenu
            playlist={playlist}
            tracks={(playlist.tracks || []).map(toPlayerTrack)}
            isOwner={isOwner}
            onClone={handleClonePlaylist}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            align="right"
            buttonClassName="flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground"
          />
        }
      >
        <IconButton
          size="lg"
          className={
            saved ? 'group text-destructive! hover:text-destructive!' : 'group'
          }
          aria-label={saved ? 'Remove from library' : 'Save to library'}
          title={saved ? 'Remove from library' : 'Save to library'}
          onClick={handleToggleSave}
        >
          <Heart
            className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90 ${
              saved ? 'fill-current' : ''
            }`}
          />
        </IconButton>

        {canEdit ? (
          <IconButton
            size="lg"
            className="group"
            aria-label="Add tracks"
            title="Add tracks"
            onClick={() => setIsAddTracksModalOpen(true)}
          >
            <Plus className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
          </IconButton>
        ) : null}
      </CollectionActionBar>
      {/* ===================== MAIN CONTENT ===================== */}
      <div className="mt-6 space-y-8 sm:mt-10">
        {/* ===================== TRACKLIST SECTION ===================== */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-sans text-heading font-semibold text-foreground">
              Tracklist
            </h2>
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
              {(playlist.tracks ?? []).length}{' '}
              {(playlist.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {(playlist.tracks ?? []).length === 0 ? (
            <div className="overflow-hidden rounded-surface border border-dashed border-border bg-card/40 p-10 text-center sm:p-12">
              <p className="font-serif italic text-title text-foreground">
                This playlist is currently empty.
              </p>
              {canEdit ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setIsAddTracksModalOpen(true)}
                  >
                    Add songs
                  </Button>
                </div>
              ) : (
                <p className="mt-1 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                  Check back soon as the curator adds more cuts.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-surface">
              {/* Desktop Tracklist Column Header */}
              <div className="hidden items-center justify-between gap-4 border-b border-border/60 px-2 py-2.5 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground sm:flex sm:px-3">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="w-6 text-center">#</span>
                  <span>Title &amp; Artist</span>
                </div>
                <div className="hidden w-32 text-left md:block">Added By</div>
                <div className="flex min-w-25 shrink-0 items-center justify-end gap-3 pr-2 sm:gap-4">
                  <span>Duration</span>
                </div>
              </div>

              <PlaylistTrackReorderList
                tracks={playlist.tracks ?? []}
                canEdit={canEdit}
                toPlayerTrack={toPlayerTrack}
                onReorder={handleReorderTracks}
                onPlayTrack={handlePlayTrack}
                onRemoveTrack={handleRemoveTrack}
              />
            </div>
          )}
        </div>

        {/* ===================== COMMENTS SUBSYSTEM ===================== */}
        <div className="pt-4">
          <CommentSection
            targetType="playlist"
            targetId={playlist.id}
            allowComments={playlist.allowComments ?? true}
            isCreatorOrOwner={isOwner}
          />
        </div>
      </div>

      {/* ===================== PLAYLIST SETTINGS SHEET ===================== */}
      <Sheet
        open={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        placement={isMobile ? 'bottom' : 'center'}
        size="xl"
        title="Settings & Curation"
        description="Manage artwork, details, access, and collaboration."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="md"
              variant="outline"
              onClick={() => setIsSettingsModalOpen(false)}
              className="min-h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={settingsFormId}
              size="md"
              variant="primary"
              disabled={isSavingSettings}
              className="min-h-11"
            >
              {isSavingSettings ? 'Saving...' : 'Save settings'}
            </Button>
          </div>
        }
      >
        <PlaylistSettingsForm
          formId={settingsFormId}
          values={editForm}
          onChange={updateEditForm}
          onSubmit={handleSaveSettings}
          playlist={playlist}
          mosaicCovers={mosaicCovers}
          isOwner={isOwner}
          isUploadingArtwork={isUploadingArtwork}
          isUpdatingCollab={isUpdatingCollab}
          onUploadArtwork={() => artworkFileInputRef.current?.click()}
          onRemoveArtwork={handleRemoveArtwork}
          onToggleCollaboration={handleToggleCollabSetting}
          onRegenerateToken={handleRegenerateCollabToken}
          onRemoveCollaborator={handleKickCollaborator}
          onDelete={handleDeletePlaylist}
          onNotify={showToast}
        />
      </Sheet>

      {/* ===================== ARTWORK CROP MODAL ===================== */}

      <ImageCropModal
        isOpen={isCropModalOpen}
        onClose={() => {
          setIsCropModalOpen(false)
          setCropImageFile(null)
        }}
        imageFile={cropImageFile}
        title="Crop Playlist Artwork"
        subtitle="1:1 Square High-Resolution Artwork"
        aspectRatio={1}
        isCircularMask={false}
        targetMaxWidth={1200}
        targetMaxHeight={1200}
        isSubmitting={isUploadingArtwork}
        onCropComplete={handleArtworkCropComplete}
      />

      {/* ===================== ADD TRACKS SHEET ===================== */}
      <Sheet
        open={isAddTracksModalOpen}
        onClose={() => setIsAddTracksModalOpen(false)}
        placement={isMobile ? 'bottom' : 'center'}
        size="lg"
        title="Add Tracks to Playlist"
        description="Search the catalog and select the cuts you want to add."
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
              {selectedSongIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="md"
                variant="outline"
                onClick={() => setIsAddTracksModalOpen(false)}
                className="min-h-11"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="md"
                variant="primary"
                disabled={selectedSongIds.length === 0 || isAddingTracks}
                onClick={handleAddTracksSubmit}
                className="min-h-11"
              >
                {isAddingTracks ? 'Adding...' : 'Add to tracklist'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 p-4 sm:p-5">
          {addTrackError ? (
            <div className="rounded-control border border-destructive/40 bg-destructive-soft p-3 font-mono text-eyebrow text-destructive">
              {addTrackError}
            </div>
          ) : null}

          <Input
            type="text"
            value={songSearchQuery}
            onChange={(event) => setSongSearchQuery(event.target.value)}
            placeholder="Search catalog by song title or artist..."
            autoFocus={!isMobile}
          />

          <div className="min-h-[160px] divide-y divide-border/60 overflow-y-auto rounded-control border border-border bg-background">
            {isSearchingSongs ? (
              <div className="p-8 text-center font-mono text-caption text-muted-foreground">
                Searching cuts...
              </div>
            ) : searchSongResults.length === 0 ? (
              <div className="p-8 text-center font-mono text-caption text-muted-foreground">
                {songSearchQuery.trim()
                  ? 'No songs match your query'
                  : 'Type to search available master tracks'}
              </div>
            ) : (
              searchSongResults.map((song) => {
                const isSelected = selectedSongIds.includes(song.id)
                return (
                  <label
                    key={song.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/60 ${
                      isSelected ? 'bg-primary/10' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-sans text-body font-semibold text-foreground">
                        {song.title}
                      </span>
                      <span className="block font-mono text-eyebrow text-muted-foreground">
                        {formatDuration(song.durationSeconds)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedSongIds((previous) =>
                          isSelected
                            ? previous.filter((songId) => songId !== song.id)
                            : [...previous, song.id],
                        )
                      }}
                      className="shrink-0 accent-primary"
                    />
                  </label>
                )
              })
            )}
          </div>
        </div>
      </Sheet>

      {/* Confirmation Modal */}

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm border border-border bg-card p-6 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-serif italic text-heading text-foreground font-semibold mb-2">
              {confirmModal.title}
            </h3>
            <p className="font-sans text-caption text-muted-foreground leading-relaxed mb-6">
              {confirmModal.description}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="font-eyebrow text-caption uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm()
                  setConfirmModal(null)
                }}
                className={`font-eyebrow text-caption uppercase tracking-wider py-2 px-5 rounded-xl font-semibold cursor-pointer ${
                  confirmModal.isDestructive
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/20'
                    : 'bg-foreground text-background hover:opacity-90'
                }`}
              >
                {confirmModal.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastNotice && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] left-1/2 -translate-x-1/2 z-50 bg-foreground text-background font-mono text-caption px-5 py-2.5 rounded-full shadow-lg pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {toastNotice.message}
        </div>
      )}
    </div>
  )
}
