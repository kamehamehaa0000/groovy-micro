import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { useState, useEffect, useRef, useMemo } from 'react'
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
import { CommentSection } from '../components/comments/CommentSection'
import { PlaylistTrackReorderList } from '../components/playlists/PlaylistTrackReorderList'
import { PlaylistActionMenu } from '../components/common/PlaylistActionMenu'
import { ImageCropModal } from '../components/common/ImageCropModal'
import {
  PlayIconSVG,
  HeartIconSVG,
  PlusIconSVG,
  EditIconSVG,
  SvgArtworkSpiral,
  TrashIconSVG,
  UploadCloudSVG,
} from '../components/icons'

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
  const { currentTrack, playTrack, togglePlay } = usePlayerStore()

  // Interaction feedback states
  const [copiedLink, setCopiedLink] = useState(false)
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
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCoverUrl, setEditCoverUrl] = useState<string | null>(null)
  const [editVisibility, setEditVisibility] = useState<
    'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  >('PUBLIC')
  const [editAllowDuplicates, setEditAllowDuplicates] = useState(false)
  const [editAllowComments, setEditAllowComments] = useState(true)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

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
    setEditTitle(playlist.title)
    setEditDescription(playlist.description || '')
    setEditCoverUrl(playlist.coverImageUrl || null)
    setEditVisibility(playlist.visibility)
    setEditAllowDuplicates(playlist.allowDuplicates)
    setEditAllowComments(playlist.allowComments ?? true)
    hydratePlaylists([playlist])
  }, [playlist, hydratePlaylists])

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

  // Copy share link
  const handleCopyShareLink = async () => {
    if (!playlist) return
    let shareUrl = `${window.location.origin}/playlists/${playlist.id}`
    if (playlist.visibility === 'UNLISTED' && playlist.shareToken) {
      shareUrl = `${window.location.origin}/playlists/${playlist.id}?shareToken=${playlist.shareToken}`
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: playlist.title,
          text: `Check out ${playlist.title} on Groovy`,
          url: shareUrl,
        })
        return
      } catch {
        // Fallback to clipboard
      }
    }

    await navigator.clipboard.writeText(shareUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
    showToast('Share link copied to clipboard!', 'success')
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
      setEditCoverUrl(publicUrl)
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
      setEditCoverUrl(null)
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
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        coverImageUrl: editCoverUrl,
        visibility: editVisibility,
        allowDuplicates: editAllowDuplicates,
        allowComments: editAllowComments,
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
      <div className="py-32 text-center font-mono text-xs uppercase tracking-wider text-ink-soft animate-pulse">
        Retrieving playlist acoustics &amp; curation...
      </div>
    )
  }

  if (errorMessage || !playlist) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-primary block mb-2">
          404 Catalog Notice
        </span>
        <h1 className="font-serif italic text-3xl text-ink">
          Playlist Not Found
        </h1>
        <p className="font-sans text-xs text-ink-soft mt-3 leading-relaxed">
          {errorMessage ||
            'The requested playlist could not be located in the archive.'}
        </p>
        <Link
          to="/playlists"
          className="inline-block mt-6 font-mono text-[11px] uppercase tracking-wider py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors rounded"
        >
          &larr; Return to Playlists
        </Link>
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

  return (
    <div className="w-full pb-20 select-none">
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
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4">
          <div className="p-4 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-4 flex-wrap rounded-lg shadow-xs">
            <div>
              <h4 className="font-serif italic text-base text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <span>✓</span> You are a Collaborator on this playlist
              </h4>
              <p className="font-mono text-[11px] text-ink-soft mt-0.5">
                You have already joined as a collaborator. You can add tracks
                and reorder the tracklist.
              </p>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-wider py-1.5 px-3 border border-emerald-500/30 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold rounded">
              Active Collaborator
            </span>
          </div>
        </div>
      )}

      {collabToken && !isOwner && !isCollaborator && (
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4">
          <div className="p-4 border border-primary bg-primary/10 flex items-center justify-between gap-4 flex-wrap rounded-lg shadow-xs">
            <div>
              <h4 className="font-serif italic text-base text-ink">
                Collaborator Invitation
              </h4>
              <p className="font-mono text-[11px] text-ink-soft mt-0.5">
                You were invited to contribute tracks and curate this playlist
                with the community.
              </p>
            </div>
            <button
              type="button"
              disabled={isJoiningCollab}
              onClick={handleJoinCollaboration}
              className="font-mono text-[11px] uppercase tracking-wider py-2 px-5 bg-primary text-canvas font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs rounded"
            >
              {isJoiningCollab
                ? 'Joining...'
                : '✦ Accept & Join as Collaborator'}
            </button>
          </div>
        </div>
      )}

      {collabJoinSuccess && (
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4">
          <div className="p-3 border border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400 font-mono text-xs rounded">
            ✓ {collabJoinSuccess}
          </div>
        </div>
      )}

      {/* ===================== PLAYLIST HERO HEADER ===================== */}
      <section className="relative overflow-hidden border-b border-line bg-canvas">
        {/* Ambient / Atmospheric Banner */}
        <div className="relative h-44 overflow-hidden bg-canvas-deep">
          {playlist.coverImageUrl ? (
            <img
              src={playlist.coverImageUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover blur-3xl scale-125 opacity-25 dark:opacity-20 select-none pointer-events-none"
            />
          ) : mosaicCovers.length > 0 ? (
            <img
              src={mosaicCovers[0]}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover blur-3xl scale-125 opacity-25 dark:opacity-20 select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full relative flex items-center justify-center">
              <SvgArtworkSpiral />
              <span className="font-serif italic text-4xl sm:text-6xl md:text-7xl text-ink-soft/10 select-none">
                {playlist.title}
              </span>
            </div>
          )}

          {/* Editorial gradient overlay */}
          <div className="absolute inset-0 bg-linear-to-t from-canvas via-canvas/40 to-transparent" />

          {/* Top-Right Floating Share Button */}
          <div className="absolute top-4 left-4 right-4 flex justify-end pointer-events-none">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="pointer-events-auto inline-flex items-center justify-center min-h-9 px-3.5 border border-line bg-canvas/80 backdrop-blur-xs font-mono text-[11px] uppercase tracking-wider text-ink hover:bg-canvas transition-colors shadow-2xs cursor-pointer rounded"
            >
              {copiedLink ? '✓ Copied' : 'Share'}
            </button>
          </div>
        </div>

        {/* Identity & Metadata Container */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="relative -mt-20 sm:-mt-24 md:-mt-28 pb-6 sm:pb-8 flex flex-col md:flex-row md:items-end gap-6 sm:gap-8">
            {/* Cover Art Container with Pencil Overlay */}
            <div className="w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 rounded-md bg-canvas-deep border border-line shadow-md overflow-hidden shrink-0 relative group mx-auto md:mx-0">
              <PlaylistCover
                coverImageUrl={playlist.coverImageUrl}
                mosaicCovers={mosaicCovers}
                title={playlist.title}
                className="w-full h-full"
              />

              {/* Pencil Edit Icon Button on Hero Artwork */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => artworkFileInputRef.current?.click()}
                  className="absolute bottom-2.5 right-2.5 p-2 rounded-full bg-black/75 hover:bg-black text-white backdrop-blur-xs transition-all opacity-85 group-hover:opacity-100 shadow-md cursor-pointer hover:scale-105 active:scale-95 flex items-center justify-center"
                  title="Change playlist artwork"
                  aria-label="Change playlist artwork"
                >
                  <EditIconSVG className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Playlist Identity & Details */}
            <div className="min-w-0 flex-1 flex flex-col justify-end text-center md:text-left">
              {/* Badges / Eyebrow */}

              {/* Title */}
              <h1 className="font-serif italic text-3xl sm:text-5xl md:text-6xl leading-[0.95] tracking-tight text-ink wrap-break-words">
                {playlist.title}
              </h1>

              {/* Curator Attribution & Aggregate Stats */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2.5 gap-y-1.5 mt-3 font-mono text-[11px] text-ink-soft">
                {playlist.ownerId ? (
                  <Link
                    to="/users/$id"
                    params={{ id: playlist.ownerId }}
                    className="font-serif italic text-base sm:text-lg text-ink hover:text-primary transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>
                      Curated by {playlist.ownerDisplayName || 'Curator'}
                    </span>
                  </Link>
                ) : (
                  <span className="font-serif italic text-base sm:text-lg text-ink">
                    Curated by {playlist.ownerDisplayName || 'Curator'}
                  </span>
                )}
                <span className="font-mono text-2xs uppercase tracking-wider px-2 py-0.5 border border-line text-ink-soft rounded">
                  {playlist.visibility}
                </span>

                <span className="text-ink-soft/50">&bull;</span>

                <span>
                  {(playlist.tracks ?? []).length}{' '}
                  {(playlist.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
                </span>

                <span className="text-ink-soft/50">&bull;</span>

                <span>
                  {formatDuration(playlist.totalDurationSeconds ?? 0)}
                </span>

                <span className="text-ink-soft/50">&bull;</span>

                <span>
                  {(playlist.savesCount ?? 0).toLocaleString()}{' '}
                  {(playlist.savesCount ?? 0) === 1 ? 'save' : 'saves'}
                </span>
              </div>

              {playlist.description && (
                <p className="font-sans text-xs text-ink-soft leading-relaxed mt-2.5 max-w-2xl mx-auto md:mx-0">
                  {playlist.description}
                </p>
              )}

              {/* Actions Bar */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-center md:justify-start  pt-4">
                {/* 1. Play Button */}
                {(playlist.tracks ?? []).length > 0 && (
                  <button
                    type="button"
                    onClick={handlePlayPlaylistFromStart}
                    className="rounded inline-flex items-center justify-center gap-2 min-h-10 px-5 sm:px-6 bg-primary text-canvas font-mono text-[11px] uppercase tracking-wider font-semibold hover:opacity-90 transition-opacity shadow-2xs cursor-pointer"
                  >
                    <PlayIconSVG className="w-3.5 h-3.5" />
                    <span>Play</span>
                  </button>
                )}

                {/* 2. Save / Like Button */}
                <button
                  type="button"
                  onClick={handleToggleSave}
                  className={`rounded inline-flex items-center justify-center gap-2 min-h-10 px-4 sm:px-5 font-mono text-[11px] uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                    saved ? 'text-red-600 hover:border-red-400' : ''
                  }`}
                >
                  <HeartIconSVG
                    filled={saved}
                    className={`w-5 h-5 ${saved ? 'text-red-500' : 'text-ink-soft'}`}
                  />
                </button>

                {/* 3. Add Songs Trigger (if canEdit) */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsAddTracksModalOpen(true)}
                    className="rounded inline-flex items-center justify-center  min-h-10 px-4 sm:px-5 font-mono text-[11px] uppercase tracking-wider  text-ink hover:border-ink transition-colors cursor-pointer shadow-2xs"
                  >
                    <PlusIconSVG className="w-5 h-5 text-ink-soft" />
                  </button>
                )}
                {/* 5. Action Menu (3-dot menu with Clone to Library, Queueing, Sharing, etc.) */}
                <PlaylistActionMenu
                  playlist={playlist}
                  tracks={(playlist.tracks || []).map(toPlayerTrack)}
                  isOwner={isOwner}
                  canEdit={canEdit}
                  onClone={handleClonePlaylist}
                  onOpenSettings={() => setIsSettingsModalOpen(true)}
                  onDeleteRequest={handleDeletePlaylist}
                  align="right"
                  buttonClassName="rounded rotate-90 inline-flex items-center justify-center min-h-5 min-w-5 px-3  hover:bg-canvas text-ink transition-colors shadow-2xs cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="max-w-6xl mx-auto px-1 sm:px-8 mt-8 sm:mt-10 space-y-8">
        {/* ===================== TRACKLIST SECTION ===================== */}
        <div className="space-y-3 px-1">
          <div className="flex justify-between items-baseline  pb-2">
            <div className="flex items-center gap-2">
              <h2 className="font-serif italic text-xl sm:text-2xl text-ink font-semibold">
                Master Tracklist
              </h2>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
              {(playlist.tracks ?? []).length}{' '}
              {(playlist.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {(playlist.tracks ?? []).length === 0 ? (
            <div className="p-12 rounded-md border border-dashed border-line bg-panel/30 text-center overflow-hidden">
              <p className="font-serif italic text-base text-ink">
                This playlist is currently empty.
              </p>
              {canEdit ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setIsAddTracksModalOpen(true)}
                    className="font-mono text-[11px] uppercase tracking-wider py-2 px-4 bg-ink text-canvas rounded hover:opacity-90 transition-opacity cursor-pointer font-medium"
                  >
                    + Add Songs
                  </button>
                </div>
              ) : (
                <p className="font-mono text-[11px] uppercase tracking-widest text-ink-soft mt-1">
                  Check back soon as the curator adds more cuts.
                </p>
              )}
            </div>
          ) : (
            <div className=" rounded-md overflow-hidden  shadow-2xs">
              {/* Desktop Tracklist Column Header */}
              <div className="hidden sm:flex items-center justify-between gap-4 px-5 sm:px-6 py-2.5 border-b border-line/60 bg-canvas/40 font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="w-6 text-center">#</span>
                  <span>Title &amp; Artist</span>
                </div>
                <div className="w-32 text-left hidden md:block">Added By</div>
                <div className="flex items-center justify-end gap-3 sm:gap-4 shrink-0 min-w-25 pr-2">
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

      {/* ===================== SINGLE SCROLLABLE SETTINGS MODAL ===================== */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl border border-line bg-panel rounded-2xl shadow-2xl relative flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Sticky Modal Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-line bg-panel shrink-0">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-widest text-primary block mb-1 font-semibold">
                  Playlist Settings
                </span>
                <h3 className="font-serif italic text-2xl sm:text-3xl text-ink font-semibold">
                  Settings &amp; Curation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1.5 text-ink-soft hover:text-ink rounded-full hover:bg-canvas-soft transition-colors cursor-pointer text-base"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">
              {/* SECTION 1: ARTWORK STUDIO */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-[11px] uppercase tracking-widest text-ink-soft font-semibold">
                    Playlist Artwork
                  </label>
                  <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-line bg-canvas text-ink-soft">
                    {editCoverUrl ? 'Custom Cover' : 'Dynamic 2x2 Mosaic'}
                  </span>
                </div>

                <div className="p-4 border border-line rounded-xl bg-canvas flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {/* Artwork Preview */}
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-canvas-deep border border-line overflow-hidden shrink-0 relative shadow-sm">
                    <PlaylistCover
                      coverImageUrl={editCoverUrl}
                      mosaicCovers={mosaicCovers}
                      title={editTitle || playlist.title}
                      className="w-full h-full"
                    />
                    {isUploadingArtwork && (
                      <div className="absolute inset-0 bg-canvas/80 backdrop-blur-xs flex items-center justify-center font-mono text-[11px] text-ink animate-pulse text-center p-1">
                        Uploading...
                      </div>
                    )}
                  </div>

                  {/* Actions & Specs */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={isUploadingArtwork}
                        onClick={() => artworkFileInputRef.current?.click()}
                        className="font-mono text-[11px] uppercase tracking-wider py-2 px-3.5 bg-ink text-canvas rounded-xl hover:opacity-90 transition-opacity cursor-pointer font-medium flex items-center gap-2 shadow-2xs"
                      >
                        <UploadCloudSVG className="w-3.5 h-3.5" />
                        <span>
                          {editCoverUrl
                            ? 'Change Artwork'
                            : 'Upload Custom Artwork'}
                        </span>
                      </button>

                      {editCoverUrl && (
                        <button
                          type="button"
                          disabled={isUploadingArtwork}
                          onClick={handleRemoveArtwork}
                          className="font-mono text-[11px] uppercase tracking-wider py-2 px-3 border border-line bg-panel hover:bg-canvas-soft text-ink-soft hover:text-ink rounded-xl transition-colors cursor-pointer"
                        >
                          Revert to Mosaic
                        </button>
                      )}
                    </div>
                    <p className="font-sans text-xs text-ink-soft leading-relaxed">
                      Recommended: 1000 × 1000px square image (JPG, PNG, WEBP).
                      An interactive 1:1 cropper will guide you before upload.
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: NAME & DESCRIPTION */}
              <div className="space-y-4 pt-1">
                <label className="font-mono text-[11px] uppercase tracking-widest text-ink-soft font-semibold block">
                  Curation Details
                </label>

                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-widest text-ink-soft mb-1.5">
                    Playlist Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. Late Night Synthwave"
                    className="w-full font-sans text-sm p-3 border border-line bg-canvas rounded-xl text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink transition-colors font-medium"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-widest text-ink-soft mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Add an optional description or notes about this curation..."
                    className="w-full font-sans text-xs p-3 border border-line bg-canvas rounded-xl text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink transition-colors resize-none leading-relaxed"
                  />
                </div>
              </div>

              {/* SECTION 3: ACCESS & RULES */}
              <div className="space-y-4 pt-1">
                <label className="font-mono text-[11px] uppercase tracking-widest text-ink-soft font-semibold block">
                  Access &amp; Rules
                </label>

                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-widest text-ink-soft mb-1.5">
                    Visibility Mode
                  </label>
                  <select
                    value={editVisibility}
                    onChange={(e: any) => setEditVisibility(e.target.value)}
                    className="w-full font-mono text-xs p-3 border border-line bg-canvas rounded-xl text-ink cursor-pointer focus:outline-none focus:border-ink"
                  >
                    <option value="PUBLIC">
                      Public &bull; Discoverable by all listeners on /playlists
                    </option>
                    <option value="UNLISTED">
                      Unlisted &bull; Accessible only via direct share link
                    </option>
                    <option value="PRIVATE">
                      Private &bull; Accessible only to you and collaborators
                    </option>
                  </select>
                </div>

                <div className="space-y-2.5">
                  <label className="flex items-start gap-3 p-3.5 border border-line bg-canvas rounded-xl cursor-pointer hover:border-ink/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={editAllowDuplicates}
                      onChange={(e) => setEditAllowDuplicates(e.target.checked)}
                      className="accent-primary mt-0.5"
                    />
                    <div>
                      <span className="font-mono text-xs text-ink font-semibold block">
                        Allow Duplicate Songs
                      </span>
                      <span className="font-sans text-xs text-ink-soft mt-0.5 block">
                        Permit adding the same cut multiple times to this
                        playlist.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3.5 border border-line bg-canvas rounded-xl cursor-pointer hover:border-ink/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={editAllowComments}
                      onChange={(e) => setEditAllowComments(e.target.checked)}
                      className="accent-primary mt-0.5"
                    />
                    <div>
                      <span className="font-mono text-xs text-ink font-semibold block">
                        Allow Discussion &amp; Comments
                      </span>
                      <span className="font-sans text-xs text-ink-soft mt-0.5 block">
                        Enable community listeners and collaborators to leave
                        comments.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* SECTION 4: COLLABORATION */}
              <div className="space-y-4 pt-1">
                <label className="font-mono text-[11px] uppercase tracking-widest text-ink-soft font-semibold block">
                  Collaboration
                </label>

                {/* Toggle Collaboration (Owner only) */}
                {isOwner && (
                  <div className="flex items-center justify-between p-4 border border-line bg-canvas rounded-xl gap-4">
                    <div>
                      <h4 className="font-serif italic text-base text-ink font-medium">
                        Collaborative Curation
                      </h4>
                      <p className="font-mono text-[11px] text-ink-soft mt-0.5">
                        When enabled, invited users can add, remove, and reorder
                        tracks.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isUpdatingCollab}
                      onClick={handleToggleCollabSetting}
                      className={`font-mono text-[11px] uppercase tracking-wider py-2 px-4 border rounded-full transition-colors cursor-pointer shrink-0 font-medium ${
                        playlist.isCollaborative
                          ? 'border-primary bg-primary text-canvas'
                          : 'border-line bg-panel text-ink-soft hover:text-ink'
                      }`}
                    >
                      {playlist.isCollaborative ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                )}

                {/* Invite Link Section */}
                {playlist.isCollaborative && playlist.collaborationToken && (
                  <div className="space-y-2 p-4 border border-line rounded-xl bg-canvas/40">
                    <label className="block font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                      Collaboration Invite Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`}
                        className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink select-all rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`
                          navigator.clipboard.writeText(url)
                          showToast(
                            'Invite link copied to clipboard!',
                            'success',
                          )
                        }}
                        className="font-mono text-[11px] uppercase tracking-wider py-2.5 px-4 bg-ink text-canvas shrink-0 cursor-pointer rounded-xl font-medium"
                      >
                        Copy
                      </button>
                    </div>

                    {isOwner && (
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={isUpdatingCollab}
                          onClick={handleRegenerateCollabToken}
                          className="font-mono text-[11px] uppercase tracking-wider text-red-500 hover:underline cursor-pointer"
                        >
                          Regenerate Link (Revoke Old Invitations)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Active Collaborators */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                      Active Collaborators (
                      {(playlist.collaborators ?? []).length})
                    </span>
                  </div>

                  {(playlist.collaborators ?? []).length === 0 ? (
                    <div className="p-4 border border-dashed border-line rounded-xl text-center font-mono text-xs text-ink-soft">
                      No collaborators have joined this playlist yet.
                    </div>
                  ) : (
                    <div className="border border-line rounded-xl overflow-hidden divide-y divide-line/60 bg-canvas">
                      {(playlist.collaborators ?? []).map((collab: any) => (
                        <div
                          key={collab.userId}
                          className="p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-panel border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink-soft overflow-hidden shrink-0">
                              {collab.user?.avatarUrl ? (
                                <img
                                  src={collab.user.avatarUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (collab.user?.displayName ||
                                  'C')[0].toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-sans font-medium text-sm text-ink truncate">
                                {collab.user?.displayName || 'Collaborator'}
                              </div>
                              <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                                Joined{' '}
                                {new Date(collab.joinedAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          {isOwner && collab.userId !== user?.id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleKickCollaborator(collab.userId)
                              }
                              className="font-mono text-[11px] uppercase tracking-wider text-red-500 hover:text-red-600 px-2.5 py-1 border border-red-500/20 hover:border-red-500/40 rounded transition-colors cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 5: DANGER ZONE (Owner only) */}
              {isOwner && (
                <div className="space-y-3 pt-2">
                  <label className="font-mono text-[11px] uppercase tracking-widest text-red-500 font-semibold block">
                    Danger Zone
                  </label>

                  <div className="p-4 sm:p-5 border border-red-500/30 bg-red-500/5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-serif italic text-base text-red-600 dark:text-red-400 font-semibold">
                        Delete this Playlist
                      </h4>
                      <p className="font-sans text-xs text-ink-soft mt-0.5">
                        Permanently remove this playlist, track listings, and
                        collaborator permissions.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsModalOpen(false)
                        handleDeletePlaylist()
                      }}
                      className="font-mono text-xs uppercase tracking-wider py-2 px-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-semibold shadow-xs cursor-pointer flex items-center gap-2 shrink-0"
                    >
                      <TrashIconSVG className="w-3.5 h-3.5" />
                      <span>Delete Playlist</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Modal Actions Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line bg-panel shrink-0">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="font-mono text-xs uppercase tracking-wider py-2.5 px-5 border border-line text-ink-soft hover:text-ink rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingSettings}
                onClick={() => handleSaveSettings()}
                className="font-mono text-xs uppercase tracking-wider py-2.5 px-6 bg-ink text-canvas font-semibold hover:opacity-90 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ===================== ADD SONGS MODAL ===================== */}
      {isAddTracksModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg border border-line bg-panel p-6 rounded-2xl shadow-xl relative animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <h3 className="font-serif italic text-xl text-ink font-semibold">
                Add Tracks to Playlist
              </h3>
              <button
                type="button"
                onClick={() => setIsAddTracksModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            {addTrackError && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-mono text-[11px] rounded">
                {addTrackError}
              </div>
            )}

            <div className="relative mb-4">
              <input
                type="text"
                value={songSearchQuery}
                onChange={(e) => setSongSearchQuery(e.target.value)}
                placeholder="Search catalog by song title or artist..."
                className="w-full font-mono text-xs p-2.5 border border-line bg-canvas rounded-xl text-ink focus:outline-none focus:border-ink"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-line/60 border border-line rounded-xl mb-4 min-h-[160px] bg-canvas">
              {isSearchingSongs ? (
                <div className="p-8 text-center font-mono text-xs text-ink-soft">
                  Searching cuts...
                </div>
              ) : searchSongResults.length === 0 ? (
                <div className="p-8 text-center font-mono text-xs text-ink-soft">
                  {songSearchQuery.trim()
                    ? 'No songs match your query'
                    : 'Type to search available master tracks'}
                </div>
              ) : (
                searchSongResults.map((s) => {
                  const isSelected = selectedSongIds.includes(s.id)
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSongIds((prev) =>
                          isSelected
                            ? prev.filter((songId) => songId !== s.id)
                            : [...prev, s.id],
                        )
                      }}
                      className={`p-3 flex items-center justify-between cursor-pointer hover:bg-canvas-soft transition-colors ${
                        isSelected ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-sans font-semibold text-sm text-ink truncate">
                          {s.title}
                        </div>
                        <div className="font-mono text-[11px] text-ink-soft">
                          {formatDuration(s.durationSeconds)}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="accent-primary"
                      />
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                {selectedSongIds.length} tracks selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddTracksModalOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-wider py-2 px-4 border border-line text-ink-soft rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedSongIds.length === 0 || isAddingTracks}
                  onClick={handleAddTracksSubmit}
                  className="font-mono text-[11px] uppercase tracking-wider py-2 px-5 bg-ink text-canvas font-semibold hover:opacity-90 disabled:opacity-50 rounded-xl cursor-pointer"
                >
                  {isAddingTracks ? 'Adding...' : 'Add to Tracklist'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm border border-line bg-panel p-6 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-serif italic text-xl text-ink font-semibold mb-2">
              {confirmModal.title}
            </h3>
            <p className="font-sans text-xs text-ink-soft leading-relaxed mb-6">
              {confirmModal.description}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="font-mono text-xs uppercase tracking-wider py-2 px-4 border border-line text-ink-soft hover:text-ink rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm()
                  setConfirmModal(null)
                }}
                className={`font-mono text-xs uppercase tracking-wider py-2 px-5 rounded-xl font-semibold cursor-pointer ${
                  confirmModal.isDestructive
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-ink text-canvas hover:opacity-90'
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
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] left-1/2 -translate-x-1/2 z-50 bg-ink text-canvas font-mono text-xs px-5 py-2.5 rounded-full shadow-lg pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {toastNotice.message}
        </div>
      )}
    </div>
  )
}
