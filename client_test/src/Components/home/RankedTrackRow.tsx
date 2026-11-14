import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { PlayIconSVG, PauseIconSVG } from '../Icons'
import { ProceduralCover } from '../common/ProceduralCover'
import type { ScoredRecommendationTrack } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface RankedTrackRowProps {
  track: ScoredRecommendationTrack
  rank: number
  isPlaying?: boolean
  onPlay?: () => void
  to?: string
  params?: Record<string, string>
  className?: string
}

export const RankedTrackRow = memo(function RankedTrackRow({
  track,
  rank,
  isPlaying = false,
  onPlay,
  to,
  params,
  className,
}: RankedTrackRowProps) {
  const content = (
    <div
      className={cn(
        'group flex items-center gap-3 p-2 sm:p-2.5 rounded-2xl hover:bg-secondary/70 active:scale-[0.99] transition-all select-none w-full min-w-0',
        className,
      )}
    >
      {/* 1. Rank Number */}
      <span className="w-5 sm:w-6 text-center font-mono text-caption font-semibold text-muted-foreground shrink-0">
        {rank}
      </span>

      {/* 2. Cover Artwork */}
      <div className="relative w-13 h-13 sm:w-14 sm:h-14 rounded-xl shrink-0 overflow-hidden bg-muted">
        {track.coverImageUrl ? (
          <img
            src={track.coverImageUrl}
            alt={track.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <ProceduralCover
            fill
            title={track.title}
            artistName={track.artistStageName}
            className="rounded-xl"
          />
        )}
      </div>

      {/* 3. Track Details */}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-body truncate text-foreground group-hover:text-primary transition-colors">
          {track.title}
        </div>
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground mt-0.5 truncate">
          <span className="inline-block px-1.5 py-0.5 rounded-control font-eyebrow text-eyebrow font-semibold bg-secondary text-foreground shrink-0">
            {track.albumType || 'Track'}
          </span>
          <span className="truncate">{track.artistStageName}</span>
        </div>
      </div>

      {/* 4. Play Button */}
      {onPlay && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPlay()
          }}
          className={cn(
            'w-9 h-9 rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer',
            isPlaying
              ? 'bg-primary text-primary-foreground shadow-sm scale-100'
              : 'bg-secondary hover:bg-foreground hover:text-background text-foreground hover:scale-105 active:scale-95',
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
    </div>
  )

  if (to) {
    return (
      <Link
        to={to as any}
        params={params as any}
        className="flex w-full min-w-0 text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
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
      className="flex w-full min-w-0 text-inherit no-underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
    >
      {content}
    </div>
  )
})
