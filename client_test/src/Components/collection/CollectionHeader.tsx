import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { useStickyHeader } from '../../lib/useStickyHeader'
import { CollectionCover } from './CollectionCover'
import { CollectionStickyHeader } from './CollectionStickyHeader'

export interface CollectionHeaderProps {
  title: string
  /** Artwork node rendered inside the square cover. */
  cover: ReactNode
  /** Small label above the title — "Playlist", "Album", "Single". */
  eyebrow?: ReactNode
  /** Status chips (visibility, scope, upcoming, …). */
  badges?: ReactNode
  /** Floating control rendered on the artwork (artwork edit, like, …). */
  coverAction?: ReactNode
  /** Inline metadata row (creator, count, duration, …). */
  meta?: ReactNode
  description?: ReactNode
  /** First artwork URL used for the ambient, blurred backdrop tint. */
  backdropImageUrl?: string | null

  stickySubtitle?: ReactNode
  stickyThumbnail?: ReactNode

  className?: string
  stickyClassName?: string
  contentClassName?: string
  coverClassName?: string
}

/**
 * Reusable Spotify-inspired collection header for playlists and releases.
 *
 * This is the information half only: artwork, title, description and metadata.
 * The play/secondary controls belong in a separate `CollectionActionBar` below
 * the header, so the header can keep the same structure across collection types.
 *
 * It owns the scroll choreography: once the large title scrolls above the global
 * header, a slim sticky bar takes over with the title and optional thumbnail.
 */
export function CollectionHeader({
  title,
  cover,
  eyebrow,
  badges,
  coverAction,
  meta,
  description,
  backdropImageUrl,
  stickySubtitle,
  stickyThumbnail,
  className,
  stickyClassName,
  contentClassName,
  coverClassName,
}: CollectionHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const isCondensed = useStickyHeader(titleRef, {
    topOffset: 56,
    hysteresis: 16,
  })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <>
      <CollectionStickyHeader
        visible={isCondensed}
        title={title}
        subtitle={stickySubtitle}
        thumbnail={stickyThumbnail}
        className={stickyClassName}
      />

      <section
        className={cn(
          'relative isolate overflow-hidden',
          className,
        )}
      >
        {/* Ambient tint: the cover blurred into the page background. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          {backdropImageUrl ? (
            <img
              src={backdropImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full scale-125 object-cover opacity-25 blur-3xl saturate-150 select-none"
            />
          ) : (
            <div className="h-full w-full bg-linear-to-br from-primary/15 via-background to-background" />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-background/30 via-background/70 to-background" />
        </div>

        <div
          className={cn(
            'relative mx-auto w-full max-w-6xl px-4 pb-2 pt-2 sm:px-8 md:pb-8 md:pt-2',
            contentClassName,
          )}
        >
          <div
            className={cn(
              'flex flex-col items-center gap-6 transition-all duration-500 ease-out motion-reduce:transition-none md:flex-row md:items-end md:gap-8',
              mounted
                ? 'translate-y-0 opacity-100'
                : 'translate-y-3 opacity-0',
            )}
          >
            <CollectionCover
              cover={cover}
              action={coverAction}
              className={coverClassName}
            />

            <div className="flex w-full min-w-0 flex-1 flex-col gap-2.5 text-left md:gap-3.5">
              {eyebrow || badges ? (
                <div className="flex flex-wrap items-center gap-2">
                  {eyebrow}
                  {badges}
                </div>
              ) : null}

              <h1
                ref={titleRef}
                title={title}
                className="m-0 line-clamp-4 font-serif italic text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground wrap-break-words md:text-[56px] md:leading-[1.05] md:tracking-[-0.01em]"
              >
                {title}
              </h1>

              {description ? (
                <p className="m-0 line-clamp-3 max-w-2xl font-sans text-caption leading-relaxed text-muted-foreground sm:text-body">
                  {description}
                </p>
              ) : null}

              {meta ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-caption text-muted-foreground">
                  {meta}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
