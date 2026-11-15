import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { PlayIconSVG } from '../Icons'
import { ProceduralCover } from '../common/ProceduralCover'
import { cn } from '../ui/cn'

export interface SpotlightReleaseHeroProps {
  album: {
    id: string
    title: string
    slug: string
    artistStageName?: string
    coverImageUrl?: string | null
    albumType?: string | null
  }
  className?: string
}

export const SpotlightReleaseHero = memo(function SpotlightReleaseHero({
  album,
  className,
}: SpotlightReleaseHeroProps) {
  return (
    <div
      className={cn(
        'relative min-h-[300px] sm:min-h-[340px] rounded-2xl sm:rounded-3xl overflow-hidden p-6 sm:p-8 flex flex-col justify-end text-white group select-none shadow-xs',
        className,
      )}
    >
      {/* 1. Full-bleed Cover Artwork */}
      {album.coverImageUrl ? (
        <img
          src={album.coverImageUrl}
          alt={album.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full">
          <ProceduralCover
            fill
            title={album.title}
            artistName={album.artistStageName}
            className="w-full h-full"
          />
        </div>
      )}

      {/* 2. Legibility Gradient Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

      {/* 3. Foreground Content */}
      <div className="relative z-10 flex flex-col items-start min-w-0">
        <span className="self-start font-eyebrow text-eyebrow font-semibold px-3 py-1 rounded-full bg-black/40 backdrop-blur-xs text-white border border-white/10 mb-3">
          {album.albumType || 'Album'}
        </span>

        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-tight mb-1 text-white line-clamp-2">
          {album.title}
        </h3>

        <p className="text-body text-white/80 font-medium mb-4 truncate max-w-full">
          {album.artistStageName || 'Groovy Artist'}
        </p>

        <Link
          to="/albums/$idOrSlug"
          params={{ idOrSlug: album.slug }}
          className="self-start font-body font-semibold px-5 py-2.5 rounded-full bg-white text-black hover:bg-white/90 transition-all flex items-center gap-2 active:scale-95 shadow-sm"
        >
          <PlayIconSVG className="w-4 h-4 fill-current ml-0.5" />
          <span>Play</span>
        </Link>
      </div>
    </div>
  )
})
