import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export interface CollectionCoverProps {
  /** The artwork node (image, mosaic, procedural cover, …). */
  cover: ReactNode
  /** Floating control rendered on the artwork (artwork edit, like, …). */
  action?: ReactNode
  className?: string
}

/**
 * Square collection artwork.
 *
 * The cover is intentionally information-free: the title, badges and metadata
 * live beside it in the collection header, matching the reference layout.
 */
export function CollectionCover({
  cover,
  action,
  className,
}: CollectionCoverProps) {
  return (
    <div
      className={cn(
        'group relative aspect-square w-[220px] max-w-full shrink-0 overflow-hidden rounded-surface border border-border bg-muted shadow-floating transition-transform duration-500 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:w-[232px]',
        className,
      )}
    >
      <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
        {cover}
      </div>

      {action ? (
        <div className="absolute right-3 top-3 z-20">{action}</div>
      ) : null}
    </div>
  )
}
