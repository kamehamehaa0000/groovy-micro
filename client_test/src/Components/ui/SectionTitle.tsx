import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SectionTitleProps {
  title: ReactNode
  /** Small label above the title. */
  eyebrow?: ReactNode
  subtitle?: ReactNode
  /** Optional control on the right (a link, a button, a count). */
  action?: ReactNode
  className?: string
}

/**
 * The heading of a section inside a page.
 *
 * Detail pages, directories and the home shelves all used their own version of
 * this — three fonts, two border weights, two paddings. One component now
 * owns it, so a section heading looks the same everywhere.
 */
export function SectionTitle({
  title,
  eyebrow,
  subtitle,
  action,
  className,
}: SectionTitleProps) {
  return (
    <div
      className={cn(
        'mb-3 flex items-baseline justify-between gap-4 border-b border-border-soft pb-2.5',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-0.5 font-eyebrow uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="truncate font-serif text-heading leading-tight text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-caption text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
