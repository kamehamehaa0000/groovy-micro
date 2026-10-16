import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type CardVariant = 'plain' | 'muted' | 'interactive'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: CardPadding
}

const VARIANT: Record<CardVariant, string> = {
  plain: 'border-line bg-panel',
  muted: 'border-line bg-panel/40',
  interactive:
    'border-line bg-panel/40 transition-colors hover:border-ink/20 hover:bg-canvas',
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

export function Card({
  variant = 'plain',
  padding = 'none',
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-surface border',
        VARIANT[variant],
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  )
}
