import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { SectionHeading, HEADING_ACTION } from '../ui/typography'
import { BentoTrackCard, type BentoCardVariant } from './BentoTrackCard'
import type { ScoredRecommendationTrack } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface MoreLikeSongSectionProps {
  seedSong?: ScoredRecommendationTrack | null
  tracks?: ScoredRecommendationTrack[]
  currentTrackId?: string
  isPlaying?: boolean
  onPlayTrack?: (track: ScoredRecommendationTrack) => void
  title?: string
  subtitle?: string
  className?: string
}

const BENTO_VARIANTS: BentoCardVariant[] = [
  'big',
  'standard',
  'standard',
  'wide',
  'adaptive-wide',
  'adaptive-wide',
]

export const MoreLikeSongSection = memo(function MoreLikeSongSection({
  seedSong,
  tracks,
  currentTrackId,
  isPlaying = false,
  onPlayTrack,
  title,
  subtitle,
  className,
}: MoreLikeSongSectionProps) {
  if (!tracks || tracks.length === 0) return null

  const displayTitle =
    title || (seedSong ? `More Like "${seedSong.title}"` : 'More Like This')
  const displaySubtitle =
    subtitle || 'Harmonic continuity matching your repeat spin'

  // Top 6 items fill the bento geometry without gaps
  const displayedTracks = tracks.slice(0, 6)

  return (
    <section className={cn('min-w-0', className)}>
      <SectionHeading
        title={displayTitle}
        subtitle={displaySubtitle}
        action={
          <Link to="/search" className={HEADING_ACTION}>
            Explore More &rarr;
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[135px] sm:auto-rows-[155px] gap-2.5 sm:gap-3">
        {displayedTracks.map((track, index) => {
          const variant = BENTO_VARIANTS[index] || 'standard'
          return (
            <BentoTrackCard
              key={track.id}
              track={track}
              variant={variant}
              isPlaying={isPlaying && currentTrackId === track.id}
              onPlay={onPlayTrack ? () => onPlayTrack(track) : undefined}
              to={track.albumSlug ? '/albums/$idOrSlug' : undefined}
              params={
                track.albumSlug ? { idOrSlug: track.albumSlug } : undefined
              }
            />
          )
        })}
      </div>
    </section>
  )
})
