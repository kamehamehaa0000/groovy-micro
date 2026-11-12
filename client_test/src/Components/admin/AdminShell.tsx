import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '../ui/cn'

export interface AdminDeskNavItem {
  label: string
  to: string
  /** Optional count shown next to the label. */
  count?: number
}

export interface AdminShellProps {
  /** The page title. */
  title: ReactNode
  /** A line under the title. */
  description?: ReactNode
  /** The desks in the admin area. */
  nav: AdminDeskNavItem[]
  /** The active desk route. */
  activePath: string
  /** Controls on the right of the header. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * The frame for an admin desk.
 *
 * The two desks had their own copy of the same navigation, with different
 * markup and different active states, so they never looked like one tool.
 */
export function AdminShell({
  title,
  description,
  nav,
  activePath,
  actions,
  children,
  className,
}: AdminShellProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl text-foreground tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-caption leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      <nav
        aria-label="Admin desks"
        className="flex items-center gap-6 overflow-x-auto border-b border-border no-scrollbar"
      >
        {nav.map((item) => {
          const isActive = item.to === activePath
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b-2 pb-3 font-mono text-caption uppercase tracking-wider transition-colors',
                isActive
                  ? 'border-foreground font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              {item.count !== undefined ? ` (${item.count})` : ''}
            </Link>
          )
        })}
      </nav>

      <div className="min-w-0 pt-6">{children}</div>
    </div>
  )
}
