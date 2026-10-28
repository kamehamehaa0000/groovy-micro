import type { ReleaseVisibility } from '../../types/catalog'
import type { PlaylistDetail } from '../../types/playlist'
import { PlaylistCover } from '../PlaylistCover'
import {
  Badge,
  Button,
  Field,
  Eyebrow,
  Input,
  Select,
  Switch,
  Textarea,
} from '../ui'
import { Copy, Trash2, UploadCloud } from 'lucide-react'

export interface PlaylistSettingsValues {
  title: string
  description: string
  coverUrl: string | null
  visibility: ReleaseVisibility
  allowDuplicates: boolean
  allowComments: boolean
}

export interface PlaylistSettingsFormProps {
  formId: string
  values: PlaylistSettingsValues
  onChange: (patch: Partial<PlaylistSettingsValues>) => void
  onSubmit: () => void
  playlist: PlaylistDetail
  mosaicCovers: string[]
  isOwner: boolean
  isUploadingArtwork: boolean
  isUpdatingCollab: boolean
  onUploadArtwork: () => void
  onRemoveArtwork: () => void
  onToggleCollaboration: () => void
  onRegenerateToken: () => void
  onRemoveCollaborator: (userId: string) => void
  onDelete: () => void
  onNotify: (
    message: string,
    type?: 'info' | 'error' | 'success',
  ) => void
}

export function PlaylistSettingsForm({
  formId,
  values,
  onChange,
  onSubmit,
  playlist,
  mosaicCovers,
  isOwner,
  isUploadingArtwork,
  isUpdatingCollab,
  onUploadArtwork,
  onRemoveArtwork,
  onToggleCollaboration,
  onRegenerateToken,
  onRemoveCollaborator,
  onDelete,
  onNotify,
}: PlaylistSettingsFormProps) {
  const collaborators = playlist.collaborators ?? []

  const copyInviteLink = async () => {
    if (!playlist.collaborationToken) return
    const url = `${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`
    try {
      await navigator.clipboard.writeText(url)
      onNotify('Collaboration invite link copied', 'success')
    } catch {
      onNotify('Could not copy invite link', 'error')
    }
  }

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="space-y-7 p-4 sm:p-5"
    >
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow as="h3" className="tracking-widest">
            Playlist artwork
          </Eyebrow>
          <Badge tone="neutral">
            {values.coverUrl ? 'Custom cover' : 'Dynamic 2x2 mosaic'}
          </Badge>
        </div>

        <div className="flex flex-col gap-4 rounded-surface border border-border bg-background p-3.5 sm:flex-row sm:items-center sm:p-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-control border border-border bg-muted shadow-sm sm:h-28 sm:w-28">
            <PlaylistCover
              coverImageUrl={values.coverUrl}
              mosaicCovers={mosaicCovers}
              title={values.title || playlist.title}
              className="h-full w-full"
            />
            {isUploadingArtwork ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-1 text-center font-eyebrow text-eyebrow text-foreground backdrop-blur-xs">
                Uploading...
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="md"
                variant="primary"
                disabled={isUploadingArtwork}
                leftIcon={<UploadCloud className="h-3.5 w-3.5" />}
                onClick={onUploadArtwork}
              >
                {values.coverUrl ? 'Change artwork' : 'Upload artwork'}
              </Button>
              {values.coverUrl ? (
                <Button
                  type="button"
                  size="md"
                  variant="outline"
                  disabled={isUploadingArtwork}
                  onClick={onRemoveArtwork}
                >
                  Revert to mosaic
                </Button>
              ) : null}
            </div>
            <p className="text-caption leading-relaxed text-muted-foreground">
              Recommended: 1000 × 1000px square image (JPG, PNG, WEBP). An
              interactive 1:1 cropper runs before upload.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <Eyebrow as="h3" className="tracking-widest">
          Curation details
        </Eyebrow>

        <Field label="Playlist title" htmlFor={`${formId}-title`}>
          <Input
            id={`${formId}-title`}
            required
            maxLength={150}
            value={values.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="e.g. Late Night Synthwave"
          />
        </Field>

        <Field
          label="Description"
          htmlFor={`${formId}-description`}
          hint={`${values.description.length}/1000 characters`}
        >
          <Textarea
            id={`${formId}-description`}
            rows={3}
            maxLength={1000}
            value={values.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="Add an optional description or notes about this curation..."
          />
        </Field>
      </section>

      <section className="space-y-3">
        <Eyebrow as="h3" className="tracking-widest">
          Access &amp; rules
        </Eyebrow>

        <Field
          label="Visibility"
          htmlFor={`${formId}-visibility`}
          hint="Private and unlisted playlists stay out of the public directory."
        >
          <Select
            id={`${formId}-visibility`}
            value={values.visibility}
            onChange={(event) =>
              onChange({
                visibility: event.target.value as ReleaseVisibility,
              })
            }
          >
            <option value="PUBLIC">Public · discoverable by everyone</option>
            <option value="UNLISTED">Unlisted · share link only</option>
            <option value="PRIVATE">Private · you and collaborators</option>
          </Select>
        </Field>

        <div className="space-y-2">
          <div
            onClick={() =>
              onChange({ allowDuplicates: !values.allowDuplicates })
            }
            className="flex cursor-pointer items-start justify-between gap-3 rounded-control border border-border bg-background p-3.5 transition-colors hover:border-foreground/50"
          >
            <span>
              <span className="block font-sans text-caption font-semibold text-foreground">
                Allow duplicate songs
              </span>
              <span className="mt-0.5 block text-caption text-muted-foreground">
                Permit the same cut more than once in this playlist.
              </span>
            </span>
            <Switch
              checked={values.allowDuplicates}
              onChange={(checked) => onChange({ allowDuplicates: checked })}
              onClick={(event) => event.stopPropagation()}
              aria-label="Allow duplicate songs"
              className="mt-0.5"
            />
          </div>

          <div
            onClick={() => onChange({ allowComments: !values.allowComments })}
            className="flex cursor-pointer items-start justify-between gap-3 rounded-control border border-border bg-background p-3.5 transition-colors hover:border-foreground/50"
          >
            <span>
              <span className="block font-sans text-caption font-semibold text-foreground">
                Allow discussion &amp; comments
              </span>
              <span className="mt-0.5 block text-caption text-muted-foreground">
                Let listeners and collaborators leave comments.
              </span>
            </span>
            <Switch
              checked={values.allowComments}
              onChange={(checked) => onChange({ allowComments: checked })}
              onClick={(event) => event.stopPropagation()}
              aria-label="Allow discussion and comments"
              className="mt-0.5"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <Eyebrow as="h3" className="tracking-widest">
          Collaboration
        </Eyebrow>

        {isOwner ? (
          <div className="flex flex-col gap-3 rounded-control border border-border bg-background p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-sans text-caption font-semibold text-foreground">
                Collaborative curation
              </h4>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Invited users can add, remove, and reorder tracks.
              </p>
            </div>
            <Button
              type="button"
              size="md"
              variant={playlist.isCollaborative ? 'brand' : 'outline'}
              disabled={isUpdatingCollab}
              onClick={onToggleCollaboration}
              className="shrink-0"
            >
              {playlist.isCollaborative ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        ) : null}

        {playlist.isCollaborative && playlist.collaborationToken ? (
          <div className="space-y-2 rounded-control border border-border bg-background/50 p-3.5">
            <Eyebrow>Collaboration invite link</Eyebrow>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`}
                className="min-w-0 flex-1 font-mono text-caption"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                size="md"
                variant="outline"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={copyInviteLink}
                className="shrink-0"
              >
                Copy
              </Button>
            </div>
            {isOwner ? (
              <button
                type="button"
                disabled={isUpdatingCollab}
                onClick={onRegenerateToken}
                className="cursor-pointer font-eyebrow text-eyebrow uppercase tracking-wider text-destructive hover:underline disabled:opacity-50"
              >
                Regenerate link (revoke old invitations)
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Active collaborators</Eyebrow>
            <span className="font-mono text-eyebrow text-muted-foreground">
              {collaborators.length}
            </span>
          </div>

          {collaborators.length === 0 ? (
            <div className="rounded-control border border-dashed border-border p-4 text-center text-caption text-muted-foreground">
              No collaborators have joined this playlist yet.
            </div>
          ) : (
            <div className="divide-y divide-border/60 overflow-hidden rounded-control border border-border bg-background">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.userId}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card font-mono text-caption font-semibold text-muted-foreground">
                      {collaborator.user?.avatarUrl ? (
                        <img
                          src={collaborator.user.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (collaborator.user?.displayName || 'C')[0].toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-sans text-caption font-medium text-foreground">
                        {collaborator.user?.displayName || 'Collaborator'}
                      </div>
                      <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                        Joined{' '}
                        {new Date(collaborator.joinedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {isOwner && collaborator.userId !== playlist.ownerId ? (
                    <Button
                      type="button"
                      size="md"
                      variant="danger"
                      onClick={() => onRemoveCollaborator(collaborator.userId)}
                      className="shrink-0"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {isOwner ? (
        <section className="space-y-3 border-t border-border pt-5">
          <Eyebrow as="h3" tone="danger" className="tracking-widest">
            Danger zone
          </Eyebrow>

          <div className="flex flex-col gap-3 rounded-control border border-destructive/30 bg-destructive-soft p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-sans text-caption font-semibold text-destructive">
                Delete this playlist
              </h4>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Permanently remove this playlist, its tracklist, and collaborator
                access.
              </p>
            </div>
            <Button
              type="button"
              size="md"
              variant="danger"
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={onDelete}
              className="shrink-0"
            >
              Delete playlist
            </Button>
          </div>
        </section>
      ) : null}
    </form>
  )
}
