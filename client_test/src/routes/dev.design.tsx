import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  Field,
  IconButton,
  Input,
  SectionHeader,
  Select,
  Sheet,
  Switch,
  Textarea,
} from '../components/ui'
import { cn } from '../components/ui/cn'
import { MediaTile } from '../components/common/MediaTile'
import type { MediaTileProps } from '../components/common/MediaTile'
import { SongRow } from '../components/common/SongRow'
import { useThemeStore } from '../stores/theme.store'
import type { PlayerTrack } from '../types/player'
import {
  ChevronDownIconSVG,
  EditIconSVG,
  HeartIconSVG,
  PlayIconSVG,
  PlusIconSVG,
  SearchIconSVG,
  SortIconSVG,
  TrashIconSVG,
  UploadCloudSVG,
} from '../components/icons'

export const Route = createFileRoute('/dev/design')({
  component: DesignPlayground,
})

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
        {hint ? <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p> : null}
      </div>
      <Card padding="lg" className="flex flex-col gap-5">
        {children}
      </Card>
    </section>
  )
}

function Token({ children }: { children: ReactNode }) {
  return <code className="font-mono text-caption text-muted-foreground">{children}</code>
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
  { token: 'canvas', className: 'bg-background' },
  { token: 'canvas-deep', className: 'bg-muted' },
  { token: 'panel', className: 'bg-card' },
  { token: 'stone', className: 'bg-secondary' },
  { token: 'ink', className: 'bg-foreground' },
  { token: 'ink-soft', className: 'bg-muted-foreground' },
  { token: 'primary (accent)', className: 'bg-primary' },
  { token: 'primary-strong', className: 'bg-primary-strong' },
]

const SEMANTICS = [
  { token: 'success', className: 'bg-success' },
  { token: 'success-soft', className: 'bg-success-soft' },
  { token: 'danger', className: 'bg-destructive' },
  { token: 'danger-soft', className: 'bg-destructive-soft' },
  { token: 'warning', className: 'bg-warning' },
  { token: 'warning-soft', className: 'bg-warning-soft' },
  { token: 'scrim', className: 'bg-scrim' },
]

const ACCENT_CANDIDATES = [
  { name: 'Violet (current)', hex: '#8b7bf0' },
  { name: 'Indigo', hex: '#818cf8' },
  { name: 'Teal', hex: '#2fb8a8' },
  { name: 'Rose', hex: '#e8796b' },
]

const BUTTON_VARIANTS = ['primary', 'brand', 'outline', 'ghost', 'danger'] as const
const BUTTON_SIZES = ['sm', 'md'] as const
const ICON_SIZES = ['sm', 'md', 'lg'] as const
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
  { title: 'Analog Dreams', subtitle: 'Album · The Hollow Suns', artistName: 'The Hollow Suns', onPlay: noop },
  {
    title: 'Late Night Mix',
    subtitle: 'Playlist · 24 tracks',
    artistName: 'Groovy',
    badge: <Badge tone="brand">New</Badge>,
    onPlay: noop,
  },
  { title: 'Marlowe', subtitle: 'Artist', artistName: 'Marlowe', isRoundImage: true, onPlay: noop },
  { title: 'Rare B-Sides', subtitle: 'No artwork', fallbackInitials: 'RB', onPlay: noop },
  { title: 'Sunroom', subtitle: 'Album · Iris', artistName: 'Iris', onPlay: noop },
]

const GRID_TILES: MediaTileProps[] = [
  { title: 'Midnight Drive', subtitle: 'Nova', artistName: 'Nova', onPlay: noop },
  { title: 'Analog Dreams', subtitle: 'The Hollow Suns', artistName: 'The Hollow Suns', onPlay: noop },
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
  const [centerSheet, setCenterSheet] = useState(false)
  const [eyebrowMono, setEyebrowMono] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [switchOff, setSwitchOff] = useState(false)

  if (!import.meta.env.DEV) {
    return (
      <div>
        <Eyebrow tone="muted">dev only</Eyebrow>
        <p className="mt-2 text-body text-muted-foreground">
          The design playground is only available in development.
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-10"
      style={
        {
          '--font-eyebrow': eyebrowMono ? 'var(--font-mono)' : 'var(--font-sans)',
        } as CSSProperties
      }
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow tone="brand">design system</Eyebrow>
          <h1 className="font-serif text-display text-foreground">Playground</h1>
          <p className="mt-1 max-w-prose text-body text-muted-foreground">
            Every token and primitive in one screen, rendered with the system
            itself. Toggle the theme to check both surfaces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEyebrowMono((v) => !v)}
          >
            {eyebrowMono ? 'Eyebrow: Plex Mono' : 'Eyebrow: Inter'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            leftIcon={<SortIconSVG className="h-3.5 w-3.5" />}
          >
            {theme === 'dark' ? 'Light' : 'Dark'} mode
          </Button>
        </div>
      </div>

      {/* Typography */}
      <Section
        title="Type roles"
        hint="Fraunces for display, Inter for body/UI and labels, IBM Plex Mono for numerals and code. Use the header button to A/B the eyebrow face."
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
            <Token>text-eyebrow · font-eyebrow (Inter)</Token>
            <Eyebrow>Eyebrow label</Eyebrow>
          </div>
          <div>
            <Token>numerals / code · font-mono (Plex Mono)</Token>
            <p className="font-mono text-body text-foreground">
              128 · 3:47 · 24.9k · JAM-8K2Q
            </p>
          </div>
        </div>
      </Section>

      {/* Color */}
      <Section title="Surfaces & ink" hint="The working palette.">
        <SwatchGrid items={SURFACES} />
      </Section>

      <Section
        title="Semantic state"
        hint="Use these instead of raw red / green / amber. Danger is the calmer #dc2626."
      >
        <SwatchGrid items={SEMANTICS} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-success text-body">Success text</span>
          <span className="text-destructive text-body">Danger text</span>
          <span className="text-warning text-body">Warning text</span>
          <span className="text-primary text-body">Brand text</span>
        </div>
      </Section>

      {/* Accent decision aid */}
      <Section
        title="Dark-mode accent candidates"
        hint="Decision aid. Lime is gone; Violet is applied now. Pick one and it becomes the token."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ACCENT_CANDIDATES.map((candidate) => (
            <div key={candidate.name} className="flex flex-col gap-2">
              <div
                className="flex h-10 items-center justify-center rounded-control font-eyebrow text-caption font-semibold uppercase"
                style={{ background: candidate.hex, color: '#171813' }}
              >
                Button
              </div>
              <div
                className="h-2 rounded-full"
                style={{ background: candidate.hex }}
              />
              <span
                className="text-body font-medium"
                style={{ color: candidate.hex }}
              >
                {candidate.name}
              </span>
              <Token>{candidate.hex}</Token>
            </div>
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section
        title="Buttons"
        hint="Primary is solid ink with a brand-accent hover — Groovy's signature CTA."
      >
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_SIZES.map((size) => (
            <Button key={size} size={size} variant="outline">
              size · {size}
            </Button>
          ))}
          <Button variant="primary" leftIcon={<PlayIconSVG className="h-3.5 w-3.5" />}>
            With icon
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
          {ICON_SIZES.map((size) => (
            <IconButton
              key={size}
              size={size}
              aria-label={`Play (${size})`}
              className="border border-border bg-card"
            >
              <PlayIconSVG className="h-4 w-4" />
            </IconButton>
          ))}
          <IconButton aria-label="Like" className="border border-border bg-card">
            <HeartIconSVG className="h-4 w-4" />
          </IconButton>
          <IconButton aria-label="Search" className="border border-border bg-card">
            <SearchIconSVG className="h-4 w-4" />
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
          {(['plain', 'muted', 'interactive'] as const).map((variant) => (
            <Card key={variant} variant={variant} padding="md">
              <Eyebrow>{variant}</Eyebrow>
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
        <div className="overflow-hidden rounded-surface border border-border">
          {SONG_VARIANTS.map((variant, i) => (
            <div key={variant} className="border-b border-border last:border-b-0">
              <div className="bg-muted/50 px-4 py-1">
                <Eyebrow tone="muted">variant · {variant}</Eyebrow>
              </div>
              <SongRow
                track={SAMPLE_TRACKS[i % SAMPLE_TRACKS.length]}
                index={i}
                variant={variant}
                trackNumberDisplay={i + 1}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Song rows — states */}
      <Section
        title="Song rows — states & metadata"
        hint="Plays count, artist/producer credits, scheduled (locked), added-by, reorder grip."
      >
        <div className="overflow-hidden rounded-surface border border-border">
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
          <MediaTile
            title="Nova"
            subtitle="Artist"
            artistName="Nova"
            isRoundImage
          />
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
        <div className="overflow-hidden rounded-surface border border-border">
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

      {/* Switch */}
      <Section
        title="Switch"
        hint="Boolean on/off — primary when on, quiet surface when off."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-control border border-border bg-background px-3.5 py-3">
            <div>
              <p className="font-sans text-caption font-semibold text-foreground">
                Private account
              </p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Only approved followers see your activity.
              </p>
            </div>
            <Switch
              checked={switchOn}
              onChange={setSwitchOn}
              aria-label="Private account"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-control border border-border bg-background px-3.5 py-3">
            <div>
              <p className="font-sans text-caption font-semibold text-foreground">
                Allow comments
              </p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Listeners can leave comments.
              </p>
            </div>
            <Switch
              checked={switchOff}
              onChange={setSwitchOff}
              aria-label="Allow comments"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch checked onChange={() => {}} size="sm" aria-label="Small on" />
            <span className="text-caption text-muted-foreground">sm · on</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={false} onChange={() => {}} size="sm" aria-label="Small off" />
            <span className="text-caption text-muted-foreground">sm · off</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked onChange={() => {}} aria-label="Medium on" />
            <span className="text-caption text-muted-foreground">md · on</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={false} onChange={() => {}} aria-label="Medium off" />
            <span className="text-caption text-muted-foreground">md · off</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked disabled onChange={() => {}} aria-label="Disabled on" />
            <span className="text-caption text-muted-foreground">disabled</span>
          </div>
        </div>
      </Section>

      {/* Section header */}
      <Section
        title="Section header"
        hint="One header for every page — no more per-page sticky chrome."
      >
        <div className="overflow-hidden rounded-surface border border-border">
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
      <Section title="Radius & elevation" hint="Four radius roles, two shadows.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['rounded-control', 'rounded-control'],
              ['rounded-inset', 'rounded-inset'],
              ['rounded-surface', 'rounded-surface'],
              ['rounded-full', 'rounded-full'],
            ] as const
          ).map(([label, cls]) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={cn('h-16 w-16 border border-border bg-card', cls)} />
              <Token>{label}</Token>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['flat (border)', 'border shadow-none'],
              ['shadow-raised', 'shadow-raised'],
              ['shadow-floating', 'shadow-floating'],
            ] as const
          ).map(([label, cls]) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  'flex h-16 w-full items-center justify-center rounded-surface border-border bg-card text-caption text-muted-foreground',
                  cls,
                )}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Sheets */}
      <Section title="Sheets" hint="Scrim + Escape + body-scroll lock + safe-area, once.">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setBottomSheet(true)}>
            <UploadCloudSVG className="h-4 w-4" /> Bottom sheet
          </Button>
          <Button variant="outline" onClick={() => setCenterSheet(true)}>
            <EditIconSVG className="h-4 w-4" /> Centered dialog
          </Button>
        </div>
      </Section>

      {/* Sheet instances */}
      <Sheet
        open={bottomSheet}
        onClose={() => setBottomSheet(false)}
        title="Bottom sheet"
      >
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body text-muted-foreground">
            Slides from the bottom, respects the home indicator, caps at 85dvh.
          </p>
          <div className="flex flex-col gap-1">
            {['Save to library', 'Add to playlist', 'Share'].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setBottomSheet(false)}
                className="flex items-center gap-3 rounded-inset px-3 py-3 text-left text-body text-foreground transition-colors hover:bg-secondary/20"
              >
                <PlusIconSVG className="h-4 w-4 text-muted-foreground" />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBottomSheet(false)}
              className="mt-1 flex items-center gap-3 rounded-inset px-3 py-3 text-left text-body text-destructive transition-colors hover:bg-destructive-soft"
            >
              <TrashIconSVG className="h-4 w-4" />
              Remove
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={centerSheet}
        onClose={() => setCenterSheet(false)}
        title="Centered dialog"
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
              rightIcon={<ChevronDownIconSVG className="h-3.5 w-3.5" />}
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
