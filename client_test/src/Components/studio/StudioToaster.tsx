import type { CSSProperties, ReactNode } from 'react'
import { Toaster } from 'sonner'
import { Check, X } from 'lucide-react'

/**
 * Studio's toast surface (sonner), themed with the design tokens.
 *
 * Mounted inside the studio route rather than the app root so the dependency
 * stays scoped to `/studio`. Colours are driven by the same role tokens the
 * rest of the studio uses, so the `.dark` overrides apply automatically.
 *
 * Three sonner details worth knowing:
 *  - its stylesheet sets `font-size: 13px` on the toast with a higher
 *    specificity than a utility class, so the eyebrow type role's size is
 *    applied as an inline style here (inline beats the stylesheet);
 *  - `richColors` turns on the per-type fill, which we then re-point at our
 *    own `--success` / `--destructive` / `--info` role tokens;
 *  - placement is set in `index.css` rather than via the `offset` props,
 *    because the toast has to clear the mini player, which stays visible until
 *    `md` (768px) while sonner's own mobile breakpoint is 600px.
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

export function StudioToaster() {
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
