import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Image URL. Falls back to the name's initial when absent. */
  src?: string | null
  name: string
  size?: AvatarSize
}

const SIZE: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-eyebrow',
  sm: 'h-8 w-8 text-caption',
  md: 'h-10 w-10 text-body',
  lg: 'h-12 w-12 text-title',
  xl: 'h-14 w-14 text-heading',
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Round identity image with a deterministic initial fallback.
 *
 * The image is decorative (`alt=""`) — the surrounding link or text always
 * carries the name, so announcing it twice would be noise for screen readers.
 */
export function Avatar({
  src,
  name,
  size = 'md',
  className,
  ...rest
}: AvatarProps) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-eyebrow font-semibold uppercase text-muted-foreground',
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        initialOf(name)
      )}
    </span>
  )
}
