import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '../ui/cn'
import { RadioPill } from './RadioPill'
import type { RadioMixCard } from '../../lib/recommendations.api'

export interface RadioMixDisplayItem {
  id: string
  seedSongId?: string
  title: string
  subtitle: string
  coverImageUrl?: string | null
  category?: string
  to?: string
  params?: Record<string, string>
  href?: string
  previewTracks?: any[]
}

export interface RadioSectionProps {
  eyebrow?: string
  title?: string
  subtitle?: string
  showAllLabel?: string
  showAllTo?: string
  mixes: (RadioMixCard | RadioMixDisplayItem)[]
  currentTrackId?: string
  onPlayMix?: (mix: any) => void
  className?: string
}

export const RadioSection = memo(function RadioSection({
  eyebrow = 'Curated for you',
  title = 'Your radio mixes',
  subtitle = 'Familiar favorites, unexpected discoveries.',
  showAllLabel = 'Show all',
  showAllTo = '/search',
  mixes,
  currentTrackId,
  onPlayMix,
  className,
}: RadioSectionProps) {
  if (!mixes || mixes.length === 0) return null

  return (
    <section className={cn('w-full font-sans text-foreground', className)}>
      {/* Heading */}
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="mb-2 font-eyebrow text-eyebrow font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {showAllTo && (
          <Link
            to={showAllTo as any}
            className="shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showAllLabel} &rarr;
          </Link>
        )}
      </div>

      {/* Radio cards grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
        {mixes.map((mix) => {
          const item = mix as RadioMixDisplayItem & Partial<RadioMixCard>
          const seedId = 'seedSongId' in mix ? mix.seedSongId : undefined
          const to = item.to || (seedId ? '/radio/$songId' : undefined)
          const params =
            item.params || (seedId ? { songId: seedId } : undefined)
          const href = item.href
          const isPlaying =
            !!currentTrackId &&
            (('previewTracks' in mix &&
              mix.previewTracks?.some((t: any) => t.id === currentTrackId)) ||
              currentTrackId === seedId)

          return (
            <RadioPill
              key={mix.id}
              id={mix.id}
              title={mix.title}
              subtitle={mix.subtitle}
              imageUrl={mix.coverImageUrl}
              to={to}
              params={params}
              href={href}
              isPlaying={isPlaying}
              onPlay={onPlayMix ? () => onPlayMix(mix) : undefined}
            />
          )
        })}
      </div>
    </section>
  )
})
