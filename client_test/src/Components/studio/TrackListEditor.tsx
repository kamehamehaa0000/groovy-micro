/**
 * The editable cut list shared by the create and edit release drawers.
 *
 * Both drawers rendered the same row — index, title, genre, explicit flag,
 * duration, acoustics, credits — with the same classes and the same per-field
 * reducers, differing only in copy and in whether the row carries an audio
 * uploader. That uploader (and the remove-cut button that rides beside it) is
 * handed back to the create flow through `renderTools`, so the editor never
 * learns about upload state, and the edit flow simply passes no tools.
 */
import type { ReactNode } from 'react'
import { formatDuration } from '../../lib/catalog.api'
import type { StudioTrackDraft } from './studio.types'
import {
  AcousticsRow,
  CreditPickerField,
  ExplicitCheckbox,
  MonoInput,
  SerifInput,
} from './fields'

export interface TrackListEditorProps<T extends StudioTrackDraft> {
  tracks: T[]
  /** Merge a patch into one cut; each call site keeps its own state reducer. */
  onUpdateTrack: (id: string, patch: Partial<T>) => void
  /** Per-cut extras, rendered between the field grid and the acoustics row. */
  renderTools?: (track: T, index: number) => ReactNode
  /** Credit heading copy — the two drawers describe the same field differently. */
  creditLabel: string
  /** The create flow wraps the credit heading in a justified row. */
  creditHeadingRow?: boolean
  genrePlaceholder: string
  currentArtistId?: string
}

export function TrackListEditor<T extends StudioTrackDraft>({
  tracks,
  onUpdateTrack,
  renderTools,
  creditLabel,
  creditHeadingRow = false,
  genrePlaceholder,
  currentArtistId,
}: TrackListEditorProps<T>) {
  // A concrete patch cannot be checked against `Partial<T>` while T is still a
  // type parameter, so the single widening lives here.
  const patch = (id: string, next: Partial<StudioTrackDraft>) =>
    onUpdateTrack(id, next as Partial<T>)

  return (
    <div className="space-y-3">
      {tracks.map((track, idx) => (
        <div
          key={track.id}
          className="p-3.5 border border-border bg-background space-y-3"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="font-mono text-caption text-muted-foreground w-6">
              {String(idx + 1).padStart(2, '0')}
            </span>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
              <SerifInput
                type="text"
                required
                placeholder="Cut Title"
                value={track.title}
                onChange={(e) => patch(track.id, { title: e.target.value })}
                compact
              />

              <MonoInput
                type="text"
                placeholder={genrePlaceholder}
                value={track.genre}
                onChange={(e) => patch(track.id, { genre: e.target.value })}
                size="sm"
              />

              <div className="flex items-center gap-2">
                <ExplicitCheckbox
                  checked={track.isExplicit}
                  onChange={(isExplicit) => patch(track.id, { isExplicit })}
                />

                {track.durationSeconds > 0 && (
                  <span className="font-mono text-eyebrow text-muted-foreground ml-auto">
                    {formatDuration(track.durationSeconds)}
                  </span>
                )}
              </div>
            </div>

            {renderTools?.(track, idx)}
          </div>

          <AcousticsRow
            bpm={track.bpm}
            musicalKey={track.musicalKey}
            onBpmChange={(bpm) => patch(track.id, { bpm })}
            onKeyChange={(musicalKey) => patch(track.id, { musicalKey })}
          />

          <CreditPickerField
            credits={track.credits || []}
            onChange={(credits) => patch(track.id, { credits })}
            currentArtistId={currentArtistId}
            label={creditLabel}
            divider="faint"
            headingRow={creditHeadingRow}
          />
        </div>
      ))}
    </div>
  )
}
