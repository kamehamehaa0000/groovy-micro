import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls must be announced to assistive tech. */
  'aria-label': string
  /**
   * `sm` 32px · `md` 40px · `lg` 44px.
   * Use `lg` for primary touch controls on mobile (minimum 44px target).
   */
  size?: IconButtonSize
  children: ReactNode
}

const SIZE: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
}

export function IconButton({
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control text-muted-foreground transition-all duration-150 ease-out active:scale-95 cursor-pointer motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100',
        'hover:bg-secondary/30 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
