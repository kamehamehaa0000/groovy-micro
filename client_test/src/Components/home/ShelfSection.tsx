import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
 * The scrollbar is hidden, so the shelf needs an affordance: arrow buttons,
 * fading edges and snapping. The arrows are real buttons, so the shelf is
 * usable with the keyboard.
 */
export function TrackCarousel({ children, className }: TrackCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateEdges = useCallback(() => {
    const node = trackRef.current
    if (!node) return
    const maxScroll = node.scrollWidth - node.clientWidth
    setCanScrollLeft(node.scrollLeft > 4)
    setCanScrollRight(node.scrollLeft < maxScroll - 4)
  }, [])

  useEffect(() => {
    updateEdges()
    const node = trackRef.current
    if (!node) return
    node.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    return () => {
      node.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
    }
  }, [updateEdges])

  const scrollBy = (direction: 1 | -1) => {
    const node = trackRef.current
    if (!node) return
    node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <div className={cn('group/carousel relative', className)}>
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Edge fades tell you there is more to the side. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r from-background to-transparent opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100',
          canScrollLeft && 'opacity-100',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-background to-transparent opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100',
          canScrollRight && 'opacity-100',
        )}
      />

      {/* Arrows: hover on a pointer, always reachable with the keyboard. */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="absolute -left-3 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground opacity-0 shadow-floating transition-opacity hover:bg-card focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover/carousel:opacity-100 md:flex"
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="absolute -right-3 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground opacity-0 shadow-floating transition-opacity hover:bg-card focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover/carousel:opacity-100 md:flex"
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}
