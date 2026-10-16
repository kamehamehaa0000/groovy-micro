import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant =
  | 'primary'
  | 'brand'
  | 'outline'
  | 'ghost'
  | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  block?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const VARIANT: Record<ButtonVariant, string> = {
  /* Groovy's signature CTA: solid ink, brand-blue on hover. */
  primary:
    'border-ink bg-ink text-canvas hover:border-blue hover:bg-blue hover:text-white',
  brand: 'border-blue bg-blue text-canvas hover:border-blue-deep hover:bg-blue-deep',
  outline:
    'border-line bg-transparent text-ink hover:border-blue hover:text-blue',
  ghost:
    'border-transparent bg-transparent text-ink-soft hover:bg-stone/20 hover:text-ink',
  danger:
    'border-danger/40 bg-transparent text-danger hover:border-danger hover:bg-danger hover:text-white',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-eyebrow',
  md: 'gap-2 px-4 py-2.5 text-caption',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  leftIcon,
  rightIcon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-control border font-mono font-semibold uppercase tracking-wider transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
}
