import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export interface MediaGridProps {
  children: ReactNode
  className?: string
  /**
   * How many tiles per row at the widest breakpoint. The ramp and the gutter
   * are the same everywhere, so a card never changes width between pages.
   */
  maxColumns?: 4 | 5 | 6
}

const COLUMNS: Record<number, string> = {
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-4 lg:grid-cols-5',
  6: 'md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
}

/**
 * The media grid used by every directory: home, search, releases, artists,
 * playlists, library, vault.
 *
 * Before this existed the same card was laid out with three different gutters
 * and four different column ramps, so the catalogue looked like four
 * different products.
 */
export function MediaGrid({
  children,
  className,
  maxColumns = 6,
}: MediaGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4',
        COLUMNS[maxColumns],
        className,
      )}
    >
      {children}
    </div>
  )
}
