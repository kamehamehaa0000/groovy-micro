import { useEffect, useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { playlistsApi } from '../../lib/playlists.api'
import type { CreatePlaylistInput } from '../../types/playlist'
import { usePlaylistsStore } from '../../stores/playlists.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'
import { useLibraryStore } from '../../stores/library.store'
import { notify } from '../../lib/toast'
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '../ui'

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
    <Modal
      open
      onClose={closeModal}
      eyebrow="Playlist"
      title={
        <span id={titleId} className="font-medium">
          Create new playlist
        </span>
      }
      size="md"
      footer={
        <>
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
        </>
      }
    >
      <div className="overflow-y-auto">
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
    </Modal>
  )
}
