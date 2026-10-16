import type { ElementType, ReactNode } from 'react'
import { cn } from './cn'

export type EyebrowTone = 'muted' | 'ink' | 'brand' | 'success' | 'danger'

export interface EyebrowProps {
  children: ReactNode
  /** Base element. Defaults to `span`. */
  as?: ElementType
  tone?: EyebrowTone
  className?: string
}

const TONE: Record<EyebrowTone, string> = {
  muted: 'text-muted-foreground',
  ink: 'text-foreground',
  brand: 'text-primary',
  success: 'text-success',
  danger: 'text-destructive',
}

/**
 * The single replacement for the `font-mono text-[11px] uppercase
 * tracking-wider` signature that was hand-written ~528 times.
 *
 * The family comes from the `font-eyebrow` token (Inter by default) — flip
 * it in `index.css` to re-voice every label in the app.
 */
export function Eyebrow({
  children,
  as: Tag = 'span',
  tone = 'muted',
  className,
}: EyebrowProps) {
  return (
    <Tag
      className={cn(
        'font-eyebrow text-eyebrow font-medium uppercase',
        TONE[tone],
        className,
      )}
    >
      {children}
    </Tag>
  )
}
