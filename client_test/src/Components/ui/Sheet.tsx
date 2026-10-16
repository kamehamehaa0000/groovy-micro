import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export type SheetPlacement = 'bottom' | 'center'
export type SheetSize = 'sm' | 'md' | 'lg'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** `bottom` = mobile bottom sheet · `center` = centered dialog. */
  placement?: SheetPlacement
  /** Centered dialogs only. */
  size?: SheetSize
  className?: string
}

const SIZE: Record<SheetSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
}

/**
 * Unified overlay shell: scrim + Escape-to-close + body-scroll lock +
 * safe-area + capped height. Replaces the bespoke modal/sheet chrome.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  placement = 'bottom',
  size = 'md',
  className,
}: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const isBottom = placement === 'bottom'

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-scrim backdrop-blur-sm"
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden border-border bg-card shadow-floating',
          isBottom
            ? 'mt-auto rounded-t-2xl border-t pb-safe'
            : 'mx-4 m-auto rounded-surface border',
          !isBottom && SIZE[size],
          className,
        )}
      >
        {title ? (
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <span className="font-mono text-eyebrow font-semibold uppercase text-foreground">
              {title}
            </span>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  )
}
