import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '../ui/cn'
import { SvgArtworkSpiral } from '../Icons'

/** Computed once: a date in render is a purity violation and never changes. */
const YEAR = new Date().getFullYear()

export interface AuthShellProps {  children: ReactNode
  /** `narrow` is for the single-purpose screens (reset, verify, forgot). */
  variant?: 'split' | 'narrow'
  className?: string
}

/**
 * The frame every authentication screen sits in.
 *
 * Login and register were near-copies of each other, and the three
 * single-purpose screens had no frame at all — different widths, no logo, no
 * brand voice. One shell now owns all of it.
 */
export function AuthShell({
  children,
  variant = 'split',
  className,
}: AuthShellProps) {
  if (variant === 'narrow') {
    return (
      <div className={cn('w-full max-w-90', className)}>
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="text-xl tracking-tight text-foreground transition-opacity hover:opacity-80 font-medium"
          >
            Groovy
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <span aria-hidden="true">&larr;</span>
            <span>Back</span>
          </Link>
        </div>
        <div className="rounded-surface border border-border bg-card p-7 shadow-raised sm:p-9">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-surface border border-border bg-card shadow-raised lg:grid-cols-[1.05fr_1fr]',
        className,
      )}
    >
      <BrandPanel />
      <div className="flex items-center justify-center p-8 sm:p-12 lg:p-14">
        <div className="w-full max-w-90">{children}</div>
      </div>
    </div>
  )
}

/** The brand half of the split layout — copy lives here exactly once. */
export function BrandPanel() {
  return (
    <div className="relative hidden select-none overflow-hidden border-r border-border bg-muted lg:flex lg:flex-col lg:justify-between lg:p-12">
      <SvgArtworkSpiral className="pointer-events-none absolute -right-16 -bottom-16 h-80 w-80 opacity-[0.07]" />
      <div className="relative">
        <Link
          to="/"
          className="text-2xl tracking-tight text-foreground transition-opacity hover:opacity-80 font-medium"
        >
          Groovy
        </Link>
      </div>

      <div className="relative">
        <p className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
          Serentity · Curation · Preservation
        </p>
        <h2 className="mt-3 max-w-sm text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          A home for the records worth keeping.
        </h2>
        <p className="mt-3 max-w-sm text-caption leading-relaxed text-muted-foreground">
          Stream the catalogue, follow the artists you love, and keep your own
          archive in order.
        </p>
      </div>

      <p className="relative font-mono text-eyebrow text-muted-foreground/70">
        © {YEAR} Groovy
      </p>
    </div>
  )
}

export interface AuthNoticeProps {
  tone?: 'info' | 'success' | 'error'
  children: ReactNode
  className?: string
}

const NOTICE_TONE = {
  info: 'border-border bg-muted text-foreground',
  success: 'border-success/30 bg-success-soft text-foreground',
  error: 'border-destructive/30 bg-destructive-soft text-foreground',
}

/** The banner used for every message on an auth screen. */
export function AuthNotice({ tone = 'info', children, className }: AuthNoticeProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-inset border px-3.5 py-3 text-caption leading-relaxed',
        NOTICE_TONE[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}
