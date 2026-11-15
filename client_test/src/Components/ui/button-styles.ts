import { cn } from './cn'

export type ButtonVariant =
  | 'primary'
  | 'brand'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'pixel'
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
  /**
   * The Pixel variant — the Material 3 button.
   *
   * The whole thing changes, not just the colour: a pill instead of a
   * 4dp corner, a 40dp target, a sentence-case label at 500 weight, and a
   * **state layer** instead of the scale-down. The layer is one colour
   * drawn over the button at 8% on hover and 12% while pressed — the detail
   * that makes an Android control feel like an Android control.
   */
  pixel:
    'relative overflow-hidden rounded-full border-transparent bg-secondary text-secondary-foreground font-medium normal-case tracking-normal transition-colors duration-200 ease-out hover:bg-accent before:absolute before:inset-0 before:rounded-full before:bg-current before:opacity-0 before:transition-opacity before:content-[""] hover:before:opacity-[0.08] active:before:opacity-[0.12] focus-visible:ring-offset-2',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-eyebrow',
  md: 'gap-2 px-4 py-2.5 text-caption',
}

/**
 * An icon-only button: a square target with no text and no padding.
 *
 * It keeps the variant's colour and its shape, so a ghost icon button is the
 * same ghost as the wordy one — just without the label.
 */
const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
}

/** The Pixel variant has its own metrics: a real height, no vertical padding. */
const PIXEL_SIZE: Record<ButtonSize, string> = {
  sm: 'gap-1.5 h-9 px-4 text-caption',
  md: 'gap-2 h-10 px-6 text-body',
}

const PIXEL_ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
}

const BASE =
  'inline-flex select-none items-center justify-center rounded-control border font-eyebrow font-semibold uppercase tracking-wider transition-all duration-150 ease-out active:scale-[0.98] cursor-pointer motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'

const PIXEL_BASE =
  'inline-flex select-none items-center justify-center cursor-pointer motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'

export interface ButtonClassesOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  block?: boolean
  /** Render as a square icon button — no label, no padding. */
  iconOnly?: boolean
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
  iconOnly = false,
  className,
}: ButtonClassesOptions = {}): string {
  if (variant === 'pixel') {
    return cn(
      PIXEL_BASE,
      VARIANT.pixel,
      iconOnly ? PIXEL_ICON_ONLY_SIZE[size] : PIXEL_SIZE[size],
      block && 'w-full',
      className,
    )
  }
  return cn(
    BASE,
    VARIANT[variant],
    iconOnly ? ICON_ONLY_SIZE[size] : SIZE[size],
    block && 'w-full',
    className,
  )
}
