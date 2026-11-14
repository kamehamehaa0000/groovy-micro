import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { PlayIconSVG, PauseIconSVG } from '../Icons'
import { ProceduralCover } from '../common/ProceduralCover'
import type { ScoredRecommendationTrack } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export type BentoCardVariant = 'big' | 'wide' | 'standard' | 'adaptive-wide'

export interface BentoTrackCardProps {
  track: ScoredRecommendationTrack
  variant?: BentoCardVariant
  isPlaying?: boolean
  onPlay?: () => void
  to?: string
  params?: Record<string, string>
  className?: string
}

export const BentoTrackCard = memo(function BentoTrackCard({
  track,
  variant = 'standard',
  isPlaying = false,
  onPlay,
  to,
  params,
  className,
}: BentoTrackCardProps) {
  const isBig = variant === 'big'
  const isWide = variant === 'wide'
  const isAdaptiveWide = variant === 'adaptive-wide'

  const spanClasses = isBig
    ? 'col-span-2 row-span-2 p-5 sm:p-6'
    : isWide
      ? 'col-span-2 row-span-1 p-3.5 sm:p-4'
      : isAdaptiveWide
        ? 'col-span-1 md:col-span-2 row-span-1 p-3 sm:p-4'
        : 'col-span-1 row-span-1 p-3 sm:p-3.5'

  const content = (
    <div
      className={cn(
        'relative rounded-2xl sm:rounded-3xl overflow-hidden text-white group select-none shadow-xs flex flex-col justify-end transition-all w-full h-full min-w-0',
        spanClasses,
        className,
      )}
    >
      {/* 1. Full-bleed Background Artwork */}
      {track.coverImageUrl ? (
        <img
          src={track.coverImageUrl}
          alt={track.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full">
          <ProceduralCover
            fill
            title={track.title}
            artistName={track.artistStageName}
            className="w-full h-full"
          />
        </div>
      )}

      {/* 2. Legibility Gradient Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />

      {/* 3. Top-Right Play Action FAB */}
      {onPlay && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPlay()
          }}
          className={cn(
            'absolute top-3 right-3 w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all flex items-center justify-center z-20 cursor-pointer shadow-sm',
            isPlaying
              ? 'bg-white text-black scale-100'
              : 'bg-black/40 hover:bg-white hover:text-black text-white hover:scale-105 active:scale-95',
          )}
          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {isPlaying ? (
            <PauseIconSVG className="w-3.5 h-3.5 fill-current" />
          ) : (
            <PlayIconSVG className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </button>
      )}

      {/* 4. Overlay Metadata Inside Card */}
      <div className="relative z-10 min-w-0 pr-6">
        {isBig ? (
          <>
            <h4 className="font-serif text-xl sm:text-2xl lg:text-3xl font-semibold leading-tight text-white mb-1 line-clamp-2">
              {track.title}
            </h4>
            <p className="text-body text-white/80 font-medium truncate">
              {track.artistStageName}
            </p>
          </>
        ) : (
          <>
            <div className="font-semibold text-body leading-snug text-white truncate">
              {track.title}
            </div>
            <div className="text-caption text-white/80 truncate mt-0.5">
              {track.artistStageName}
            </div>
          </>
        )}
      </div>
    </div>
  )

  if (to) {
    return (
      <Link
        to={to as any}
        params={params as any}
        className={cn(
          'block min-w-0 text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl sm:rounded-3xl',
          isBig
            ? 'col-span-2 row-span-2'
            : isWide
              ? 'col-span-2 row-span-1'
              : isAdaptiveWide
                ? 'col-span-1 md:col-span-2 row-span-1'
                : 'col-span-1 row-span-1',
        )}
      >
        {content}
      </Link>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPlay?.()
        }
      }}
      className={cn(
        'block min-w-0 text-inherit no-underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl sm:rounded-3xl',
        isBig
          ? 'col-span-2 row-span-2'
          : isWide
            ? 'col-span-2 row-span-1'
            : isAdaptiveWide
              ? 'col-span-1 md:col-span-2 row-span-1'
              : 'col-span-1 row-span-1',
      )}
    >
      {content}
    </div>
  )
})
