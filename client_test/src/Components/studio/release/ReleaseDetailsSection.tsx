import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react'
import { Calendar, Check, Disc3 } from 'lucide-react'
import { PRIMARY_GENRES, GENRE_SUBGENRES_MAP } from '../../../lib/taxonomy'
import type { AlbumType, ReleaseVisibility } from '../../../types/catalog'
import {
  FieldLabel,
  GovernanceToggle,
  MonoInput,
  MoodChipRow,
  SelectField,
  TitleInput,
  TagChipInput,
  TextAreaField,
} from '../fields'

export interface ReleaseDetailsSectionProps {
  releaseType: AlbumType
  title: string
  onTitleChange: (value: string) => void
  mode: 'IMMEDIATE' | 'SCHEDULED'
  onModeChange: (mode: 'IMMEDIATE' | 'SCHEDULED') => void
  scheduledDate: string
  onScheduledDateChange: (value: string) => void
  scheduledTime: string
  onScheduledTimeChange: (value: string) => void
  visibility: ReleaseVisibility
  onVisibilityChange: (visibility: ReleaseVisibility) => void
  coverPreview: string | null
  coverUrl: string
  isUploadingCover: boolean
  coverInputRef: RefObject<HTMLInputElement | null>
  onCoverSelect: (event: ChangeEvent<HTMLInputElement>) => void
  onRemoveCover: () => void
  primaryGenre: string
  onPrimaryGenreChange: (value: string) => void
  subGenre: string
  onSubGenreChange: (value: string) => void
  moods: string[]
  onMoodsChange: Dispatch<SetStateAction<string[]>>
  tags: string[]
  onTagsChange: Dispatch<SetStateAction<string[]>>
  description: string
  onDescriptionChange: (value: string) => void
  allowComments: boolean
  onAllowCommentsChange: Dispatch<SetStateAction<boolean>>
}

/**
 * The release's own details: what it is called, when it drops, who can see
 * it, what it looks like and how it is classified.
 *
 * It was a third of the create-release drawer, mixed in with the audio
 * upload and the submit logic. It is its own component now, so the drawer
 * reads as three things: the details, the audio, the action.
 */
export function ReleaseDetailsSection({
  releaseType,
  title,
  onTitleChange,
  mode,
  onModeChange,
  scheduledDate,
  onScheduledDateChange,
  scheduledTime,
  onScheduledTimeChange,
  visibility,
  onVisibilityChange,
  coverPreview,
  coverUrl,
  isUploadingCover,
  coverInputRef,
  onCoverSelect,
  onRemoveCover,
  primaryGenre,
  onPrimaryGenreChange,
  subGenre,
  onSubGenreChange,
  moods,
  onMoodsChange,
  tags,
  onTagsChange,
  description,
  onDescriptionChange,
  allowComments,
  onAllowCommentsChange,
}: ReleaseDetailsSectionProps) {
  const cover = coverPreview || coverUrl

  return (
    <>
      {/* Basic Release Metadata */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <FieldLabel>
            {releaseType === 'SINGLE' ? 'Single Title' : 'Release Title'}{' '}
            <span className="text-destructive">*</span>
          </FieldLabel>
          <TitleInput
            type="text"
            required
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={
              releaseType === 'SINGLE'
                ? 'e.g. Autumn in Saint-Germain'
                : 'e.g. Kind of Blue, Rue de Sèvres Sessions'
            }
          />
        </div>

        <div>
          <FieldLabel>Release Timing</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onModeChange('IMMEDIATE')}
              className={`cursor-pointer border px-3 py-2 text-center font-eyebrow text-caption uppercase tracking-wider transition-colors ${
                mode === 'IMMEDIATE'
                  ? 'border-foreground bg-foreground font-semibold text-background'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              Immediate
            </button>
            <button
              type="button"
              onClick={() => {
                onModeChange('SCHEDULED')
                if (!scheduledDate) {
                  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
                  onScheduledDateChange(tomorrow.toISOString().split('T')[0])
                  onScheduledTimeChange('00:00')
                }
              }}
              className={`flex cursor-pointer items-center justify-center gap-1.5 border px-3 py-2 text-center font-eyebrow text-caption uppercase tracking-wider transition-colors ${
                mode === 'SCHEDULED'
                  ? 'border-foreground bg-foreground font-semibold text-background'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Scheduled Drop</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled Release Date & Time Settings */}
      {mode === 'SCHEDULED' && (
        <div className="space-y-3 border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2 font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-semibold">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Scheduled Drop & Pre-Save Configuration</span>
          </div>
          <p className="font-sans text-caption text-muted-foreground">
            Specify when your {releaseType.toLowerCase()} officially drops.
            Listeners can pre-save the release to their library immediately.
            Full audio playback remains locked until this exact timestamp.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel tone="muted" spacing="tight">
                Release Date (Local) <span className="text-destructive">*</span>
              </FieldLabel>
              <MonoInput
                type="date"
                required
                min={new Date().toISOString().split('T')[0]}
                value={scheduledDate}
                onChange={(e) => onScheduledDateChange(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel tone="muted" spacing="tight">
                Release Time (Local) <span className="text-destructive">*</span>
              </FieldLabel>
              <MonoInput
                type="time"
                required
                value={scheduledTime}
                onChange={(e) => onScheduledTimeChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Catalog Visibility Tier Selector */}
      <div>
        <FieldLabel>Catalog Visibility Tier</FieldLabel>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            {
              key: 'PUBLIC',
              label: 'Public',
              desc: 'Discoverable in search, artist profile, and pre-save feeds.',
            },
            {
              key: 'UNLISTED',
              label: 'Unlisted',
              desc: 'Hidden from search; accessible only via private secret share token link.',
            },
            {
              key: 'PRIVATE',
              label: 'Private',
              desc: 'Strictly restricted to you and collaborators in Studio.',
            },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onVisibilityChange(opt.key as ReleaseVisibility)}
              className={`cursor-pointer rounded-control border p-3 text-left transition-colors ${
                visibility === opt.key
                  ? 'border-foreground bg-background shadow-raised ring-1 ring-foreground'
                  : 'border-border bg-card hover:bg-background'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-eyebrow text-caption font-semibold uppercase tracking-wider text-foreground">
                  {opt.label}
                </span>
                {visibility === opt.key && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </div>
              <p className="font-sans text-eyebrow leading-snug text-muted-foreground">
                {opt.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Release Artwork Upload (Square 1:1) */}
      <div>
        <FieldLabel spacing="tight">
          {releaseType === 'SINGLE'
            ? 'Single Cover Artwork (Cloudflare R2)'
            : 'Release Cover Artwork (Cloudflare R2)'}{' '}
          <span className="text-destructive">*</span>
        </FieldLabel>
        <p className="mb-2 font-sans text-caption text-muted-foreground">
          Square artwork (1:1 ratio), minimum 1400x1400px recommended (JPEG,
          PNG, or WebP). Stored on Cloudflare R2 edge CDN.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted">
            {cover ? (
              <img
                src={cover}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <Disc3 className="w-8 h-8 shrink-0 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 border border-border bg-background px-3 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-foreground hover:border-foreground">
                <span>
                  {isUploadingCover
                    ? 'Uploading to R2...'
                    : cover
                      ? 'Replace Artwork'
                      : 'Upload Cover Artwork'}
                </span>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  disabled={isUploadingCover}
                  onChange={onCoverSelect}
                  className="hidden"
                />
              </label>
              {cover ? (
                <button
                  type="button"
                  onClick={onRemoveCover}
                  className="cursor-pointer border border-border px-2.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-eyebrow text-muted-foreground">
              {cover ? (
                <>
                  <Check className="w-3 h-3 shrink-0" />
                  Artwork attached to release
                </>
              ) : (
                'Official release artwork required'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Release Taxonomy & Classification */}
      <div className="space-y-4 border-t border-border-soft pt-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Primary Genre</FieldLabel>
            <SelectField
              value={primaryGenre}
              onChange={(e) => {
                onPrimaryGenreChange(e.target.value)
                onSubGenreChange('')
              }}
            >
              <option value="">Select Primary Genre...</option>
              {PRIMARY_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <FieldLabel>Sub-Genre (Optional)</FieldLabel>
            <SelectField
              value={subGenre}
              onChange={(e) => onSubGenreChange(e.target.value)}
              disabled={!primaryGenre || !GENRE_SUBGENRES_MAP[primaryGenre]?.length}
            >
              <option value="">Select Sub-Genre...</option>
              {primaryGenre &&
                GENRE_SUBGENRES_MAP[primaryGenre]?.map((sg) => (
                  <option key={sg} value={sg}>
                    {sg}
                  </option>
                ))}
            </SelectField>
          </div>
        </div>

        <MoodChipRow selected={moods} onChange={onMoodsChange} />
        <TagChipInput tags={tags} onChange={onTagsChange} />
      </div>

      {/* Liner Notes & Description */}
      <div>
        <FieldLabel>Liner Notes & Description (Optional)</FieldLabel>
        <TextAreaField
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Recording location, inspiration, gear, or credits..."
        />
      </div>

      {/* Creator Governance: Comments & Discussions */}
      <GovernanceToggle
        checked={allowComments}
        onChange={onAllowCommentsChange}
        title="Discussion &amp; Comments"
        description="Allow listeners and curators to post comments and replies on this release."
      />
    </>
  )
}
