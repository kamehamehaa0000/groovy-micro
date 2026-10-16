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
  neutral: 'border-border bg-secondary/30 text-muted-foreground',
  ink: 'border-foreground bg-foreground text-background',
  brand: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-destructive/30 bg-destructive-soft text-destructive',
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-eyebrow text-eyebrow font-medium uppercase',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
