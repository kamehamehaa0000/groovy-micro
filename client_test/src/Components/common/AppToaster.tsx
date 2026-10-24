import type { CSSProperties, ReactNode } from 'react'
import { Toaster } from 'sonner'
import { Check, Info, X } from 'lucide-react'
import { TOAST } from '../../lib/toast'
import { cn } from '../ui/cn'

/**
 * App-wide toast surface (sonner), themed with the design tokens.
 *
 * Mounted once in the root route. Placement, timing, and stack size come from
 * `TOAST` in `src/lib/toast.ts`; call sites should use `notify` from there too
 * so the whole app stays in sync.
 */
const toastTheme = {
  '--border-radius': 'var(--radius-control)',
  '--normal-bg': 'var(--card)',
  '--normal-border': 'var(--border)',
  '--normal-text': 'var(--card-foreground)',
  fontSize: 'var(--text-caption)',
  boxShadow: 'var(--shadow-floating)',
} as CSSProperties

function IconBadge({
  tone,
  children,
}: {
  tone: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center',
        tone,
      )}
    >
      {children}
    </span>
  )
}

export function AppToaster() {
  return (
    <Toaster
      position={TOAST.position}
      duration={TOAST.duration}
      visibleToasts={TOAST.visibleToasts}
      offset={TOAST.offset}
      mobileOffset={TOAST.mobileOffset}
      icons={{
        success: (
          <IconBadge tone="text-success">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </IconBadge>
        ),
        error: (
          <IconBadge tone="text-destructive">
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </IconBadge>
        ),
        info: (
          <IconBadge tone="text-info">
            <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
          </IconBadge>
        ),
      }}
      toastOptions={{
        className: 'font-sans',
        style: toastTheme,
      }}
    />
  )
}
