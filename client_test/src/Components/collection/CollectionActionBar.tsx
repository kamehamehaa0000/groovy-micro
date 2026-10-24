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
  /** Overflow menu / three-dot control. */
  menu?: ReactNode
  /** Secondary icon actions. */
  children?: ReactNode
  /** Rendered immediately beside the primary control (e.g. shuffle). */
  adjacentAction?: ReactNode
  className?: string
}

/**
 * Responsive collection control row, rendered outside the information header.
 *
 * Desktop → play first on the left, then secondary actions and the menu.
 * Mobile  → secondary actions and menu on the left, play pinned to the right.
 */
export function CollectionActionBar({
  onPlay,
  isPlaying = false,
  playDisabled = false,
  playLabel,
  primaryAction,
  menu,
  children,
  adjacentAction,
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
    <div className={cn('flex w-full items-center gap-1 md:gap-6', className)}>
      {primary ? (
        <div className="order-last ml-auto flex shrink-0 items-center gap-2 md:order-first md:ml-0 md:gap-3">
          {adjacentAction ? (
            <div className="md:order-last">{adjacentAction}</div>
          ) : null}
          {primary}
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
        {children}
        {menu ? <div className="shrink-0">{menu}</div> : null}
      </div>
    </div>
  )
}
