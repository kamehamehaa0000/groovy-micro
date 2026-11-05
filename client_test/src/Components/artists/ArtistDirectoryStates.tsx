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
          <div key={index} className="flex flex-col p-2.5">
            <div className="aspect-square w-full animate-pulse rounded-full bg-muted" />
            <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded-control bg-muted" />
            <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded-control bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
