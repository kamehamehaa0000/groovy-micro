import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { SectionHeading, HEADING_ACTION } from '../ui/typography'
import { SpotlightReleaseHero } from './SpotlightReleaseHero'
import { ProceduralCover } from '../common/ProceduralCover'
import { cn } from '../ui/cn'

export interface NewReleasesSectionProps {
  releases?: {
    id: string
    title: string
    slug: string
    artistStageName?: string
    coverImageUrl?: string | null
    albumType?: string | null
  }[]
  title?: string
  subtitle?: string
  className?: string
}

export const NewReleasesSection = memo(function NewReleasesSection({
  releases,
  title = 'New Releases For You',
  subtitle = 'Fresh albums & singles matching your sonic profile',
  className,
}: NewReleasesSectionProps) {
  if (!releases || releases.length === 0) return null

  const heroRelease = releases[0]
  const miniReleases = releases.slice(1, 5)

  return (
    <section className={cn('min-w-0', className)}>
      <SectionHeading
        title={title}
        subtitle={subtitle}
        action={
          <Link to="/releases" className={HEADING_ACTION}>
            All Releases &rarr;
          </Link>
        }
      />

      <div
        className={cn(
          'grid gap-4',
          miniReleases.length > 0
            ? 'grid-cols-1 lg:grid-cols-[1.15fr_1fr]'
            : 'grid-cols-1',
        )}
      >
        {/* Left: Spotlight Featured Hero */}
        <SpotlightReleaseHero album={heroRelease} />

        {/* Right: 2x2 Mini Releases Grid */}
        {miniReleases.length > 0 && (
          <div className="grid grid-cols-2 gap-3 self-center">
            {miniReleases.map((album) => (
              <Link
                key={album.id}
                to="/albums/$idOrSlug"
                params={{ idOrSlug: album.slug }}
                className="group flex flex-col p-2.5 rounded-2xl hover:bg-secondary/40 active:scale-[0.98] transition-all select-none min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="relative aspect-square w-full mb-2 overflow-hidden rounded-xl bg-muted">
                  {album.coverImageUrl ? (
                    <img
                      src={album.coverImageUrl}
                      alt={album.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <ProceduralCover
                      fill
                      title={album.title}
                      artistName={album.artistStageName}
                      className="rounded-xl"
                    />
                  )}
                </div>

                <div className="w-full min-w-0">
                  <div className="font-semibold text-body truncate text-foreground group-hover:text-primary transition-colors">
                    {album.title}
                  </div>
                  <div className="text-caption text-muted-foreground truncate mt-0.5">
                    {album.artistStageName || 'Groovy Artist'}
                    {album.albumType ? ` · ${album.albumType}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
})
