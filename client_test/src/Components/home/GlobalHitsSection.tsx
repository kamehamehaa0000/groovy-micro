import { memo } from 'react'
import { SectionHeading } from '../ui/typography'
import { RankedTrackRow } from './RankedTrackRow'
import type { ScoredRecommendationTrack } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface GlobalHitsSectionProps {
  tracks?: ScoredRecommendationTrack[]
  currentTrackId?: string
  isPlaying?: boolean
  onPlayTrack?: (track: ScoredRecommendationTrack) => void
  title?: string
  subtitle?: string
  className?: string
}

export const GlobalHitsSection = memo(function GlobalHitsSection({
  tracks,
  currentTrackId,
  isPlaying = false,
  onPlayTrack,
  title = 'Global Hits For You',
  subtitle = 'Trending cuts in your favorite genres',
  className,
}: GlobalHitsSectionProps) {
  if (!tracks || tracks.length === 0) return null

  // Backend sends up to 8 items, neatly filling the 2 columns of 4
  const displayedTracks = tracks.slice(0, 8)

  return (
    <section className={cn('min-w-0', className)}>
      <SectionHeading title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl bg-secondary/30 border border-border/50">
        {displayedTracks.map((track, index) => (
          <RankedTrackRow
            key={track.id}
            track={track}
            rank={index + 1}
            isPlaying={isPlaying && currentTrackId === track.id}
            onPlay={onPlayTrack ? () => onPlayTrack(track) : undefined}
            to={track.albumSlug ? '/albums/$idOrSlug' : undefined}
            params={track.albumSlug ? { idOrSlug: track.albumSlug } : undefined}
          />
        ))}
      </div>
    </section>
  )
})
