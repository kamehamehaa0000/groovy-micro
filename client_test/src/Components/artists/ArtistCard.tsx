import { memo, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, Loader2, UserPlus } from 'lucide-react'
import { MarqueeText } from '../common/MarqueeText'
import { VerifiedBadgeSVG } from '../Icons'
import { cn } from '../ui/cn'

export interface ArtistCardProps {
  id?: string
  name: string
  slug: string
  imageUrl?: string | null
  /** 'pill' (default) for directory list; 'square' for library grid tile. */
  variant?: 'pill' | 'square'
  /** Second line — handle, listener count, release count, etc. */
  subtitle?: ReactNode
  isVerified?: boolean
  isFollowing?: boolean
  /** Whether this artist is the authenticated user themselves. */
  isSelf?: boolean
  /** Personal sandbox artist — renders the minimal [P] badge. */
  isPersonal?: boolean
  isFollowLoading?: boolean
  onToggleFollow?: (e: React.MouseEvent) => void
  /** Optional custom action overlay. */
  action?: ReactNode
  className?: string
}

function getHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360
  }
  return hash
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * Modern pill artist card matching the Groovy directory design.
 * Features a circular avatar on the left, stage name + verified badge and
 * handle/subtitle in the center, and a responsive one-touch Follow button.
 */
export const ArtistCard = memo(function ArtistCard({
  name,
  slug,
  imageUrl,
  variant = 'pill',
  subtitle,
  isVerified = false,
  isFollowing = false,
  isSelf = false,
  isPersonal = false,
  isFollowLoading = false,
  onToggleFollow,
  action,
  className,
}: ArtistCardProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const hue = useMemo(() => getHue(name), [name])
  const initials = useMemo(() => getInitials(name), [name])

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleFollow?.(e)
  }

  if (variant === 'square') {
    return (
      <div
        className={cn(
          'group relative flex flex-col p-2.5 rounded-surface hover:bg-muted/70 active:scale-[0.98] transition-all duration-150 select-none min-w-0',
          className,
        )}
      >
        <Link
          to="/artists/$idOrSlug"
          params={{ idOrSlug: slug }}
          className="flex w-full flex-col rounded-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
              <div
                className="relative h-full w-full rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${
                    hue + 30
                  } 55% 22%))`,
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.28), transparent 60%)',
                  }}
                />
                <span className="relative z-10 font-bold text-white text-heading">
                  {initials}
                </span>
              </div>
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
                <VerifiedBadgeSVG className="h-3.5 w-3.5 shrink-0 text-foreground" />
              )}
              {isPersonal && (
                <abbr
                  title="Personal artist"
                  aria-label="Personal artist"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-control bg-accent font-eyebrow text-eyebrow font-bold uppercase leading-none text-foreground cursor-help"
                >
                  P
                </abbr>
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

  return (
    <div
      className={cn(
        'group/artist relative flex h-[76px] max-sm:h-[68px] items-center gap-1.5 pr-2.5 rounded-full bg-secondary/70 hover:bg-accent active:scale-[0.98] transition-all duration-150 select-none min-w-0',
        className,
      )}
    >
      <Link
        to="/artists/$idOrSlug"
        params={{ idOrSlug: slug }}
        className="flex h-full min-w-0 flex-1 items-center gap-3.5 max-sm:gap-3 p-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {/* Avatar */}
        <div className="relative h-16 w-16 max-sm:h-14 max-sm:w-14 shrink-0 overflow-hidden rounded-full shadow-sm flex items-center justify-center font-bold text-white text-body max-sm:text-caption tracking-wider select-none">
          {imageUrl && failedUrl !== imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setFailedUrl(imageUrl)}
              className="h-full w-full rounded-full object-cover shadow-sm shrink-0"
            />
          ) : (
            <div
              className="relative h-full w-full rounded-full flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 55% 40%), hsl(${
                  hue + 30
                } 55% 22%))`,
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.28), transparent 60%)',
                }}
              />
              <span className="relative z-10 font-bold">{initials}</span>
            </div>
          )}
        </div>

        {/* Text column */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex min-w-0 items-center gap-1">
            <MarqueeText
              hoverOnly
              className="max-w-full"
              innerClassName="text-body font-semibold text-foreground"
            >
              {name}
            </MarqueeText>
            {isVerified && (
              <VerifiedBadgeSVG className="h-4 w-4 shrink-0 text-foreground" />
            )}
            {isPersonal && (
              <abbr
                title="Personal artist"
                aria-label="Personal artist"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control bg-accent font-eyebrow text-eyebrow font-bold uppercase leading-none text-foreground cursor-help"
              >
                P
              </abbr>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 truncate text-caption text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
      </Link>

      {/* Follow Button or custom Action */}
      {action ? (
        <div className="shrink-0">{action}</div>
      ) : !isSelf && onToggleFollow ? (
        <button
          type="button"
          onClick={handleFollowClick}
          disabled={isFollowLoading}
          aria-pressed={isFollowing}
          aria-label={isFollowing ? `Following ${name}` : `Follow ${name}`}
          title={isFollowing ? 'Following' : 'Follow'}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            isFollowing
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-accent/80 hover:bg-accent text-foreground',
            isFollowLoading && 'opacity-70 cursor-not-allowed',
          )}
        >
          {isFollowLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isFollowing ? (
            <Check className="h-5 w-5 stroke-[2.5]" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )}
        </button>
      ) : null}
    </div>
  )
})
