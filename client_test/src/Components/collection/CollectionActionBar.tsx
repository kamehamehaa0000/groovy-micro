import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { CollectionPlayButton } from './CollectionPlayButton'

export interface CollectionActionBarProps {
  /** Primary play handler. Omit the whole control by leaving this undefined. */
  onPlay?: () => void
  isPlaying?: boolean
  playDisabled?: boolean
  playLabel?: string
  /**
   * Replace the round play button with another primary control (for example an
   * upcoming release's round pre-save button).
   */
  primaryAction?: ReactNode
  /** Shuffle / play-in-order toggle. */
  shuffle?: ReactNode
  /** Save to library / like. */
  save?: ReactNode
  /** Share / copy link. */
  share?: ReactNode
  /** Overflow menu / three-dot control. */
  menu?: ReactNode
  /** Anything else, rendered after the standard slots. */
  children?: ReactNode
  className?: string
}

/**
 * Responsive collection control row, rendered outside the information header.
 *
 * The order is fixed for every collection — play, shuffle, save, share,
 * overflow — so an album, an artist, a playlist and a radio all answer the
 * same way. On mobile the primary control pins to the right and the secondary
 * actions collect on the left, which is what people expect from a player.
 */
export function CollectionActionBar({
  onPlay,
  isPlaying = false,
  playDisabled = false,
  playLabel,
  primaryAction,
  shuffle,
  save,
  share,
  menu,
  children,
  className,
}: CollectionActionBarProps) {
  const primary =
    primaryAction ??
    (onPlay ? (
      <CollectionPlayButton
        onClick={onPlay}
        isPlaying={isPlaying}
        disabled={playDisabled}
        label={playLabel}
      />
    ) : null)

  return (
    <div className={cn('flex w-full items-center gap-1 md:gap-2', className)}>
      {primary ? (
        <div className="order-last ml-auto shrink-0 md:order-none md:ml-0">
          {primary}
        </div>
      ) : null}

      {shuffle ? <div className="shrink-0">{shuffle}</div> : null}
      {save ? <div className="shrink-0">{save}</div> : null}
      {share ? <div className="shrink-0">{share}</div> : null}
      {children}
      {menu ? <div className="shrink-0">{menu}</div> : null}
    </div>
  )
}
