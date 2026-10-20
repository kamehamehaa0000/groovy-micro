import type { ReactNode } from 'react'

export function PlaylistEmptyPanel({
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

export function PlaylistGridSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading playlists…</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="flex animate-pulse flex-col gap-2.5 rounded-surface border border-border/40 bg-card/40 p-2.5"
          >
            <div className="aspect-square w-full rounded-inset bg-secondary/20" />
            <div className="h-3 w-3/4 rounded-control bg-secondary/20" />
            <div className="h-2.5 w-1/2 rounded-control bg-secondary/20" />
          </div>
        ))}
      </div>
    </div>
  )
}
