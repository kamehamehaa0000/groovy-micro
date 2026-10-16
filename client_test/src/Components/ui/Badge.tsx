import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTone =
  | 'neutral'
  | 'ink'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

const TONE: Record<BadgeTone, string> = {
  neutral: 'border-line bg-stone/30 text-ink-soft',
  ink: 'border-ink bg-ink text-canvas',
  brand: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-danger/30 bg-danger-soft text-danger',
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-eyebrow font-medium uppercase',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
