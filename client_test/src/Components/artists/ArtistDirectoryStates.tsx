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
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="flex h-[76px] max-sm:h-[68px] items-center gap-3.5 max-sm:gap-3 p-1.5 pr-2.5 rounded-full bg-secondary/70 animate-pulse"
          >
            <div className="h-16 w-16 max-sm:h-14 max-sm:w-14 rounded-full bg-muted shrink-0" />
            <div className="flex flex-col justify-center flex-1 min-w-0">
              <div className="h-4 w-28 rounded-control bg-muted" />
              <div className="mt-2 h-3 w-20 rounded-control bg-muted" />
            </div>
            <div className="h-11 w-11 rounded-full bg-muted shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
