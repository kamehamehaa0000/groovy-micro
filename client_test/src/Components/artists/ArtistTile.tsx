import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { ArtistSummary } from '../../types/artist'
import { Avatar, Badge } from '../ui'
import { VerifiedBadgeSVG } from '../icons'

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export interface ArtistTileProps {
  artist: ArtistSummary
  isFollowing: boolean
}

/** Compact, avatar-led directory tile. No banner, bio, or nested CTA. */
export function ArtistTile({ artist, isFollowing }: ArtistTileProps) {
  const isPersonal = artist.scope === 'PERSONAL'

  return (
    <Link
      to="/artists/$idOrSlug"
      params={{ idOrSlug: artist.slug }}
      title={artist.stageName}
      className="group relative flex h-full min-w-0 flex-col items-center rounded-surface border border-border bg-card p-3 text-center transition-colors hover:border-foreground/20 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-4"
    >
      <span className="relative">
        <Avatar src={artist.avatarUrl} name={artist.stageName} size="xl" />
        {isFollowing && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            <span className="sr-only">Following</span>
          </span>
        )}
      </span>

      <span className="mt-2.5 flex min-w-0 max-w-full items-center justify-center gap-1">
        <span className="truncate text-title font-semibold text-foreground transition-colors group-hover:text-primary">
          {artist.stageName}
        </span>
        {artist.verified && (
          <VerifiedBadgeSVG className="h-3.5 w-3.5 shrink-0 text-primary" />
        )}
      </span>

      <span className="w-full truncate text-caption text-muted-foreground">
        @{artist.slug}
      </span>

      <span className="mt-1.5 flex h-5 items-center justify-center">
        {isPersonal ? (
          <Badge tone="warning">Personal</Badge>
        ) : (
          <span className="font-mono text-caption tabular-nums text-muted-foreground">
            {compactNumber.format(artist.monthlyListeners)}{' '}
            <span className="font-sans">
              {artist.monthlyListeners === 1 ? 'listener' : 'listeners'}
            </span>
          </span>
        )}
      </span>
    </Link>
  )
}
