import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { playlistsApi } from '../lib/playlists.api'
import { catalogApi } from '../lib/catalog.api'
import type { PlaylistDetail, PlaylistTrack } from '../types/playlist'
import type { Song } from '../types/catalog'
import type { PlayerTrack } from '../types/player'
import { useAuthStore } from '../stores/auth.store'
import { usePlaylistsStore } from '../stores/playlists.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { PlaylistCover } from '../components/PlaylistCover'
import { CommentSection } from '../components/comments/CommentSection'
import { SongActionMenu } from '../components/player/SongActionMenu'
import {
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  LockIconSVG,
  TrashIconSVG,
  PlusIconSVG,
  EditIconSVG,
} from '../components/icons'

interface PlaylistSearchParams {
  shareToken?: string
  collabToken?: string
}

export const Route = createFileRoute('/playlists/$id')({
  component: PlaylistDetailComponent,
  validateSearch: (search: Record<string, unknown>): PlaylistSearchParams => {
    return {
      shareToken: typeof search.shareToken === 'string' ? search.shareToken : undefined,
      collabToken: typeof search.collabToken === 'string' ? search.collabToken : undefined,
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
  const { isPlaylistSaved, toggleSavePlaylist, hydratePlaylists } = usePlaylistsStore()
  const {
    currentTrack,
    playbackStatus,
    playTrack,
    togglePlay,
  } = usePlayerStore()

  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Interaction feedback states
  const [copiedLink, setCopiedLink] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [isJoiningCollab, setIsJoiningCollab] = useState(false)
  const [collabJoinSuccess, setCollabJoinSuccess] = useState<string | null>(null)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCollabModalOpen, setIsCollabModalOpen] = useState(false)
  const [isAddTracksModalOpen, setIsAddTracksModalOpen] = useState(false)

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editVisibility, setEditVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('PUBLIC')
  const [editAllowDuplicates, setEditAllowDuplicates] = useState(false)
  const [editAllowComments, setEditAllowComments] = useState(true)

  // Add tracks search state
  const [songSearchQuery, setSongSearchQuery] = useState('')
  const [searchSongResults, setSearchSongResults] = useState<Song[]>([])
  const [isSearchingSongs, setIsSearchingSongs] = useState(false)
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([])
  const [isAddingTracks, setIsAddingTracks] = useState(false)
  const [addTrackError, setAddTrackError] = useState<string | null>(null)

  // Collaboration management
  const [isUpdatingCollab, setIsUpdatingCollab] = useState(false)

  // Load Playlist details
  const fetchPlaylist = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const data = await playlistsApi.getPlaylistById(id, shareToken, collabToken)
      setPlaylist(data)
      setEditTitle(data.title)
      setEditDescription(data.description || '')
      setEditVisibility(data.visibility)
      setEditAllowDuplicates(data.allowDuplicates)
      setEditAllowComments(data.allowComments ?? true)
      hydratePlaylists([data])
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load playlist')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPlaylist()
  }, [id, shareToken, collabToken])

  const toPlayerTrack = (track: PlaylistTrack): PlayerTrack => {
    const song = track.song || (track as any)
    return {
      id: track.songId || song.id || track.id,
      title: song.title || track.title || 'Untitled',
      artistId: song.artistId || track.artistId || '',
      artistName: song.artistStageName || track.artistStageName || 'Unknown Artist',
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
    }
  }

  const handlePlayTrack = (track: PlaylistTrack, index?: number) => {
    const song = track.song || track
    if (song.isStreamable === false) {
      alert('This cut is scheduled and locked until release.')
      return
    }

    const songId = track.songId || song.id || track.id
    if (currentTrack?.id === songId) {
      togglePlay()
      return
    }

    if (!playlist) return
    const validTracks = (playlist.tracks || []).filter(
      (t) => (t.song || t).isStreamable !== false
    )
    const contextTracks = validTracks.map(toPlayerTrack)
    const targetTrack = toPlayerTrack(track)
    const targetIdx = contextTracks.findIndex((t) => t.id === targetTrack.id)

    playTrack(
      targetTrack,
      contextTracks,
      targetIdx >= 0 ? targetIdx : (index ?? 0),
      `playlist:${playlist.id}`,
      playlist.title
    )
  }

  const handlePlayPlaylistFromStart = () => {
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) return
    const firstPlayableIdx = playlist.tracks.findIndex(
      (t) => (t.song || t).isStreamable !== false
    )
    if (firstPlayableIdx >= 0) {
      handlePlayTrack(playlist.tracks[firstPlayableIdx], firstPlayableIdx)
    } else {
      alert('No streamable tracks found in this playlist.')
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
      setPlaylist((prev) => (prev ? { ...prev, savesCount: res.savesCount, isSaved: res.saved } : null))
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
      navigate({ to: '/playlists/$id', params: { id: res.playlist.id } })
    } catch (err: any) {
      alert(err.message || 'Failed to clone playlist')
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
      setCollabJoinSuccess(res.message || 'Successfully joined as a collaborator!')
      hydratePlaylists([{ id, isSaved: true }])
      await fetchPlaylist()
    } catch (err: any) {
      alert(err.message || 'Failed to join collaboration')
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
      } else {
        await playlistsApi.enableCollaboration(playlist.id)
      }
      await fetchPlaylist()
    } catch (err: any) {
      alert(err.message || 'Failed to update collaboration')
    } finally {
      setIsUpdatingCollab(false)
    }
  }

  // Regenerate invite link
  const handleRegenerateCollabToken = async () => {
    if (!playlist || isUpdatingCollab) return
    if (!confirm('Regenerating will invalidate existing invite links. Continue?')) return

    setIsUpdatingCollab(true)
    try {
      await playlistsApi.regenerateCollaborationToken(playlist.id)
      await fetchPlaylist()
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate invite link')
    } finally {
      setIsUpdatingCollab(false)
    }
  }

  // Kick collaborator
  const handleKickCollaborator = async (collaboratorUserId: string) => {
    if (!playlist) return
    try {
      await playlistsApi.removeCollaborator(playlist.id, collaboratorUserId)
      await fetchPlaylist()
    } catch (err: any) {
      alert(err.message || 'Failed to remove collaborator')
    }
  }

  // Track removal
  const handleRemoveTrack = async (entryId: string) => {
    if (!playlist) return
    try {
      await playlistsApi.removeTrack(playlist.id, entryId)
      setPlaylist((prev) =>
        prev ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== entryId) } : null
      )
    } catch (err: any) {
      alert(err.message || 'Failed to remove track')
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

    // Optimistic reorder
    setPlaylist((prev) => (prev ? { ...prev, tracks: newTracks } : null))

    try {
      const orderedEntryIds = newTracks.map((t) => t.id)
      await playlistsApi.reorderTracks(playlist.id, orderedEntryIds)
    } catch (err: any) {
      alert(err.message || 'Failed to reorder tracks')
      await fetchPlaylist()
    }
  }

  const handleMoveTrack = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    handleReorderTracks(index, targetIndex)
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
        const res = await catalogApi.searchSongs({ search: songSearchQuery.trim(), limit: 10 })
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
      await fetchPlaylist()
    } catch (err: any) {
      setAddTrackError(err.message || 'Failed to add tracks')
    } finally {
      setIsAddingTracks(false)
    }
  }

  // Update playlist metadata
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!playlist) return

    try {
      const updated = await playlistsApi.updatePlaylist(playlist.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        visibility: editVisibility,
        allowDuplicates: editAllowDuplicates,
        allowComments: editAllowComments,
      })
      setPlaylist((prev) => (prev ? { ...prev, ...updated } : null))
      setIsEditModalOpen(false)
    } catch (err: any) {
      alert(err.message || 'Failed to update playlist')
    }
  }

  // Delete playlist
  const handleDeletePlaylist = async () => {
    if (!playlist) return
    if (!confirm('Are you sure you want to delete this playlist? This action cannot be undone.')) return

    try {
      await playlistsApi.deletePlaylist(playlist.id)
      navigate({ to: '/playlists' })
    } catch (err: any) {
      alert(err.message || 'Failed to delete playlist')
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-soft animate-pulse">
          Loading playlist acoustics...
        </p>
      </div>
    )
  }

  if (errorMsg || !playlist) {
    return (
      <div className="max-w-xl mx-auto px-5 py-20 text-center">
        <div className="p-8 border border-red-500/40 bg-panel shadow-md">
          <h2 className="font-serif italic text-2xl text-ink">Access Restricted</h2>
          <p className="font-mono text-xs text-ink-soft mt-2">{errorMsg || 'Playlist not found'}</p>
          <Link
            to="/playlists"
            className="inline-block mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas"
          >
            ← Back to Playlists
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

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 w-full space-y-10">
      {/* ===================== COLLABORATION INVITE / STATUS BANNER ===================== */}
      {collabToken && !isOwner && isCollaborator && (
        <div className="p-4 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-4 flex-wrap shadow-xs">
          <div>
            <h4 className="font-serif italic text-base text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <span>✓</span> You are a Collaborator on this playlist
            </h4>
            <p className="font-mono text-[10.5px] text-ink-soft mt-0.5">
              You have already joined as a collaborator. You can add tracks and reorder tracks.
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] py-1.5 px-3 border border-emerald-500/30 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
            Already Joined
          </span>
        </div>
      )}

      {collabToken && !isOwner && !isCollaborator && (
        <div className="p-4 border border-blue bg-blue/10 flex items-center justify-between gap-4 flex-wrap shadow-xs">
          <div>
            <h4 className="font-serif italic text-base text-ink">
              Collaborator Invitation
            </h4>
            <p className="font-mono text-[10.5px] text-ink-soft mt-0.5">
              You were invited to contribute tracks and curate this playlist.
            </p>
          </div>
          <button
            type="button"
            disabled={isJoiningCollab}
            onClick={handleJoinCollaboration}
            className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-5 bg-blue text-canvas font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            {isJoiningCollab ? 'Joining...' : '✦ Accept & Join as Collaborator'}
          </button>
        </div>
      )}

      {collabJoinSuccess && (
        <div className="p-3 border border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400 font-mono text-xs">
          ✓ {collabJoinSuccess}
        </div>
      )}

      {/* ===================== PLAYLIST HERO HEADER ===================== */}
      <div className="border border-line bg-panel p-6 sm:p-10 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-8 relative z-10">
          {/* Mosaic / Artwork Container */}
          <div className="w-44 h-44 sm:w-52 sm:h-52 shrink-0 bg-canvas-deep border border-line shadow-md overflow-hidden relative">
            <PlaylistCover
              coverImageUrl={playlist.coverImageUrl}
              mosaicCovers={playlist.mosaicCovers}
              title={playlist.title}
              className="w-full h-full"
            />
          </div>

          {/* Details & Actions */}
          <div className="flex-1 flex flex-col justify-end gap-3 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2.5 flex-wrap font-mono text-[9px] uppercase tracking-[0.16em]">
              <span className="px-2.5 py-0.5 border border-line bg-canvas text-blue font-semibold">
                Playlist
              </span>
              <span className="px-2 py-0.5 border border-line text-ink-soft">
                {playlist.visibility}
              </span>
              {playlist.isCollaborative && (
                <span className="px-2 py-0.5 border border-blue/40 bg-blue/10 text-blue font-semibold">
                  🤝 Collaborative
                </span>
              )}
              {playlist.allowDuplicates && (
                <span className="px-2 py-0.5 border border-stone/50 text-ink-soft">
                  Duplicates Allowed
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="font-serif italic text-3xl sm:text-5xl text-ink tracking-tight leading-tight truncate">
              {playlist.title}
            </h1>

            {/* Description */}
            {playlist.description && (
              <p className="font-sans text-xs text-ink-soft max-w-2xl leading-relaxed">
                {playlist.description}
              </p>
            )}

            {/* Curator Attribution & Counts */}
            <div className="flex items-center gap-2.5 flex-wrap font-mono text-xs text-ink-soft pt-1">
              <span className="text-ink font-serif italic text-sm">
                Curated by {playlist.ownerDisplayName || 'Anonymous Curator'}
              </span>
              <span>&bull;</span>
              <span>{playlist.tracksCount ?? (playlist.tracks ?? []).length} Cuts</span>
              <span>&bull;</span>
              <span>{formatDuration(playlist.totalDurationSeconds ?? 0)}</span>
              <span>&bull;</span>
              <span>{playlist.savesCount ?? 0} Saves</span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-3 flex-wrap">
              {/* Play First Track */}
              {(playlist.tracks ?? []).length > 0 &&
                ((playlist.tracks[0].song || playlist.tracks[0]).isStreamable !== false) && (
                <button
                  type="button"
                  onClick={handlePlayPlaylistFromStart}
                  className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-6 bg-blue text-canvas hover:opacity-90 transition-opacity font-semibold shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  <PlayIconSVG className="w-3.5 h-3.5" />
                  <span>Play</span>
                </button>
              )}

              {/* 0ms Optimistic Save Bookmark */}
              <button
                type="button"
                onClick={handleToggleSave}
                className={`font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-5 border transition-all cursor-pointer shadow-2xs flex items-center gap-2 ${
                  saved
                    ? 'border-blue bg-blue/10 text-blue font-semibold'
                    : 'border-line bg-canvas hover:bg-canvas-deep text-ink-soft hover:text-ink'
                }`}
              >
                <HeartIconSVG className="w-3.5 h-3.5" filled={saved} />
                <span>{saved ? 'Saved' : 'Save'}</span>
              </button>

              {/* Clone Playlist Button */}
              <button
                type="button"
                disabled={isCloning}
                onClick={handleClonePlaylist}
                className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border border-line bg-canvas hover:bg-canvas-deep text-ink-soft hover:text-ink transition-colors cursor-pointer shadow-2xs"
              >
                <span>{isCloning ? 'Cloning...' : '✦ Clone to Library'}</span>
              </button>

              {/* Share Link (if Unlisted) */}
              {playlist.shareToken && (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/playlists/${playlist.id}?shareToken=${playlist.shareToken}`
                    navigator.clipboard.writeText(url)
                    setCopiedLink(true)
                    setTimeout(() => setCopiedLink(false), 2000)
                  }}
                  className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border border-line bg-canvas hover:bg-canvas-deep text-ink-soft hover:text-ink transition-colors cursor-pointer"
                >
                  <span>{copiedLink ? '✓ Link Copied!' : '🔗 Share Link'}</span>
                </button>
              )}

              {/* Collaboration Hub */}
              {(isOwner || playlist.isCollaborative) && (
                <button
                  type="button"
                  onClick={() => setIsCollabModalOpen(true)}
                  className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border border-line bg-canvas hover:bg-canvas-deep text-ink-soft hover:text-ink transition-colors cursor-pointer"
                >
                  <span>👥 Collaborators ({(playlist.collaborators ?? []).length})</span>
                </button>
              )}

              {/* Settings / Edit (Owner only) */}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border border-line bg-canvas hover:bg-canvas-deep text-ink-soft hover:text-ink transition-colors cursor-pointer"
                >
                  <EditIconSVG className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </button>
              )}

              {/* Delete (Owner only) */}
              {isOwner && (
                <button
                  type="button"
                  onClick={handleDeletePlaylist}
                  className="font-mono text-xs uppercase tracking-[0.14em] p-2.5 border border-line text-ink-soft hover:text-red-500 hover:border-red-500 transition-colors cursor-pointer ml-auto"
                  title="Delete playlist"
                >
                  <TrashIconSVG className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== TRACKLIST SECTION ===================== */}
      <div className="space-y-4">
        <div className="flex justify-between items-baseline border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-serif italic font-medium text-xl text-ink">
              Tracklist
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
              {(playlist.tracks ?? []).length} {(playlist.tracks ?? []).length === 1 ? 'Cut' : 'Cuts'}
            </span>
          </div>

          {/* Add tracks trigger */}
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsAddTracksModalOpen(true)}
              className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-panel text-ink hover:border-ink transition-colors cursor-pointer"
            >
              <PlusIconSVG className="w-3 h-3" />
              <span>Add Songs</span>
            </button>
          )}
        </div>

        {(playlist.tracks ?? []).length === 0 ? (
          <div className="p-16 border border-dashed border-line bg-panel text-center">
            <p className="font-serif italic text-base text-ink">
              This playlist is currently empty.
            </p>
            {canEdit && (
              <p className="font-mono text-[10.5px] text-ink-soft mt-1">
                Click 'Add Songs' above to build your tracklist.
              </p>
            )}
          </div>
        ) : (
          <div className="border border-line bg-panel divide-y divide-line/60 shadow-xs">
            {(playlist.tracks ?? []).map((track, idx) => {
              const entryId = track.id || (track as any).entryId
              const song = track.song || (track as any)
              const songId = track.songId || song.id || track.id
              const isCurrentPlaying =
                currentTrack?.id === songId && playbackStatus === 'playing'
              const isCurrentLoaded = currentTrack?.id === songId
              const isLocked = song.isStreamable === false

              return (
                <div
                  key={entryId || idx}
                  draggable={canEdit && !isLocked}
                  onDragStart={(e) => {
                    if (!canEdit || isLocked) return
                    e.dataTransfer.setData('text/plain', String(idx))
                    e.dataTransfer.dropEffect = 'move'
                    setDraggedIdx(idx)
                  }}
                  onDragOver={(e) => {
                    if (!canEdit) return
                    e.preventDefault()
                    if (draggedIdx !== null && draggedIdx !== idx) {
                      setDropTargetIdx(idx)
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTargetIdx === idx) setDropTargetIdx(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const from = Number(e.dataTransfer.getData('text/plain'))
                    if (!isNaN(from) && from !== idx) {
                      handleReorderTracks(from, idx)
                    }
                    setDraggedIdx(null)
                    setDropTargetIdx(null)
                  }}
                  onDragEnd={() => {
                    setDraggedIdx(null)
                    setDropTargetIdx(null)
                  }}
                  className={`px-5 py-3.5 flex items-center justify-between hover:bg-canvas-deep transition-all group ${
                    isCurrentPlaying ? 'bg-blue/5' : ''
                  } ${isLocked ? 'opacity-65 bg-line/10' : ''} ${
                    draggedIdx === idx ? 'opacity-40 bg-line/20' : ''
                  } ${dropTargetIdx === idx ? 'border-t-2 border-blue bg-blue/5' : ''}`}
                >
                  {/* Left: Drag Handle, Index / Play, Title, Artist, Scheduled Badge */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                    {canEdit && (
                      <span
                        className="cursor-grab active:cursor-grabbing text-ink-soft/40 hover:text-ink select-none font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Drag to reorder"
                      >
                        ⋮⋮
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handlePlayTrack(track, idx)}
                      aria-label={
                        isLocked
                          ? 'Track is locked until scheduled release'
                          : isCurrentPlaying
                            ? 'Pause track'
                            : 'Play track'
                      }
                      className="w-6 h-6 flex items-center justify-center text-ink-soft group-hover:text-ink cursor-pointer shrink-0"
                    >
                      {isLocked ? (
                        <LockIconSVG className="w-3.5 h-3.5 text-ink-soft" />
                      ) : isCurrentPlaying ? (
                        <PauseIconSVG className="w-3.5 h-3.5 text-blue" />
                      ) : (
                        <>
                          <span
                            className={`font-mono text-[10.5px] ${
                              isCurrentLoaded ? 'text-blue font-bold' : ''
                            } group-hover:hidden`}
                          >
                            {String(track.position + 1).padStart(2, '0')}
                          </span>
                          <PlayIconSVG className="w-3.5 h-3.5 hidden group-hover:block text-ink" />
                        </>
                      )}
                    </button>

                    {/* Artwork preview */}
                    {(song.coverImageUrl || song.albumCoverUrl) && (
                      <img
                        src={song.coverImageUrl || song.albumCoverUrl}
                        alt=""
                        className="w-8 h-8 object-cover border border-line shrink-0 hidden sm:block"
                      />
                    )}

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-serif text-sm truncate ${
                            isCurrentPlaying ? 'text-blue font-medium' : isCurrentLoaded ? 'text-blue' : 'text-ink'
                          }`}
                        >
                          {song.title}
                        </span>

                        {song.isExplicit && (
                          <span className="font-mono text-[8px] uppercase tracking-[0.14em] px-1 py-0.2 border border-line text-ink-soft">
                            E
                          </span>
                        )}

                        {/* Greyed-out Scheduled Badge */}
                        {isLocked && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-blue/40 bg-blue/10 text-blue font-semibold flex items-center gap-1">
                            <LockIconSVG className="w-2.5 h-2.5" />
                            <span>
                              Releases{' '}
                              {song.scheduledReleaseAt
                                ? new Date(song.scheduledReleaseAt).toLocaleDateString()
                                : 'Soon'}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-[10.5px] text-ink-soft truncate">
                        {song.artistStageName || 'Unknown Artist'}
                        {song.albumTitle && ` — ${song.albumTitle}`}
                      </div>
                    </div>
                  </div>

                  {/* Right: Duration, Added By, SongActionMenu, Move & Remove Buttons */}
                  <div className="flex items-center gap-3 shrink-0 font-mono text-[10.5px] text-ink-soft">
                    <span className="hidden md:inline text-ink-soft/70">
                      Added by {track.addedByDisplayName || 'Member'}
                    </span>

                    <span>{formatDuration(song.durationSeconds ?? 0)}</span>

                    {!isLocked && (
                      <SongActionMenu track={toPlayerTrack(track)} />
                    )}

                    {/* Edit controls: Up / Down / Remove */}
                    {canEdit && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveTrack(idx, 'up')}
                          className="p-1 hover:text-ink disabled:opacity-20 cursor-pointer"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === playlist.tracks.length - 1}
                          onClick={() => handleMoveTrack(idx, 'down')}
                          className="p-1 hover:text-ink disabled:opacity-20 cursor-pointer"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveTrack(entryId)}
                          className="p-1 hover:text-red-500 cursor-pointer ml-1"
                          title="Remove from playlist"
                        >
                          <TrashIconSVG className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Nested Comments Subsystem */}
      <CommentSection
        targetType="playlist"
        targetId={playlist.id}
        allowComments={playlist.allowComments ?? true}
        isCreatorOrOwner={isOwner}
      />

      {/* ===================== ADD SONGS MODAL ===================== */}
      {isAddTracksModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="w-full max-w-lg border border-line bg-panel p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <h3 className="font-serif italic text-xl text-ink">Add Tracks to Playlist</h3>
              <button
                type="button"
                onClick={() => setIsAddTracksModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            {addTrackError && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-mono text-[10.5px]">
                {addTrackError}
              </div>
            )}

            <div className="relative mb-4">
              <input
                type="text"
                value={songSearchQuery}
                onChange={(e) => setSongSearchQuery(e.target.value)}
                placeholder="Search catalog by song title or lyrics..."
                className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-line/60 border border-line mb-4 min-h-[160px]">
              {isSearchingSongs ? (
                <div className="p-8 text-center font-mono text-xs text-ink-soft">Searching cuts...</div>
              ) : searchSongResults.length === 0 ? (
                <div className="p-8 text-center font-mono text-xs text-ink-soft">
                  {songSearchQuery.trim() ? 'No songs match your query' : 'Type to search available master tracks'}
                </div>
              ) : (
                searchSongResults.map((s) => {
                  const isSelected = selectedSongIds.includes(s.id)
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSongIds((prev) =>
                          isSelected ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                        )
                      }}
                      className={`p-3 flex items-center justify-between cursor-pointer hover:bg-canvas-deep transition-colors ${
                        isSelected ? 'bg-blue/10' : ''
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-serif text-sm text-ink truncate">{s.title}</div>
                        <div className="font-mono text-[10px] text-ink-soft">
                          {formatDuration(s.durationSeconds)}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="accent-blue"
                      />
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              <span className="font-mono text-[10px] uppercase text-ink-soft">
                {selectedSongIds.length} tracks selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddTracksModalOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedSongIds.length === 0 || isAddingTracks}
                  onClick={handleAddTracksSubmit}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {isAddingTracks ? 'Adding...' : 'Add to Tracklist'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== EDIT SETTINGS MODAL ===================== */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="w-full max-w-md border border-line bg-panel p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-5">
              <h3 className="font-serif italic text-xl text-ink">Playlist Settings</h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                  Visibility
                </label>
                <select
                  value={editVisibility}
                  onChange={(e: any) => setEditVisibility(e.target.value)}
                  className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink"
                >
                  <option value="PUBLIC">Public</option>
                  <option value="UNLISTED">Unlisted</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                    Duplicate Songs
                  </label>
                  <label className="flex items-center gap-2 p-2.5 border border-line bg-canvas cursor-pointer hover:border-ink transition-colors">
                    <input
                      type="checkbox"
                      checked={editAllowDuplicates}
                      onChange={(e) => setEditAllowDuplicates(e.target.checked)}
                      className="accent-blue"
                    />
                    <span className="font-mono text-[10.5px] text-ink">Allow Dups</span>
                  </label>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                    Discussion & Comments
                  </label>
                  <label className="flex items-center gap-2 p-2.5 border border-line bg-canvas cursor-pointer hover:border-ink transition-colors">
                    <input
                      type="checkbox"
                      checked={editAllowComments}
                      onChange={(e) => setEditAllowComments(e.target.checked)}
                      className="accent-blue"
                    />
                    <span className="font-mono text-[10.5px] text-ink">Allow Comments</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas font-semibold hover:opacity-90"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== COLLABORATION HUB MODAL ===================== */}
      {isCollabModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="w-full max-w-lg border border-line bg-panel p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150 space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif italic text-xl text-ink">Collaboration Manager</h3>
              <button
                type="button"
                onClick={() => setIsCollabModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Toggle Collaboration (Owner only) */}
            {isOwner && (
              <div className="flex items-center justify-between p-4 border border-line bg-canvas">
                <div>
                  <h4 className="font-serif text-sm text-ink">Allow Collaboration</h4>
                  <p className="font-mono text-[10px] text-ink-soft mt-0.5">
                    When enabled, users with the invite link can contribute tracks.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isUpdatingCollab}
                  onClick={handleToggleCollabSetting}
                  className={`font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 border transition-colors ${
                    playlist.isCollaborative
                      ? 'border-blue bg-blue text-canvas'
                      : 'border-line bg-panel text-ink-soft hover:text-ink'
                  }`}
                >
                  {playlist.isCollaborative ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            )}

            {/* Invite Link */}
            {playlist.isCollaborative && playlist.collaborationToken && (
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  Collaboration Invite Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`}
                    className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`
                      navigator.clipboard.writeText(url)
                      alert('Invite link copied to clipboard!')
                    }}
                    className="font-mono text-[11px] uppercase tracking-[0.14em] py-2.5 px-4 bg-ink text-canvas shrink-0"
                  >
                    Copy
                  </button>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    disabled={isUpdatingCollab}
                    onClick={handleRegenerateCollabToken}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-500 hover:underline pt-1 cursor-pointer"
                  >
                    Regenerate Token (Revoke Old Links)
                  </button>
                )}
              </div>
            )}

            {/* Collaborators List */}
            {playlist.isCollaborative && (
              <div className="space-y-2 pt-2 border-t border-line">
                <h4 className="font-serif text-sm text-ink">Active Collaborators</h4>
                {(playlist.collaborators ?? []).length === 0 ? (
                  <p className="font-mono text-[10.5px] text-ink-soft italic">
                    No collaborators have joined yet. Share the invite link above!
                  </p>
                ) : (
                  <div className="divide-y divide-line/60 border border-line max-h-48 overflow-y-auto">
                    {(playlist.collaborators ?? []).map((c) => (
                      <div
                        key={c.userId}
                        className="p-3 flex items-center justify-between font-mono text-xs text-ink"
                      >
                        <div>
                          <div className="font-serif flex items-center gap-1.5">
                            <span>{c.user?.displayName || (c as any).displayName || 'Collaborator'}</span>
                            {user && c.userId === user.id && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 border border-blue/40 bg-blue/10 text-blue font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-ink-soft">
                            Joined {new Date(c.joinedAt).toLocaleDateString()}
                          </div>
                        </div>

                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => handleKickCollaborator(c.userId)}
                            className="font-mono text-[10px] uppercase text-red-500 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsCollabModalOpen(false)}
                className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
