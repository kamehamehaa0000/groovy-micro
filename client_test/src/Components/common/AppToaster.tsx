import type { CSSProperties, ReactNode } from 'react'
import { Toaster } from 'sonner'
import { Check, X } from 'lucide-react'

/**
 * App-wide toast surface (sonner), themed with the design tokens.
 *
 * Mounted once in the root route so collection menus, studio flows, and any
 * future calls to `toast()` all share the same toast placement and styling.
 */
const toastTheme = {
  '--border-radius': 'var(--radius-control)',
  '--normal-bg': 'var(--card)',
  '--normal-border': 'var(--border)',
  '--normal-text': 'var(--card-foreground)',
  '--success-bg': 'var(--success)',
  '--success-border': 'var(--success)',
  '--success-text': 'var(--success-foreground)',
  '--error-bg': 'var(--destructive)',
  '--error-border': 'var(--destructive)',
  '--error-text': 'var(--destructive-foreground)',
  '--info-bg': 'var(--info)',
  '--info-border': 'var(--info)',
  '--info-text': 'var(--info-foreground)',
  fontSize: 'var(--text-eyebrow)',
  boxShadow: 'var(--shadow-floating)',
} as CSSProperties

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-background/25">
      {children}
    </span>
  )
}

export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      richColors
      duration={5000}
      icons={{
        success: (
          <IconBadge>
            <Check className="h-3 w-3" />
          </IconBadge>
        ),
        error: (
          <IconBadge>
            <X className="h-3 w-3" />
          </IconBadge>
        ),
      }}
      toastOptions={{
        className: 'font-eyebrow uppercase tracking-wider',
        style: toastTheme,
      }}
    />
  )
}
