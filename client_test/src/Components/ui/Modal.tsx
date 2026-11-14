import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'
import { Button } from './Button'
import { Eyebrow } from './typography'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** A small label above the title. */
  eyebrow?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Hides the close button in the header. */
  hideClose?: boolean
}

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
}

/**
 * The one dialog in the app.
 *
 * Six hand-rolled overlays had drifted apart (three different scrims, two
 * border radii, one that scrolled the page behind it). This is the single
 * implementation: one scrim, one panel, one way to dismiss.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'md',
  className,
  hideClose = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }

      // Keep the keyboard inside the dialog.
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog so the keyboard does not stay behind it.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      window.clearTimeout(focusTimer)
      // Give the focus back to whatever opened the dialog.
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-scrim/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'w-full rounded-t-surface border border-border bg-card shadow-floating outline-none sm:rounded-surface',
          SIZE[size],
          className,
        )}
      >
        {(title || description || eyebrow) && (
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {eyebrow ? (
                <Eyebrow className="mb-0.5">{eyebrow}</Eyebrow>
              ) : null}
              {title ? (
                <h2 className="font-semibold tracking-tight text-title text-foreground">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {hideClose ? null : (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {children ? <div className="px-5 py-4">{children}</div> : null}
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  /** An icon shown above the title, e.g. a trash can for a destructive ask. */
  icon?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** A modal that asks before doing something irreversible. */
export function ConfirmDialog({
  open,
  title,
  description,
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'mb-3 flex h-9 w-9 items-center justify-center rounded-control border border-border bg-card',
            tone === 'danger' ? 'text-destructive' : 'text-primary',
          )}
        >
          {icon}
        </span>
      ) : null}
    </Modal>
  )
}
