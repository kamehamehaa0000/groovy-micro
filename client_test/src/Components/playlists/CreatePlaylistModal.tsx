import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { playlistsApi } from '../../lib/playlists.api'
import type { CreatePlaylistInput } from '../../types/playlist'
import { usePlaylistsStore } from '../../stores/playlists.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'
import { useLibraryStore } from '../../stores/library.store'
import { notify } from '../../lib/toast'
import { Button, Field, IconButton, Input, Select, Switch, Textarea } from '../ui'

export function CreatePlaylistModal() {
  const {
    isOpen,
    closeModal,
    initialTrackIds,
    initialTitle,
    initialDescription,
  } = useCreatePlaylistModalStore()
  const navigate = useNavigate()
  const hydratePlaylists = usePlaylistsStore((s) => s.hydratePlaylists)

  const titleId = useId()
  const formId = useId()
  const titleInputId = useId()
  const descriptionInputId = useId()
  const visibilityId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newVisibility, setNewVisibility] = useState<
    'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  >('PUBLIC')
  const [newAllowDuplicates, setNewAllowDuplicates] = useState(false)
  const [newAllowComments, setNewAllowComments] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const trackCount = initialTrackIds.length

  // Reset on close; prefill the title/description the caller supplied on open.
  useEffect(() => {
    if (!isOpen) {
      setNewTitle('')
      setNewDescription('')
      setNewVisibility('PUBLIC')
      setNewAllowDuplicates(false)
      setNewAllowComments(true)
      setModalError(null)
      setIsSubmitting(false)
      return
    }

    setNewTitle(initialTitle)
    setNewDescription(initialDescription)
    setModalError(null)
  }, [isOpen, initialTitle, initialDescription])

  // Escape to close, lock body scroll, trap Tab inside the dialog.
  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
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

      let attachFailed = false
      if (trackCount > 0) {
        try {
          await playlistsApi.addTracks(created.id, initialTrackIds)
        } catch (addErr) {
          console.error('Failed to attach queued tracks:', addErr)
          attachFailed = true
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
        tracksCount: trackCount,
        addedAt: created.createdAt || new Date().toISOString(),
      })
      useLibraryStore.getState().invalidate()
      closeModal()

      if (attachFailed) {
        notify.error(
          'Playlist created, but its tracks could not be added. Open it to retry.'
        )
      } else {
        notify.success(
          trackCount > 0
            ? `Playlist created with ${trackCount} ${
                trackCount === 1 ? 'track' : 'tracks'
              }`
            : 'Playlist created'
        )
      }

      navigate({ to: '/playlists/$id', params: { id: created.id } })
    } catch (err: any) {
      setModalError(err.message || 'Failed to create playlist')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm animate-in fade-in duration-150 select-none"
    >
      <div
        aria-hidden="true"
        className="fixed inset-0"
        onClick={closeModal}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-surface border border-border bg-card shadow-floating outline-none animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
              Playlist
            </p>
            <h2
              id={titleId}
              className="mt-0.5 font-serif italic text-title text-foreground"
            >
              Create new playlist
            </h2>
          </div>
          <IconButton
            size="sm"
            aria-label="Close dialog"
            onClick={closeModal}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {trackCount > 0 ? (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-control border border-primary/20 bg-primary/10 px-3 py-2">
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary">
                Adding
              </span>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary">
                {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
              </span>
            </div>
          ) : null}

          {modalError ? (
            <div className="mb-4 rounded-control border border-destructive/30 bg-destructive-soft px-3 py-2 font-sans text-caption text-destructive">
              {modalError}
            </div>
          ) : null}

          <form id={formId} onSubmit={handleCreateSubmit} className="space-y-4">
            <Field label="Title" htmlFor={titleInputId}>
              <Input
                id={titleInputId}
                required
                autoFocus
                maxLength={150}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Midnight Ambient & Tape Loops"
              />
            </Field>

            <Field label="Description" htmlFor={descriptionInputId}>
              <Textarea
                id={descriptionInputId}
                rows={2}
                maxLength={1000}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Atmospheric soundscapes curated for deep work..."
                className="min-h-16"
              />
            </Field>

            <Field label="Visibility" htmlFor={visibilityId}>
              <Select
                id={visibilityId}
                value={newVisibility}
                onChange={(e) =>
                  setNewVisibility(
                    e.target.value as 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
                  )
                }
              >
                <option value="PUBLIC">Public</option>
                <option value="UNLISTED">Unlisted</option>
                <option value="PRIVATE">Private</option>
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              <div
                onClick={() => setNewAllowDuplicates((value) => !value)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
              >
                <span className="font-sans text-caption text-foreground">
                  Allow duplicates
                </span>
                <Switch
                  checked={newAllowDuplicates}
                  onChange={setNewAllowDuplicates}
                  onClick={(event) => event.stopPropagation()}
                  size="sm"
                  aria-label="Allow duplicates"
                />
              </div>

              <div
                onClick={() => setNewAllowComments((value) => !value)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
              >
                <span className="font-sans text-caption text-foreground">
                  Allow comments
                </span>
                <Switch
                  checked={newAllowComments}
                  onChange={setNewAllowComments}
                  onClick={(event) => event.stopPropagation()}
                  size="sm"
                  aria-label="Allow comments"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" size="sm" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            size="sm"
            disabled={isSubmitting || !newTitle.trim()}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Creating...
              </span>
            ) : (
              'Create playlist'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
