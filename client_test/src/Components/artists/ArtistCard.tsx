import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { MarqueeText } from '../common/MarqueeText'
import { ProceduralCover } from '../common/ProceduralCover'
import { VerifiedBadgeSVG } from '../icons'
import { cn } from '../ui/cn'

export interface ArtistCardProps {
  name: string
  slug: string
  imageUrl?: string | null
  /** Second line — listener count, release count, genre, etc. */
  subtitle?: ReactNode
  isVerified?: boolean
  isFollowing?: boolean
  /** Personal sandbox artist — renders the minimal [P] badge. */
  isPersonal?: boolean
  /** Optional overlay on the top-right of the artwork (e.g. pin control). */
  action?: ReactNode
  className?: string
}

/**
 * The single artist tile used across the app.
 *
 * Visual base is the library grid card: borderless hover surface, round
 * artwork, centered title + one metadata line. When an artist has no avatar
 * the procedural gradient cover from the home page is used, so the fallback
 * is identical everywhere.
 */
export function ArtistCard({
  name,
  slug,
  imageUrl,
  subtitle,
  isVerified = false,
  isFollowing = false,
  isPersonal = false,
  action,
  className,
}: ArtistCardProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  return (
    <div
      className={cn(
        'group relative flex flex-col p-2.5 rounded-xl hover:bg-muted/70 active:scale-[0.98] transition-all duration-150 select-none',
        className,
      )}
    >
      <Link
        to="/artists/$idOrSlug"
        params={{ idOrSlug: slug }}
        className="flex w-full flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="relative mb-2.5 flex aspect-square w-full items-center justify-center">
          {imageUrl && failedUrl !== imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setFailedUrl(imageUrl)}
              className="h-full w-full shrink-0 rounded-full bg-muted object-cover shadow-sm"
            />
          ) : (
            <ProceduralCover
              fill
              title={name}
              artistName={name}
              className="rounded-full"
            />
          )}
        </div>

        <div className="w-full min-w-0">
          <div className="flex min-w-0 items-center justify-center gap-1">
            <MarqueeText
              hoverOnly
              className="max-w-full"
              innerClassName="text-body font-semibold text-foreground"
            >
              {name}
            </MarqueeText>
            {isVerified && (
              <VerifiedBadgeSVG className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            {isPersonal && (
              <span
                title="Personal artist"
                aria-label="Personal artist"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-control border border-border bg-secondary/40 font-eyebrow text-eyebrow font-semibold uppercase leading-none text-muted-foreground"
              >
                P
              </span>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 truncate text-center text-caption text-muted-foreground">
              {subtitle}
            </div>
          )}
          {isFollowing && (
            <div className="mt-1 flex items-center justify-center gap-1.5 font-eyebrow text-eyebrow uppercase text-muted-foreground">
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              Following
            </div>
          )}
        </div>
      </Link>

      {action && (
        <div className="absolute right-2 top-2 z-20">{action}</div>
      )}
    </div>
  )
}
