import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { cn } from './cn'

export type SheetPlacement = 'bottom' | 'center'
export type SheetSize = 'sm' | 'md' | 'lg' | 'xl'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  /** `bottom` = mobile bottom sheet (drag to dismiss) · `center` = dialog. */
  placement?: SheetPlacement
  /** Centered dialogs only. */
  size?: SheetSize
  /** Bottom sheets only — hide the grab handle. */
  hideHandle?: boolean
  /** Fixed action area rendered below the scrollable content. */
  footer?: ReactNode
  className?: string
}

const SIZE: Record<SheetSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
}

/* --- gesture tuning ------------------------------------------------------- */
const DISMISS_FRACTION = 0.4 // release past this share of the height -> close
const DISMISS_VELOCITY = 0.55 // px/ms downward fling -> close regardless
const RUBBER_UP = 28 // px of give when pulled up past its natural height
const DURATION = 300

/**
 * Unified overlay shell: scrim + Escape + focus + body-scroll lock + safe-area.
 *
 * The bottom sheet is a snap sheet — grab the handle and drag; on release it
 * snaps back to rest, or dismisses if pulled far/fast enough. The centred
 * variant is a plain dialog.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  placement = 'bottom',
  size = 'md',
  hideHandle = false,
  footer,
  className,
}: SheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const drag = useRef({
    startY: 0,
    lastY: 0,
    lastT: 0,
    v: 0,
    dy: 0,
    active: false,
  })

  /* Stay mounted for the length of the close transition, then unmount. */
  useEffect(() => {
    if (open) {
      setDismissed(false)
      setDragY(0)
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const timer = window.setTimeout(() => setMounted(false), DURATION)
    return () => window.clearTimeout(timer)
  }, [open])

  // Keep the latest close callback without re-running focus/scroll effects.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /* Escape to close, lock body scroll, move focus into the panel. */
  useEffect(() => {
    // Wait for the panel to mount; the first open render still has
    // `mounted === false`, so focusing there would hit a null ref.
    if (!open || !mounted) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    const panel = panelRef.current
    // Respect an autoFocus field inside the sheet (e.g. catalog search).
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true })
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, mounted])

  const isBottom = placement === 'bottom'

  const onDragStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isBottom) return
      // Let real controls inside the header behave normally.
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
      drag.current = {
        startY: e.clientY,
        lastY: e.clientY,
        lastT: performance.now(),
        v: 0,
        dy: 0,
        active: true,
      }
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [isBottom],
  )

  const onDragMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    const now = performance.now()
    const dt = now - d.lastT || 1
    d.v = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = now
    const dy = e.clientY - d.startY
    d.dy = dy < 0 ? Math.max(dy * 0.15, -RUBBER_UP) : dy
    setDragY(d.dy)
  }, [])

  const onDragEnd = useCallback(() => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    setDragging(false)
    const height = panelRef.current?.offsetHeight ?? 0
    if (d.v > DISMISS_VELOCITY || d.dy > height * DISMISS_FRACTION) {
      setDismissed(true)
      onClose()
      return
    }
    setDragY(0) // snap back
  }, [onClose])

  if (!mounted) return null

  const hasHeader = Boolean(title || description)

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        isBottom ? 'items-end' : 'items-center justify-center p-4 sm:p-6',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={hasHeader ? titleId : undefined}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          'absolute inset-0 cursor-pointer bg-scrim backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        style={isBottom && dragging ? { translate: `0 ${dragY}px` } : undefined}
        className={cn(
          'relative z-10 flex w-full flex-col overflow-hidden bg-card shadow-floating outline-none',
          isBottom
            ? cn(
                'max-h-[90dvh] rounded-t-3xl border-t border-border pb-safe',
                'duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                dragging ? 'transition-none' : 'transition-transform',
                !dragging && (dismissed || !visible ? 'translate-y-full' : 'translate-y-0'),
              )
            : cn(
                'max-h-[85dvh] rounded-surface border border-border transition-all duration-300 ease-out motion-reduce:transition-none',
                SIZE[size],
                visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
              ),
          className,
        )}
      >
        {/* Grab handle + title row — the drag surface for the bottom sheet. */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className={cn(
            'shrink-0',
            isBottom &&
              'cursor-grab touch-none select-none active:cursor-grabbing',
          )}
        >
          {isBottom && !hideHandle ? (
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
          ) : null}

          {hasHeader ? (
            <div
              className={cn(
                'flex items-start justify-between gap-3',
                isBottom ? 'border-b border-border px-4 pt-3 pb-3' : 'px-5 pt-4 pb-4',
              )}
            >
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="truncate text-title font-semibold text-foreground"
                >
                  {title}
                </h2>
                {description ? (
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mt-0.5 -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          ) : isBottom ? (
            <div className="pb-1" />
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
