import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { ProceduralCover } from '../common/ProceduralCover'
import type { SimilarArtistCard } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface StaggeredArtistScrollProps {
  artists: SimilarArtistCard[]
  className?: string
}

export const StaggeredArtistScroll = memo(function StaggeredArtistScroll({
  artists,
  className,
}: StaggeredArtistScrollProps) {
  if (!artists || artists.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-start overflow-x-auto pb-6 pt-3 px-1 scrollbar-none snap-x snap-mandatory min-w-0',
        className,
      )}
    >
      {artists.map((artist) => (
        <Link
          key={artist.id}
          to="/artists/$idOrSlug"
          params={{ idOrSlug: artist.slug }}
          className="w-24 sm:w-28 md:w-32 shrink-0 snap-center text-center transition-transform hover:-translate-y-1.5 duration-200 group relative -ml-3 sm:-ml-6 first:ml-0 even:mt-5 sm:even:mt-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
        >
          {/* Circular Avatar with 4px cut-out border */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full border-4 border-background bg-muted shadow-sm overflow-hidden relative mx-auto group-hover:border-primary/25 transition-colors">
            {artist.avatarUrl ? (
              <img
                src={artist.avatarUrl}
                alt={artist.stageName}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <ProceduralCover
                fill
                title={artist.stageName}
                artistName={artist.stageName}
                className="rounded-full"
              />
            )}
          </div>

          {/* Artist Stage Name & Genre */}
          <div className="mt-2 w-full px-1">
            <span className="text-body font-semibold text-foreground group-hover:text-primary transition-colors truncate block">
              {artist.stageName}
            </span>
            <span className="text-caption text-muted-foreground truncate block">
              {artist.primaryGenre || 'Artist'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
})
