import { Pause, Play } from 'lucide-react'
import { cn } from '../ui/cn'

export type CollectionPlayButtonSize = 'sm' | 'lg'

export interface CollectionPlayButtonProps {
  onClick?: () => void
  isPlaying?: boolean
  disabled?: boolean
  /** Used for the accessible label/title, e.g. the playlist title. */
  label?: string
  size?: CollectionPlayButtonSize
  className?: string
}

const SIZE: Record<CollectionPlayButtonSize, string> = {
  sm: 'h-9 w-9',
  lg: 'h-14 w-14',
}

const ICON: Record<CollectionPlayButtonSize, string> = {
  sm: 'h-4 w-4',
  lg: 'h-6 w-6',
}

/**
 * Spotify-style round play control. The icon cross-fades between Play and
 * Pause, and the whole button lifts on hover / presses on tap.
 */
export function CollectionPlayButton({
  onClick,
  isPlaying = false,
  disabled = false,
  label = 'collection',
  size = 'lg',
  className,
}: CollectionPlayButtonProps) {
  const iconClass = ICON[size]
  const text = isPlaying ? `Pause ${label}` : `Play ${label}`

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={text}
      title={text}
      className={cn(
        'group relative inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised transition-transform duration-200 ease-out hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100',
        SIZE[size],
        className,
      )}
    >
      <span
        className={cn('relative flex items-center justify-center', iconClass)}
      >
        <Play
          fill="currentColor"
          className={cn(
            'absolute transition-all duration-200 ease-out motion-reduce:transition-none',
            iconClass,
            isPlaying
              ? 'scale-50 opacity-0'
              : 'translate-x-0.5 scale-100 opacity-100 group-hover:scale-110',
          )}
        />
        <Pause
          fill="currentColor"
          className={cn(
            'absolute transition-all duration-200 ease-out motion-reduce:transition-none',
            iconClass,
            isPlaying ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )}
        />
      </span>
    </button>
  )
}
