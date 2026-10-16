import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { playlistsApi } from '../../lib/playlists.api'
import type { CreatePlaylistInput } from '../../types/playlist'
import { usePlaylistsStore } from '../../stores/playlists.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'
import { useLibraryStore } from '../../stores/library.store'

export function CreatePlaylistModal() {
  const { isOpen, closeModal, initialTrackIds } = useCreatePlaylistModalStore()
  const navigate = useNavigate()
  const hydratePlaylists = usePlaylistsStore((s) => s.hydratePlaylists)

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newVisibility, setNewVisibility] = useState<
    'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  >('PUBLIC')
  const [newAllowDuplicates, setNewAllowDuplicates] = useState(false)
  const [newAllowComments, setNewAllowComments] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setNewTitle('')
      setNewDescription('')
      setNewVisibility('PUBLIC')
      setNewAllowDuplicates(false)
      setNewAllowComments(true)
      setModalError(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeModal])

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) {
      setModalError('Please provide a playlist title')
      return
    }

    setIsSubmitting(true)
    setModalError(null)

    try {
      const input: CreatePlaylistInput = {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        visibility: newVisibility,
        allowDuplicates: newAllowDuplicates,
        allowComments: newAllowComments,
      }

      const created = await playlistsApi.createPlaylist(input)
      if (initialTrackIds && initialTrackIds.length > 0) {
        try {
          await playlistsApi.addTracks(created.id, initialTrackIds)
        } catch (addErr) {
          console.error('Failed to attach queued tracks:', addErr)
        }
      }
      hydratePlaylists([{ id: created.id, isSaved: true }])
      useLibraryStore.getState().addPlaylist({
        id: created.id,
        title: created.title,
        description: created.description ?? null,
        coverImageUrl: created.coverImageUrl ?? null,
        visibility: created.visibility,
        isCollaborative: created.isCollaborative,
        isOwner: true,
        ownerId: created.ownerId,
        ownerName: created.ownerDisplayName || 'You',
        ownerAvatarUrl: null,
        savesCount: created.savesCount || 0,
        tracksCount: (initialTrackIds && initialTrackIds.length) || 0,
        addedAt: created.createdAt || new Date().toISOString(),
      })
      useLibraryStore.getState().invalidate()
      closeModal()

      navigate({ to: '/playlists/$id', params: { id: created.id } })
    } catch (err: any) {
      setModalError(err.message || 'Failed to create playlist')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm select-none">
      {/* Click backdrop to close */}
      <div className="fixed inset-0" onClick={closeModal} />

      <div className="w-full max-w-md border border-border bg-card p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150 z-10">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <h2 className="font-serif italic text-heading text-foreground">
            Create New Playlist
          </h2>
          <button
            type="button"
            onClick={closeModal}
            className="font-mono text-caption text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {initialTrackIds.length > 0 && (
          <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-1.5 mb-4 rounded-control flex items-center justify-between">
            <span>Saving Active Queue</span>
            <span>{initialTrackIds.length} tracks</span>
          </div>
        )}

        {modalError && (
          <div className="mb-4 p-3 border border-destructive/40 bg-destructive-soft text-destructive font-mono text-eyebrow">
            {modalError}
          </div>
        )}

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mb-1.5">
              Title *
            </label>
            <input
              type="text"
              required
              autoFocus
              maxLength={150}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Midnight Ambient &amp; Tape Loops"
              className="w-full font-mono text-caption p-2.5 border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground"
            />
          </div>

          <div>
            <label className="block font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Atmospheric soundscapes curated for deep work..."
              className="w-full font-mono text-caption p-2.5 border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground resize-none"
            />
          </div>

          <div>
            <label className="block font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mb-1.5">
              Visibility
            </label>
            <select
              value={newVisibility}
              onChange={(e: any) => setNewVisibility(e.target.value)}
              className="w-full font-mono text-caption p-2.5 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
            >
              <option value="PUBLIC">Public</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mb-1.5">
                Duplicate Songs
              </label>
              <label className="flex items-center gap-2 p-2.5 border border-border bg-background cursor-pointer hover:border-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={newAllowDuplicates}
                  onChange={(e) => setNewAllowDuplicates(e.target.checked)}
                  className="accent-primary"
                />
                <span className="font-mono text-eyebrow text-foreground">
                  Allow Dups
                </span>
              </label>
            </div>

            <div>
              <label className="block font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mb-1.5">
                Discussion &amp; Comments
              </label>
              <label className="flex items-center gap-2 p-2.5 border border-border bg-background cursor-pointer hover:border-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={newAllowComments}
                  onChange={(e) => setNewAllowComments(e.target.checked)}
                  className="accent-primary"
                />
                <span className="font-mono text-eyebrow text-foreground">
                  Allow Comments
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
            <button
              type="button"
              onClick={closeModal}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newTitle.trim()}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 bg-foreground text-background font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating...' : 'Create Playlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
