import { cn } from './cn'

export type ButtonVariant =
  | 'primary'
  | 'brand'
  | 'outline'
  | 'ghost'
  | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  /* Groovy's signature CTA: solid ink, brand-primary on hover. */
  primary:
    'border-foreground bg-foreground text-background hover:border-primary hover:bg-primary hover:text-primary-foreground',
  brand:
    'border-primary bg-primary text-primary-foreground hover:border-primary-strong hover:bg-primary-strong',
  outline:
    'border-border bg-transparent text-foreground hover:border-primary hover:text-primary',
  ghost:
    'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/20 hover:text-foreground',
  danger:
    'border-destructive/40 bg-transparent text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-eyebrow',
  md: 'gap-2 px-4 py-2.5 text-caption',
}

const BASE =
  'inline-flex select-none items-center justify-center rounded-control border font-eyebrow font-semibold uppercase tracking-wider transition-all duration-150 ease-out active:scale-[0.98] cursor-pointer motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'

export interface ButtonClassesOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  block?: boolean
  className?: string
}

/**
 * The classes of a button.
 *
 * Shared with `ButtonLink` so a link that looks like a button is the same
 * button, down to the focus ring and the disabled state.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: ButtonClassesOptions = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], block && 'w-full', className)
}
