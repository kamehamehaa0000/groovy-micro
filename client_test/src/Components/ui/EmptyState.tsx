import type { ReactNode } from 'react'
import { cn } from './cn'
import { Button } from './Button'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  /** The single next step, if there is one. */
  action?: ReactNode
  className?: string
}

/**
 * The one way this app says "there is nothing here".
 *
 * Every list, grid and feed used to invent its own dashed-border box, which
 * meant four slightly different empty pages in one product.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-surface border border-dashed border-border bg-card/40 px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-primary">
          {icon}
        </div>
      ) : null}
      <p className="font-serif text-title text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-caption leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export interface ErrorStateProps {
  title?: string
  description?: ReactNode
  onRetry?: () => void
  className?: string
}

/** The one way this app says "that did not work". */
export function ErrorState({
  title = 'Something went wrong',
  description = 'The request could not be completed. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-surface border border-destructive/30 bg-destructive-soft/40 px-6 py-14 text-center',
        className,
      )}
    >
      <p className="font-serif text-title text-foreground">{title}</p>
      <p className="mt-1.5 max-w-sm text-caption leading-relaxed text-muted-foreground">
        {description}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export interface SkeletonProps {
  className?: string
}

/** A single shimmering placeholder. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-inset bg-secondary/50', className)}
    />
  )
}

export interface SkeletonGridProps {
  count?: number
  className?: string
  /** Tailwind class for a single item, e.g. "aspect-square". */
  itemClassName?: string
}

/** A grid of placeholders that matches the shape of the real content. */
export function SkeletonGrid({
  count = 8,
  className,
  itemClassName = 'aspect-square',
}: SkeletonGridProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={cn(itemClassName, 'w-full')} />
      ))}
    </div>
  )
}
