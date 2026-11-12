import { cn } from '../ui/cn'

export interface TrackListHeaderProps {
  /**
   * What sits in the leading cell.
   * - `number` — a track number (album and playlist style)
   * - `artwork` — a thumbnail (radio / queue style)
   */
  leading?: 'number' | 'artwork'
  /** Show the streams column (only when the rows show it too). */
  showPlays?: boolean
  className?: string
}

/**
 * The column header for a track list.
 *
 * The widths here are the widths `SongRow` uses, so the header and the rows
 * line up. Two pages had hand-written headers that did not: one showed a
 * "#" column above rows that render artwork, and both reserved 30rem for a
 * duration column that is 11rem wide.
 */
export function TrackListHeader({
  leading = 'number',
  showPlays = true,
  className,
}: TrackListHeaderProps) {
  return (
    <div
      className={cn(
        'hidden items-center justify-between gap-4 border-b border-border/60 px-2 py-2.5 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground sm:flex sm:px-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {leading === 'number' ? (
          <span className="w-6 text-center">#</span>
        ) : (
          <span className="w-11 sm:w-10" aria-hidden="true" />
        )}
        <span>Title</span>
      </div>
      {showPlays ? <div className="w-24 shrink-0 text-right">Streams</div> : null}
      <div className="w-11 shrink-0 text-right">Duration</div>
    </div>
  )
}
