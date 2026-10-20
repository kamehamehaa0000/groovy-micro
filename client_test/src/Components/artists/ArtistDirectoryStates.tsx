import type { ReactNode } from 'react'

export function ArtistEmptyPanel({
  title,
  description,
  action,
  role = 'status',
}: {
  title: string
  description?: string
  action?: ReactNode
  role?: 'status' | 'alert'
}) {
  return (
    <div
      role={role}
      className="flex flex-col items-center justify-center rounded-surface border border-dashed border-border bg-card/40 px-6 py-14 text-center"
    >
      <p className="text-title font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-caption leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ArtistGridSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading artists…</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col items-center rounded-surface border border-border bg-card p-3 sm:p-4"
          >
            <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
            <div className="mt-3 h-4 w-20 animate-pulse rounded-control bg-muted" />
            <div className="mt-2 h-3 w-14 animate-pulse rounded-control bg-muted" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded-control bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
