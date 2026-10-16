import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Badge,
  BellIcon,
  Button,
  CalendarIcon,
  Card,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DiscIcon,
  EditIcon,
  ExternalLinkIcon,
  Eyebrow,
  Field,
  GridIcon,
  HeartIcon,
  HomeIcon,
  IconButton,
  InfoIcon,
  Input,
  ListIcon,
  LockIcon,
  MinusIcon,
  MoonIcon,
  MoreHorizontalIcon,
  MusicIcon,
  PanelRightIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  SectionHeader,
  Select,
  Sheet,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SortIcon,
  StarIcon,
  SunIcon,
  Textarea,
  TrashIcon,
  UndoIcon,
  UploadCloudIcon,
  UserIcon,
  VerifiedIcon,
  VolumeIcon,
  XIcon,
} from '../components/ui'
import { cn } from '../components/ui/cn'
import { MediaTile } from '../components/common/MediaTile'
import type { MediaTileProps } from '../components/common/MediaTile'
import { SongRow } from '../components/common/SongRow'
import { useThemeStore } from '../stores/theme.store'
import type { PlayerTrack } from '../types/player'
import '../styles/design-variants.css'

export const Route = createFileRoute('/dev/design')({
  component: DesignPlayground,
})

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

type VariantKey = 'bordered' | 'flat' | 'material'

const VARIANTS: Array<{
  key: VariantKey
  label: string
  tagline: string
  rules: string[]
}> = [
  {
    key: 'bordered',
    label: 'Bordered',
    tagline: 'Outline first — one 8px corner, depth from the line, no drop shadows.',
    rules: [
      'Every surface is outlined: cards, controls, fields, sheets.',
      'One corner size for everything non-circular: 8px (rounded-lg).',
      'shadow-raised is switched off, so nothing floats — it is bordered.',
      'Hairlines carry the hierarchy, so they are tuned a step stronger.',
    ],
  },
  {
    key: 'flat',
    label: 'Flat',
    tagline: 'No outlines — tone, spacing and fills do the separating.',
    rules: [
      'All outlines are removed; controls trade their border for a fill.',
      'One corner size for everything non-circular: 12px.',
      'The dark canvas is deepened so card and background still read apart.',
      'One concession: a hairline stays between rows in long lists.',
    ],
  },
  {
    key: 'material',
    label: 'Material',
    tagline: 'Google Material 3 — tonal surfaces, pill actions, Roboto, sentence case.',
    rules: [
      'Outlines are gone; surfaces are separated by tonal fill instead.',
      'Every action is a pill · chips take the 8dp corner · sheets and dialogs 28dp.',
      'Text fields are filled, with a 1dp indicator that thickens on focus.',
      'Roboto and the M3 type scale — labels are sentence case, never uppercase.',
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Local, non-exported helpers                                         */
/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <Eyebrow tone="brand">{title}</Eyebrow>
        {hint ? (
          <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {/* `shadow-raised` is what each variant makes of "elevated": nothing,
          nothing, or a hard offset block. */}
      <Card padding="lg" className="flex flex-col gap-5 shadow-raised">
        {children}
      </Card>
    </section>
  )
}

function Token({ children }: { children: ReactNode }) {
  return <code className="font-mono text-caption text-muted-foreground">{children}</code>
}

function Tile({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-surface border border-border bg-card/40 p-3">
      <Eyebrow>{label}</Eyebrow>
      {children}
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

function SwatchGrid({
  items,
}: {
  items: Array<{ token: string; className: string }>
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.token} className="flex flex-col gap-1.5">
          <div
            className={cn(
              'h-14 w-full rounded-inset border border-border',
              item.className,
            )}
          />
          <Token>{item.token}</Token>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const SURFACES = [
  { token: 'background', className: 'bg-background' },
  { token: 'muted', className: 'bg-muted' },
  { token: 'card', className: 'bg-card' },
  { token: 'secondary', className: 'bg-secondary' },
  { token: 'foreground', className: 'bg-foreground' },
  { token: 'muted-foreground', className: 'bg-muted-foreground' },
  { token: 'primary', className: 'bg-primary' },
  { token: 'primary-strong', className: 'bg-primary-strong' },
]

const SEMANTICS = [
  { token: 'success', className: 'bg-success' },
  { token: 'success-soft', className: 'bg-success-soft' },
  { token: 'destructive', className: 'bg-destructive' },
  { token: 'destructive-soft', className: 'bg-destructive-soft' },
  { token: 'warning', className: 'bg-warning' },
  { token: 'warning-soft', className: 'bg-warning-soft' },
  { token: 'scrim', className: 'bg-scrim' },
]

/* The canonical set, in one grid — same 24×24 grid, same 2px stroke, same
   round caps and joins. Before this, these were 8 different stroke widths. */
const ICON_SET: Array<readonly [string, (props: { className?: string }) => ReactNode]> = [
  ['play', PlayIcon],
  ['pause', PauseIcon],
  ['skip-back', SkipBackIcon],
  ['skip-fwd', SkipForwardIcon],
  ['shuffle', ShuffleIcon],
  ['repeat', RepeatIcon],
  ['volume', VolumeIcon],
  ['heart', HeartIcon],
  ['search', SearchIcon],
  ['plus', PlusIcon],
  ['minus', MinusIcon],
  ['check', CheckIcon],
  ['close', XIcon],
  ['edit', EditIcon],
  ['trash', TrashIcon],
  ['undo', UndoIcon],
  ['sort', SortIcon],
  ['grid', GridIcon],
  ['list', ListIcon],
  ['more', MoreHorizontalIcon],
  ['chevron-d', ChevronDownIcon],
  ['chevron-r', ChevronRightIcon],
  ['chevron-l', ChevronLeftIcon],
  ['music', MusicIcon],
  ['disc', DiscIcon],
  ['clock', ClockIcon],
  ['calendar', CalendarIcon],
  ['lock', LockIcon],
  ['upload', UploadCloudIcon],
  ['star', StarIcon],
  ['pin', PinIcon],
  ['verified', VerifiedIcon],
  ['home', HomeIcon],
  ['bell', BellIcon],
  ['user', UserIcon],
  ['info', InfoIcon],
  ['external', ExternalLinkIcon],
  ['sun', SunIcon],
  ['moon', MoonIcon],
  ['panel', PanelRightIcon],
]

const ICON_SIZES = [
  ['size-3', '12'],
  ['size-3.5', '14'],
  ['size-4', '16'],
  ['size-5', '20'],
  ['size-6', '24'],
] as const

const BUTTON_VARIANTS = ['primary', 'brand', 'outline', 'ghost', 'danger'] as const
const BUTTON_SIZES = ['sm', 'md'] as const
const BADGE_TONES = [
  'neutral',
  'ink',
  'brand',
  'success',
  'warning',
  'danger',
] as const
const SONG_VARIANTS = ['standard', 'album', 'playlist', 'artist', 'search'] as const

const noop = () => {}

const FUTURE = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()

const SAMPLE_TRACKS: PlayerTrack[] = [
  {
    id: 't1',
    title: 'Neon Rain',
    artistId: 'a1',
    artistName: 'Nova',
    artistSlug: 'nova',
    albumId: 'al1',
    albumTitle: 'Midnight Drive',
    albumSlug: 'midnight-drive',
    durationSeconds: 214,
    isStreamable: true,
    isExplicit: false,
  },
  {
    id: 't2',
    title: 'Velvet Static',
    artistId: 'a2',
    artistName: 'The Hollow Suns',
    albumId: 'al2',
    albumTitle: 'Analog Dreams',
    albumSlug: 'analog-dreams',
    durationSeconds: 187,
    isStreamable: true,
  },
  {
    id: 't3',
    title: 'Paper Moons',
    artistId: 'a1',
    artistName: 'Nova',
    albumId: 'al1',
    albumTitle: 'Midnight Drive',
    durationSeconds: 245,
    isStreamable: false,
    isExplicit: true,
  },
  {
    id: 't4',
    title: 'Gold Teeth',
    artistId: 'a3',
    artistName: 'Marlowe',
    durationSeconds: 168,
    isStreamable: true,
  },
]

const SHELF_TILES: MediaTileProps[] = [
  { title: 'Midnight Drive', subtitle: 'Album · Nova', artistName: 'Nova', onPlay: noop },
  {
    title: 'Analog Dreams',
    subtitle: 'Album · The Hollow Suns',
    artistName: 'The Hollow Suns',
    onPlay: noop,
  },
  {
    title: 'Late Night Mix',
    subtitle: 'Playlist · 24 tracks',
    artistName: 'Groovy',
    badge: <Badge tone="brand">New</Badge>,
    onPlay: noop,
  },
  {
    title: 'Marlowe',
    subtitle: 'Artist',
    artistName: 'Marlowe',
    isRoundImage: true,
    onPlay: noop,
  },
  { title: 'Rare B-Sides', subtitle: 'No artwork', fallbackInitials: 'RB', onPlay: noop },
  { title: 'Sunroom', subtitle: 'Album · Iris', artistName: 'Iris', onPlay: noop },
]

const GRID_TILES: MediaTileProps[] = [
  { title: 'Midnight Drive', subtitle: 'Nova', artistName: 'Nova', onPlay: noop },
  {
    title: 'Analog Dreams',
    subtitle: 'The Hollow Suns',
    artistName: 'The Hollow Suns',
    onPlay: noop,
  },
  { title: 'Sunroom', subtitle: 'Iris', artistName: 'Iris', onPlay: noop },
  { title: 'Gold Teeth', subtitle: 'Marlowe', artistName: 'Marlowe', onPlay: noop },
  { title: 'Paper Moons', subtitle: 'Nova', artistName: 'Nova', onPlay: noop },
  { title: 'Rare B-Sides', subtitle: 'Various', fallbackInitials: 'RB', onPlay: noop },
]

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function DesignPlayground() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const [bottomSheet, setBottomSheet] = useState(false)
  const [bareSheet, setBareSheet] = useState(false)
  const [centerSheet, setCenterSheet] = useState(false)
  const [variant, setVariant] = useState<VariantKey>(() => {
    const requested = new URLSearchParams(window.location.search).get('style')
    return VARIANTS.some((v) => v.key === requested)
      ? (requested as VariantKey)
      : 'bordered'
  })

  /* Scoping on <body> rather than the page wrapper means portal'd overlays
     (sheets) get re-skinned too — the whole screen switches at once. */
  useEffect(() => {
    document.body.dataset.style = variant
    return () => {
      delete document.body.dataset.style
    }
  }, [variant])

  /* Material is the only variant that needs a typeface the app does not ship,
     so the preview pulls Roboto in on demand — dev only, review only. */
  useEffect(() => {
    if (variant !== 'material') return
    const id = 'groovy-material-roboto'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap'
    document.head.appendChild(link)
  }, [variant])

  const choose = (next: VariantKey) => {
    setVariant(next)
    const url = new URL(window.location.href)
    url.searchParams.set('style', next)
    window.history.replaceState(null, '', url)
  }

  if (!import.meta.env.DEV) {
    return (
      <div className="p-8">
        <Eyebrow tone="muted">dev only</Eyebrow>
        <p className="mt-2 text-body text-muted-foreground">
          The design playground is only available in development.
        </p>
      </div>
    )
  }

  const active = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]

  return (
    <div className="flex flex-col gap-10 py-6">
      {/* Header + variant switch */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow tone="brand">design system</Eyebrow>
            <h1 className="font-serif text-display text-foreground">
              Playground
            </h1>
            <p className="mt-1 max-w-prose text-body text-muted-foreground">
              One page, three directions. Everything below is the same markup and
              the same primitives — only the tokens change.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            leftIcon={theme === 'dark' ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
          >
            {theme === 'dark' ? 'Light' : 'Dark'} mode
          </Button>
        </div>

        <div className="inline-flex w-fit rounded-control border border-border bg-card p-1">
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => choose(v.key)}
              aria-pressed={variant === v.key}
              className={cn(
                'rounded-control px-3 py-1.5 font-mono text-eyebrow font-semibold uppercase transition-colors',
                variant === v.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="rounded-surface border border-border bg-card/40 p-4 shadow-raised">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Eyebrow tone="brand">{active.label}</Eyebrow>
            <p className="text-body text-foreground">{active.tagline}</p>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {active.rules.map((rule) => (
              <li key={rule} className="flex gap-2 text-caption text-muted-foreground">
                <ChevronRightIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {rule}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-muted-foreground">
            The switch is scoped to the whole document, so the app chrome around
            this page and the sheets below re-skin with it. It is bookmarkable —
            add <Token>?style=flat</Token> or <Token>?style=material</Token>.
          </p>
        </div>
      </div>

      {/* Icons */}
      <Section
        title="Icons"
        hint="One geometry for all of them: 24×24 viewBox · stroke 2 · round caps and joins · currentColor."
      >
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {ICON_SET.map(([name, Icon]) => (
            <div
              key={name}
              className="flex flex-col items-center gap-1.5 rounded-inset border border-border bg-card/40 px-1 py-3"
            >
              <Icon className="size-5 text-foreground" />
              <span className="w-full truncate text-center font-mono text-caption uppercase text-muted-foreground">
                {name}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-5">
          {ICON_SIZES.map(([cls, px]) => (
            <div key={cls} className="flex flex-col items-center gap-1.5">
              <MusicIcon className={cn('text-foreground', cls)} />
              <Token>{px}px</Token>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <HeartIcon className="size-5 text-muted-foreground" />
            <HeartIcon className="size-5 text-destructive" filled />
            <PlayIcon className="size-5 text-primary" />
            <PauseIcon className="size-5 text-foreground" />
            <VerifiedIcon className="size-5 text-primary" />
          </div>
        </div>
      </Section>

      {/* Type roles */}
      <Section
        title="Type roles"
        hint="Fraunces for display, Inter for body/UI, IBM Plex Mono for eyebrows only."
      >
        <div className="flex flex-col gap-4">
          <div>
            <Token>text-display · Fraunces</Token>
            <p className="font-serif text-display text-foreground">Groovy</p>
          </div>
          <div>
            <Token>text-heading · Inter</Token>
            <h2 className="text-heading font-semibold text-foreground">Section heading</h2>
          </div>
          <div>
            <Token>text-title · Inter</Token>
            <h3 className="text-title font-medium text-foreground">Card title</h3>
          </div>
          <div>
            <Token>text-body · Inter</Token>
            <p className="text-body text-foreground">
              Body copy — the default reading size across the app.
            </p>
          </div>
          <div>
            <Token>text-caption · Inter</Token>
            <p className="text-caption text-muted-foreground">Caption / secondary metadata.</p>
          </div>
          <div>
            <Token>text-eyebrow · IBM Plex Mono</Token>
            <Eyebrow>Eyebrow label</Eyebrow>
          </div>
        </div>
      </Section>

      {/* Colour */}
      <Section title="Surfaces & ink" hint="The working palette.">
        <SwatchGrid items={SURFACES} />
      </Section>

      <Section title="Semantic state" hint="Use these instead of raw red / green / amber.">
        <SwatchGrid items={SEMANTICS} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-body text-success">Success text</span>
          <span className="text-body text-destructive">Danger text</span>
          <span className="text-body text-warning">Warning text</span>
          <span className="text-body text-primary">Brand text</span>
        </div>
      </Section>

      {/* Border rules */}
      <Section
        title="Border rules"
        hint="The only four places a line is allowed. Everything else gets its separation from tone or spacing."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="container" hint="cards · panels · sheets">
            <div className="h-10 rounded-surface border border-border bg-card" />
          </Tile>
          <Tile label="control" hint="buttons · fields · selects">
            <div className="flex h-10 items-center rounded-control border border-border bg-card px-3 text-caption text-muted-foreground">
              Track name
            </div>
          </Tile>
          <Tile label="divider" hint="between list rows only">
            <div className="flex h-10 flex-col justify-center gap-1.5">
              <span className="h-px w-full bg-border" />
              <span className="h-px w-full bg-border-soft" />
            </div>
          </Tile>
          <Tile label="focus" hint="never removed, ever">
            <div className="h-10 rounded-control border border-primary bg-card ring-2 ring-primary/40" />
          </Tile>
        </div>
      </Section>

      {/* Buttons */}
      <Section
        title="Buttons"
        hint="Primary is solid ink with a brand-accent hover — Groovy's signature CTA."
      >
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_SIZES.map((size) => (
            <Button key={size} size={size} variant="outline">
              size · {size}
            </Button>
          ))}
          <Button variant="primary" leftIcon={<PlayIcon className="size-3.5" />}>
            With icon
          </Button>
          <Button variant="brand" leftIcon={<PlusIcon className="size-3.5" />}>
            New playlist
          </Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
        </div>
        <Button variant="brand" block>
          Block button
        </Button>
      </Section>

      {/* Icon buttons */}
      <Section
        title="Icon buttons"
        hint="lg (44px) is the minimum target for primary mobile controls."
      >
        <div className="flex flex-wrap items-center gap-3">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <IconButton
              key={size}
              size={size}
              aria-label={`Play (${size})`}
              className="border border-border bg-muted"
            >
              <PlayIcon className="size-4" />
            </IconButton>
          ))}
          <IconButton aria-label="Like" className="border border-border bg-muted">
            <HeartIcon className="size-4" />
          </IconButton>
          <IconButton aria-label="Search" className="border border-border bg-muted">
            <SearchIcon className="size-4" />
          </IconButton>
          <IconButton aria-label="More" className="border border-border bg-muted">
            <MoreHorizontalIcon className="size-4" />
          </IconButton>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges" hint="Status pills — always a semantic tone.">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
      </Section>

      {/* Cards */}
      <Section title="Cards" hint="Radius + border + surface, three weights.">
        <div className="grid gap-3 sm:grid-cols-3">
          {(['plain', 'muted', 'interactive'] as const).map((v) => (
            <Card key={v} variant={v} padding="md">
              <Eyebrow>{v}</Eyebrow>
              <h4 className="mt-1 text-title font-medium text-foreground">Release title</h4>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Artist · 2026 · 12 tracks
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* Song rows — variants */}
      <Section
        title="Song rows — variants"
        hint="One row component, five context views: standard, album, playlist, artist, search."
      >
        <div className="variant-list overflow-hidden rounded-surface border border-border bg-muted">
          {SONG_VARIANTS.map((v, i) => (
            <div key={v} className="border-b border-border last:border-b-0">
              <div className="bg-muted/50 px-4 py-1">
                <Eyebrow tone="muted">variant · {v}</Eyebrow>
              </div>
              <SongRow
                track={SAMPLE_TRACKS[i % SAMPLE_TRACKS.length]}
                index={i}
                variant={v}
                trackNumberDisplay={i + 1}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Song rows — states */}
      <Section
        title="Song rows — states & metadata"
        hint="Plays count, credits, scheduled (locked), added-by, reorder grip."
      >
        <div className="variant-list overflow-hidden rounded-surface border border-border bg-muted">
          <SongRow
            track={SAMPLE_TRACKS[0]}
            index={0}
            variant="search"
            playsCount={128400}
          />
          <SongRow
            track={SAMPLE_TRACKS[3]}
            index={1}
            variant="search"
            primaryCredits={[{ artistId: 'a1', stageName: 'Nova' }]}
            featuredCredits={[{ artistId: 'a4', stageName: 'Iris' }]}
            producerCredits={[{ artistId: 'a5', stageName: 'Kato' }]}
          />
          <SongRow
            track={SAMPLE_TRACKS[2]}
            index={2}
            variant="search"
            scheduledReleaseAt={FUTURE}
          />
          <SongRow
            track={SAMPLE_TRACKS[1]}
            index={3}
            variant="playlist"
            addedByDisplayName="Ava"
            isDraggable
            onGripPointerDown={noop}
          />
          <SongRow
            track={SAMPLE_TRACKS[0]}
            index={4}
            variant="standard"
            isPersonal
            hideAddToPlaylist
            onRemoveFromPlaylist={noop}
          />
        </div>
      </Section>

      {/* Media tiles — shelf */}
      <Section
        title="Media tiles — shelf"
        hint="Horizontal scroll row, as used on home / browse."
      >
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto pb-1">
          {SHELF_TILES.map((tile) => (
            <div key={tile.title} className="w-32 shrink-0 sm:w-36">
              <MediaTile {...tile} />
            </div>
          ))}
        </div>
      </Section>

      {/* Media tiles — grid */}
      <Section
        title="Media tiles — grid"
        hint="Responsive grid, as used on search / browse results."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {GRID_TILES.map((tile) => (
            <MediaTile key={tile.title} {...tile} />
          ))}
        </div>
      </Section>

      {/* Media tile variants */}
      <Section
        title="Media tile variants"
        hint="Procedural artwork, round artist tile, badge, initials fallback, play affordance."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          <MediaTile title="Midnight Drive" subtitle="Album · Nova" artistName="Nova" />
          <MediaTile title="Nova" subtitle="Artist" artistName="Nova" isRoundImage />
          <MediaTile
            title="Late Night Mix"
            subtitle="Playlist · 24 tracks"
            artistName="Groovy"
            badge={<Badge tone="brand">New</Badge>}
          />
          <MediaTile title="Rare B-Sides" subtitle="No artwork" fallbackInitials="RB" />
          <MediaTile
            title="Analog Dreams"
            subtitle="Album · The Hollow Suns"
            artistName="The Hollow Suns"
            onPlay={noop}
          />
        </div>
      </Section>

      {/* Composed section */}
      <Section
        title="A composed section"
        hint="SectionHeader + tile grid = a real browse section, built from primitives."
      >
        <div className="overflow-hidden rounded-surface border border-border bg-card shadow-raised">
          <SectionHeader
            eyebrow="for you"
            title="New releases"
            description="Fresh drops from artists you follow."
            actions={
              <Button size="sm" variant="outline">
                See all
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4">
            {GRID_TILES.slice(0, 4).map((tile) => (
              <MediaTile key={tile.title} {...tile} />
            ))}
          </div>
        </div>
      </Section>

      {/* Fields */}
      <Section title="Fields" hint="Label + control + hint/error.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="dn" hint="Shown on your profile.">
            <Input id="dn" placeholder="e.g. Nova" />
          </Field>
          <Field label="Email" htmlFor="em" error="That address is taken.">
            <Input id="em" defaultValue="nova@example.com" />
          </Field>
          <Field label="Visibility" htmlFor="vis">
            <Select id="vis" defaultValue="public">
              <option value="public">Public</option>
              <option value="private">Private</option>
            </Select>
          </Field>
          <Field label="Add a track" htmlFor="tr" hint="One per line.">
            <Textarea id="tr" placeholder="Track name" />
          </Field>
        </div>
      </Section>

      {/* Section header */}
      <Section
        title="Section header"
        hint="One header for every page — no more per-page sticky chrome."
      >
        <div className="overflow-hidden rounded-surface border border-border bg-card">
          <SectionHeader
            eyebrow="your vault"
            title="Personal vault"
            description="Uploaded files you own."
            actions={
              <Button size="sm" variant="outline">
                Manage
              </Button>
            }
          />
          <div className="p-4 text-body text-muted-foreground">
            Page content sits under the header.
          </div>
        </div>
      </Section>

      {/* Radius + elevation */}
      <Section title="Radius & elevation" hint="Radius roles, and what each variant makes of 'raised'.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['rounded-control', 'control'],
              ['rounded-inset', 'inset'],
              ['rounded-surface', 'surface'],
              ['rounded-full', 'full'],
            ] as const
          ).map(([cls, label]) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={cn('h-16 w-16 border border-border bg-card', cls)} />
              <Token>{label}</Token>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['flat (outline only)', 'border border-border shadow-none'],
              ['shadow-raised', 'border border-border shadow-raised'],
              ['shadow-floating', 'border border-border shadow-floating'],
            ] as const
          ).map(([label, cls]) => (
            <div
              key={label}
              className={cn(
                'flex h-16 w-full items-center justify-center rounded-surface bg-card px-2 text-center text-caption text-muted-foreground',
                cls,
              )}
            >
              {label}
            </div>
          ))}
        </div>
      </Section>

      {/* Sheets */}
      <Section
        title="Sheets"
        hint="Scrim + Escape + body-scroll lock + safe-area, once. The bottom sheet snaps back or dismisses on drag."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setBottomSheet(true)}>
            <UploadCloudIcon className="size-4" /> Bottom sheet
          </Button>
          <Button variant="outline" onClick={() => setBareSheet(true)}>
            <ListIcon className="size-4" /> No handle
          </Button>
          <Button variant="outline" onClick={() => setCenterSheet(true)}>
            <EditIcon className="size-4" /> Centered dialog
          </Button>
        </div>
      </Section>

      {/* Sheet instances */}
      <Sheet
        open={bottomSheet}
        onClose={() => setBottomSheet(false)}
        title="Bottom sheet"
        description="Grab the handle and drag down."
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body text-muted-foreground">
            Drag the title bar down past 40% of the height — or fling it — and it
            dismisses. Anything short of that snaps back.
          </p>
          <div className="flex flex-col gap-1">
            {['Save to library', 'Add to playlist', 'Share'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setBottomSheet(false)}
                className="flex items-center gap-3 rounded-inset px-3 py-3 text-left text-body text-foreground transition-colors hover:bg-secondary/20"
              >
                <PlusIcon className="size-4 text-muted-foreground" />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBottomSheet(false)}
              className="mt-1 flex items-center gap-3 rounded-inset px-3 py-3 text-left text-body text-destructive transition-colors hover:bg-destructive-soft"
            >
              <TrashIcon className="size-4" />
              Remove
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={bareSheet}
        onClose={() => setBareSheet(false)}
        hideHandle
        title="Without the handle"
        description="The title bar is still the drag surface."
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body text-muted-foreground">
            Same gesture, no grab handle — for sheets where the handle would be
            redundant. Escape and the scrim still close it.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setBareSheet(false)}>
              Done
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={centerSheet}
        onClose={() => setCenterSheet(false)}
        title="Centered dialog"
        description="Actually centered, at every size."
        placement="center"
        size="sm"
      >
        <div className="flex flex-col gap-4 p-4">
          <Field label="Playlist name" htmlFor="pl">
            <Input id="pl" placeholder="Late night mix" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCenterSheet(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              rightIcon={<ChevronRightIcon className="size-3.5" />}
              onClick={() => setCenterSheet(false)}
            >
              Create
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
