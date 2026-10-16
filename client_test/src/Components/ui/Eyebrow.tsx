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
  muted: 'text-ink-soft',
  ink: 'text-ink',
  brand: 'text-blue',
  success: 'text-success',
  danger: 'text-danger',
}

/**
 * The single replacement for the `font-mono text-[11px] uppercase
 * tracking-wider` signature that was hand-written ~528 times.
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
        'font-mono text-eyebrow font-medium uppercase',
        TONE[tone],
        className,
      )}
    >
      {children}
    </Tag>
  )
}
