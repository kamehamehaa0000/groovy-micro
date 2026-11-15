import type { FormEvent } from 'react'
import { SaveBar } from '../../ui/SaveBar'
import { FieldLabel, MonoInput, TitleInput, TextAreaField } from '../fields'
import { Button } from '../../ui'

export interface IdentityFormProps {
  stageName: string
  slug: string
  bio: string
  instagram: string
  website: string
  spotify: string
  isDirty: boolean
  isSaving: boolean
  onChange: (
    field: 'stageName' | 'slug' | 'bio' | 'instagram' | 'website' | 'spotify',
    value: string,
  ) => void
  onSave: (e: FormEvent) => void
  onRevert: () => void
  onCancel: () => void
}

/**
 * The artist's public identity.
 *
 * It lives in its own component because it is the one form in the studio that
 * can be dirty, and a dirty form needs to say so.
 */
export function IdentityForm({
  stageName,
  slug,
  bio,
  instagram,
  website,
  spotify,
  isDirty,
  isSaving,
  onChange,
  onSave,
  onRevert,
  onCancel,
}: IdentityFormProps) {
  return (
    <form onSubmit={onSave} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <FieldLabel>Stage Name</FieldLabel>
          <TitleInput
            size="body"
            type="text"
            required
            value={stageName}
            className="border-none rounded-lg"
            onChange={(e) => onChange('stageName', e.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Vanity Slug</FieldLabel>
          <MonoInput
            type="text"
            required
            value={slug}
            className="border-none rounded-lg"
            onChange={(e) => onChange('slug', e.target.value)}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Biography</FieldLabel>
        <TextAreaField
          rows={4}
          value={bio}
          className="border-none rounded-lg"
          onChange={(e) => onChange('bio', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel tone="muted" spacing="tight">
            Instagram
          </FieldLabel>
          <MonoInput
            size="sm"
            type="url"
            value={instagram}
            className="border-none rounded-lg"
            onChange={(e) => onChange('instagram', e.target.value)}
            placeholder="https://instagram.com/..."
          />
        </div>
        <div>
          <FieldLabel tone="muted" spacing="tight">
            Website
          </FieldLabel>
          <MonoInput
            size="sm"
            type="url"
            value={website}
            className="border-none rounded-lg"
            onChange={(e) => onChange('website', e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div>
          <FieldLabel tone="muted" spacing="tight">
            Spotify
          </FieldLabel>
          <MonoInput
            size="sm"
            type="url"
            value={spotify}
            className="border-none rounded-lg"
            onChange={(e) => onChange('spotify', e.target.value)}
            placeholder="https://open.spotify.com/..."
          />
        </div>
      </div>

      <SaveBar
        isDirty={isDirty}
        isBusy={isSaving}
        saveLabel="Save Profile Changes"
        busyLabel="Saving..."
        onRevert={onRevert}
        actions={
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="rounded-full"
            onClick={onCancel}
          >
            Cancel
          </Button>
        }
      />
    </form>
  )
}
