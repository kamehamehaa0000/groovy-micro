import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export type ContainerWidth = 'content' | 'default' | 'wide' | 'full'

const WIDTH: Record<ContainerWidth, string> = {
  content: 'max-w-content',
  default: 'max-w-default',
  wide: 'max-w-wide',
  full: 'max-w-none',
}

export interface ContainerProps {
  /**
   * How wide the page is allowed to grow.
   *
   * - `content` — forms, settings, auth (a comfortable reading measure)
   * - `default` — detail pages: hero, track list, side rail
   * - `wide` — directories and media grids
   * - `full` — tools (studio, admin desks) that need every pixel
   */
  width?: ContainerWidth
  className?: string
  children: ReactNode
}

/**
 * The single horizontal container for the whole app.
 *
 * The shell owns the gutters; pages choose their measure through the route's
 * `staticData.layout`. Before this existed every page re-declared
 * `max-w-6xl mx-auto px-4 sm:px-8`, and the pages that needed a wider canvas
 * fought it with negative margins.
 */
export function Container({
  width = 'default',
  className,
  children,
}: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-8', WIDTH[width], className)}>
      {children}
    </div>
  )
}
