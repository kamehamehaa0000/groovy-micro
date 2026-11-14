import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { SectionHeading, HEADING_ACTION } from '../ui/typography'
import { StaggeredArtistScroll } from './StaggeredArtistScroll'
import type { SimilarArtistCard } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface SimilarArtistsSectionProps {
  seedArtist?: {
    id?: string
    stageName: string
    slug: string
    avatarUrl?: string | null
  } | null
  artists?: SimilarArtistCard[]
  title?: string
  subtitle?: string
  className?: string
}

export const SimilarArtistsSection = memo(function SimilarArtistsSection({
  seedArtist,
  artists,
  title,
  subtitle,
  className,
}: SimilarArtistsSectionProps) {
  if (!artists || artists.length === 0) return null

  const displayTitle =
    title || (seedArtist ? `Similar to ${seedArtist.stageName}` : 'Similar Artists')
  const displaySubtitle =
    subtitle || 'Curated artists sharing soundscapes, energy, and subculture'

  return (
    <section className={cn('min-w-0', className)}>
      <SectionHeading
        title={displayTitle}
        subtitle={displaySubtitle}
        action={
          <Link to="/artists" className={HEADING_ACTION}>
            Explore Artists &rarr;
          </Link>
        }
      />
      <StaggeredArtistScroll artists={artists} />
    </section>
  )
})
