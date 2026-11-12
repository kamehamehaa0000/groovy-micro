import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export interface ResultSectionProps {
  /** Section title, e.g. "Tracks". */
  title: string
  /** Number of results in the section. */
  count: number
  /** Optional control on the right ("View all", "Browse all"). */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * One section of the search results.
 *
 * The page had five of these — tracks, artists, releases, playlists and
 * community — each with its own copy of the same header: a serif italic
 * title, a parenthesised count and a "View all" link, separated by a hair
 * line. Five copies of a header drift apart the moment one of them is
 * edited. One component owns it now.
 */
export function ResultSection({
  title,
  count,
  action,
  children,
  className,
}: ResultSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-lg font-semibold italic text-foreground sm:text-heading">
            {title}
          </h3>
          <span className="font-eyebrow text-eyebrow tabular-nums uppercase tracking-widest text-muted-foreground">
            ({count})
          </span>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * The "View all" link that narrows the search to one category.
 */
export function ResultSectionLink({
  onClick,
  children = 'View all →',
}: {
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer font-eyebrow text-eyebrow uppercase tracking-wider text-primary transition-colors hover:text-foreground"
    >
      {children}
    </button>
  )
}
