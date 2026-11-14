import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '../ui/cn'
import { SectionHeading, HEADING_ACTION } from '../ui/typography'
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
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        action={
          showAllTo ? (
            <Link
              to={showAllTo as any}
              className={HEADING_ACTION}
            >
              {showAllLabel} &rarr;
            </Link>
          ) : null
        }
      />

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
