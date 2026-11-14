import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from './button-styles'

export interface ButtonLinkProps {
  /** The route to go to. */
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  block?: boolean
  className?: string
  children: ReactNode
}

/**
 * A link that looks exactly like a button.
 *
 * Eleven call sites were styling a `Link` by hand — copying the button's
 * padding, radius and hover — so they drifted from the real button and from
 * each other. This is the same `Button`, rendered as a link.
 */
export function ButtonLink({
  to,
  params,
  search,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
}: ButtonLinkProps) {
  return (
    <Link
      to={to as never}
      params={params as never}
      search={search as never}
      className={buttonClasses({ variant, size, block, className })}
    >
      {children}
    </Link>
  )
}
