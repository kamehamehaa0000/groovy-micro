import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export interface SettingsNavItem {
  id: string
  label: string
  description?: string
}

export interface SettingsShellProps {
  /** The sections of the settings area. */
  nav: SettingsNavItem[]
  value: string
  onChange: (id: string) => void
  children: ReactNode
  className?: string
}

/**
 * The frame for a settings area: a navigation rail beside the content.
 *
 * The profile page used to be one very long scroll with a row of tabs on top,
 * so reaching Security meant scrolling past three other sections. A rail
 * makes every section one click away and keeps the current one obvious.
 */
export function SettingsShell({
  nav,
  value,
  onChange,
  children,
  className,
}: SettingsShellProps) {
  return (
    <div
      className={cn(
        'grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10',
        className,
      )}
    >
      <nav
        aria-label="Settings sections"
        className="lg:sticky lg:top-20 lg:self-start"
      >
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar lg:flex-col lg:gap-0.5">
          {nav.map((item) => {
            const isActive = item.id === value
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-control px-3.5 py-2 text-left font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  )
}

export interface SaveBarProps {
  /** True when the form differs from what is stored. */
  dirty: boolean
  onSave: () => void
  /** Puts the form back to the stored values. */
  onRevert?: () => void
  saving?: boolean
  saveLabel?: string
  className?: string
}

/**
 * The bar that tells you a form has unsaved changes.
 *
 * Without it, toggling a switch and navigating away loses the edit silently.
 */
export function SaveBar({
  dirty,
  onSave,
  onRevert,
  saving = false,
  saveLabel = 'Save changes',
  className,
}: SaveBarProps) {
  if (!dirty) return null

  return (
    <div
      role="status"
      className={cn(
        'sticky bottom-4 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-card/95 px-4 py-3 shadow-floating backdrop-blur-md',
        className,
      )}
    >
      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
        Unsaved changes
      </span>
      <div className="flex items-center gap-2">
        {onRevert ? (
          <button
            type="button"
            onClick={onRevert}
            disabled={saving}
            className="rounded-control border border-border px-3.5 py-2 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Revert
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-control bg-foreground px-4 py-2 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  )
}
