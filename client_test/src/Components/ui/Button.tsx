import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from './button-styles'

export type { ButtonVariant, ButtonSize }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  block?: boolean
  /**
   * Render as a square icon button — no label, no padding. The icon carries
   * the meaning, so give the button an `aria-label`.
   */
  iconOnly?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

/**
 * The button.
 *
 * `variant="pixel"` is the Material 3 button — a pill with a state layer
 * instead of a scale-down — for the surfaces that should feel like a Pixel
 * phone. The other variants keep Groovy's own voice: a 4dp corner and a
 * small-caps label.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  iconOnly = false,
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
      className={buttonClasses({ variant, size, block, iconOnly, className })}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
}
