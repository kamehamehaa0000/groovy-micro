import type { ReactNode } from 'react'
import { cn } from './cn'
import { Eyebrow, H3 } from './typography'

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
 * Detail pages, directories and the home shelves all used their own version
 * of this — three fonts, two border weights, two paddings. One component now
 * owns it, so a section heading looks the same everywhere.
 *
 * It is the dense variant: a hairline rule under the label. The airy variant
 * — an eyebrow, a big title and a subtitle — is `SectionHeading`.
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
        {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
        <H3 className="truncate">{title}</H3>
        {subtitle ? (
          <p className="mt-1 truncate text-caption text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
