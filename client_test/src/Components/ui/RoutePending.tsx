import { cn } from './cn'

export interface RoutePendingProps {
  /** How many placeholder cards the grid shows. */
  count?: number
  className?: string
}

/**
 * What a page looks like while it is loading.
 *
 * Navigation used to drop the old page and show nothing until the new one
 * arrived, which read as a frozen app. This is the shape of a page: a
 * heading, a rule and a grid of cards. The delay before it appears
 * (`defaultPendingMs`) keeps fast navigations from flashing it.
 */
export function RoutePending({ count = 12, className }: RoutePendingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={cn('animate-in fade-in duration-150', className)}
    >
      <div className="mb-6 space-y-3">
        <div className="h-8 w-52 animate-pulse rounded-inset bg-secondary/50" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-inset bg-secondary/40" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="min-w-0">
            <div className="mb-2.5 aspect-square w-full animate-pulse rounded-inset bg-secondary/50" />
            <div className="mb-1.5 h-3.5 w-3/4 animate-pulse rounded-inset bg-secondary/40" />
            <div className="h-3 w-1/2 animate-pulse rounded-inset bg-secondary/30" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
