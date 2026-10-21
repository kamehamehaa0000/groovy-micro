import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export interface CollectionStickyHeaderProps {
  /** Fades/slides the bar in once the large title has scrolled away. */
  visible: boolean
  title: string
  subtitle?: ReactNode
  /** Small cover thumbnail. Desktop only — mobile shows the title alone. */
  thumbnail?: ReactNode
  className?: string
}

/**
 * Slim title bar that replaces the collection hero while scrolling.
 *
 * On mobile it is intentionally just the title as a heading; on desktop it
 * gains the cover thumbnail and subtitle. Controls stay in the action row and
 * are never duplicated in the sticky header.
 */
export function CollectionStickyHeader({
  visible,
  title,
  subtitle,
  thumbnail,
  className,
}: CollectionStickyHeaderProps) {
  return (
    <div className={cn('pointer-events-none sticky top-14 z-30 h-0', className)}>
      <div
        aria-hidden={!visible}
        className={cn(
          'border-b border-border bg-background/90 backdrop-blur-xl transition-all duration-300 ease-out motion-reduce:transition-none',
          visible
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : '-translate-y-full opacity-0',
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-8">
          {thumbnail ? (
            <div className="hidden h-9 w-9 shrink-0 overflow-hidden rounded-inset border border-border bg-muted md:block">
              {thumbnail}
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <p
              className="truncate font-serif italic text-heading leading-tight text-foreground"
              title={title}
            >
              {title}
            </p>
            {subtitle ? (
              <p className="hidden truncate font-sans text-caption text-muted-foreground md:block">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
