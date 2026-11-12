import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '../ui/cn'
import { SectionTitle } from '../ui/SectionTitle'

export interface ShelfSectionProps {
  title: string
  subtitle?: ReactNode
  /** Optional link on the right, e.g. "See all". */
  action?: { label: string; to: string }
  children: ReactNode
  className?: string
}

/**
 * One shelf on the home page.
 *
 * The header used to be copy-pasted seven times in three slightly different
 * styles. One header, one rule, one optional action.
 */
export function ShelfSection({
  title,
  subtitle,
  action,
  children,
  className,
}: ShelfSectionProps) {
  return (
    <section className={cn('min-w-0', className)}>
      <SectionTitle
        title={title}
        subtitle={subtitle}
        action={
          action ? (
            <Link
              to={action.to}
              className="font-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              {action.label}
            </Link>
          ) : null
        }
      />
      {children}
    </section>
  )
}

export interface TrackCarouselProps {
  children: ReactNode
  className?: string
}

/**
 * A horizontally scrolling shelf.
 *
 * The scrollbar is hidden, so the shelf needs an affordance: the edges fade
 * out, the items snap, and the whole strip is keyboard reachable.
 */
export function TrackCarousel({ children, className }: TrackCarouselProps) {
  return (
    <div className={cn('relative -mx-4 px-4 sm:mx-0 sm:px-0', className)}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  )
}
