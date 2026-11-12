import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '../ui/cn'
import { ProceduralCover } from '../common/ProceduralCover'
import { ArrowRight, PlayIcon } from 'lucide-react'

export interface RadioPillProps {
  id?: string
  title: string
  subtitle?: string
  category?: string
  imageUrl?: string | null
  to?: string
  params?: Record<string, string>
  href?: string
  isPlaying?: boolean
  onClick?: () => void
  onPlay?: () => void
  className?: string
  /**
   * 'default': h-20
   * 'compact': h-16 on mobile, h-20 on tablet/desktop (h-16 sm:h-20)
   */
  size?: 'default' | 'compact'
  haveBorder?: boolean
}

export const RadioPill = memo(function RadioPill({
  title,
  subtitle,
  category = 'Radio mix',
  imageUrl,
  to,
  params,
  href,
  isPlaying = false,
  onClick,
  onPlay,
  className,
  size = 'default',
  haveBorder = false,
}: RadioPillProps) {
  const isCompact = size === 'compact'
  const heightClass = isCompact ? 'h-14 sm:h-20' : 'h-20'
  const border = haveBorder ? 'dark:border dark:border-border ' : ''
  const content = (
    <>
      {/* Left Cover Image Container */}
      <div
        className={cn(
          'relative shrink-0 overflow-hidden bg-muted',
          isCompact ? 'w-[25%] sm:w-[30%]' : 'w-[44%] sm:w-[46%]',
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
          />
        ) : (
          <ProceduralCover title={title} fill />
        )}

        {/* Optional Play Button / Playing Animation (Omitted for purely navigational pills) */}
        {onPlay && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onPlay()
            }}
            aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <PlayIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Right Content Area */}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-2',
          isCompact
            ? 'pl-3.5 pr-4 sm:pl-5 sm:pr-6'
            : 'pl-4 pr-5 sm:pl-5 sm:pr-6',
        )}
      >
        <div className="min-w-0">
          <p className="font-eyebrow text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/60 dark:text-muted-foreground">
            {category}
          </p>
          <h3
            className={cn(
              'truncate font-semibold leading-tight text-primary-foreground dark:text-card-foreground',
              isCompact ? 'mt-0.5 text-sm sm:text-base' : 'mt-1 text-base',
            )}
          >
            {title}
          </h3>
          {!isCompact && subtitle && (
            <p className="mt-0.5 truncate text-xs text-primary-foreground/70 dark:text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {/* /* Sliding Arrow on Hover  */}
        <div
          aria-hidden="true"
          className="hidden sm:block shrink-0 -translate-x-1 text-primary-foreground/80 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 dark:text-card-foreground"
        >
          <ArrowRight className="h-5 w-5" />
        </div>
      </div>
    </>
  )

  const containerClasses = cn(
    'group flex w-full select-none overflow-hidden rounded-full transition-colors',
    heightClass,
    'bg-primary text-primary-foreground hover:bg-primary-strong',
    'dark:bg-card dark:text-card-foreground dark:hover:bg-accent dark:hover:border-foreground/20',
    'shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
    border,
    className,
  )

  if (to) {
    return (
      <Link
        to={to as any}
        params={params as any}
        onClick={onClick}
        className={containerClasses}
      >
        {content}
      </Link>
    )
  }

  if (href) {
    return (
      <a href={href} onClick={onClick} className={containerClasses}>
        {content}
      </a>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick || onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ;(onClick || onPlay)?.()
        }
      }}
      className={cn(containerClasses, 'cursor-pointer')}
    >
      {content}
    </div>
  )
})
