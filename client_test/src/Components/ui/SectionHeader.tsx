import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SectionHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Pin directly under the 3.5rem app header (`top-14`). */
  sticky?: boolean
  className?: string
}

/** Page / sub-section header. Replaces the hand-rolled sticky headers. */
export function SectionHeader({
  title,
  eyebrow,
  description,
  actions,
  sticky = false,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        'z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-background/90 px-4 py-2.5 backdrop-blur-md',
        sticky && 'sticky top-14',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="font-eyebrow text-eyebrow font-medium uppercase text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="truncate font-serif text-heading text-foreground">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
