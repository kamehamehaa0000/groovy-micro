import { memo } from 'react'
import { SectionHeading } from '../ui/typography'
import { TrackCarousel } from './ShelfSection'
import { StackedPlaylistCard } from './StackedPlaylistCard'
import type { UserPlaylistSummary } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface PlaylistsSectionProps {
  playlists?: UserPlaylistSummary[]
  title?: string
  subtitle?: string
  className?: string
}

export const PlaylistsSection = memo(function PlaylistsSection({
  playlists,
  title = 'Your Playlists',
  subtitle = 'Jump back into your personal and saved playlists',
  className,
}: PlaylistsSectionProps) {
  if (!playlists || playlists.length === 0) return null

  return (
    <section className={cn('min-w-0', className)}>
      <SectionHeading title={title} subtitle={subtitle} />
      <TrackCarousel>
        {playlists.map((playlist) => (
          <div key={playlist.id} className="w-38 sm:w-44 shrink-0">
            <StackedPlaylistCard playlist={playlist} />
          </div>
        ))}
      </TrackCarousel>
    </section>
  )
})
