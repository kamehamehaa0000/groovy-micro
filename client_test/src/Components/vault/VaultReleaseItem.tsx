import { Link } from '@tanstack/react-router'
import { ProceduralCover } from '../common/ProceduralCover'
import { ReleaseActionMenu } from '../common/ReleaseActionMenu'
import { PauseIconSVG, PlayIconSVG } from '../Icons'
import type { PersonalRelease } from '../../lib/storage.api'

export interface VaultReleaseItemProps {
  release: PersonalRelease
  view: 'grid' | 'list'
  /** The release is the one that is playing right now. */
  isPlaying?: boolean
  onPlay: () => void
  onDeleteRequest: (release: PersonalRelease) => void
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * One release in the personal vault, as a card or as a row.
 *
 * The page used to keep two full markup trees for the same release — one for
 * the grid, one for the list — and the artwork, the play button and the
 * action menu drifted apart between them. One component, two layouts.
 */
export function VaultReleaseItem({
  release,
  view,
  isPlaying = false,
  onPlay,
  onDeleteRequest,
}: VaultReleaseItemProps) {
  const releaseYear = release.releaseDate
    ? new Date(release.releaseDate).getFullYear()
    : release.createdAt
      ? new Date(release.createdAt).getFullYear()
      : null

  const playButton = (size: 'sm' | 'md') => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onPlay()
      }}
      aria-label={isPlaying ? `Pause ${release.title}` : `Play ${release.title}`}
      className={`absolute bottom-2 right-2 bg-primary text-background rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        size === 'sm' ? 'w-8 h-8' : 'w-9 h-9'
      } ${
        isPlaying
          ? 'opacity-100 scale-100 ring-2 ring-white/50'
          : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 scale-100 sm:scale-90 sm:group-hover:scale-100 hover:scale-105'
      }`}
    >
      {isPlaying ? (
        <PauseIconSVG className="w-3.5 h-3.5 text-white" />
      ) : (
        <PlayIconSVG className="w-3.5 h-3.5 text-white ml-0.5" />
      )}
    </button>
  )

  const actionMenu = (buttonClassName?: string) => (
    <ReleaseActionMenu
      release={release}
      onDeleteRequest={onDeleteRequest}
      buttonClassName={buttonClassName}
    />
  )

  if (view === 'list') {
    return (
      <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-muted/80 active:scale-[0.99] transition-all select-none">
        <Link
          to="/albums/$idOrSlug"
          params={{ idOrSlug: release.slug || release.id }}
          className="flex items-center gap-3.5 flex-1 min-w-0 text-inherit no-underline"
        >
          <div className="w-12 h-12 rounded-md bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
            {release.coverImageUrl ? (
              <img
                src={release.coverImageUrl}
                alt={release.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <ProceduralCover
                size="sm"
                title={release.title}
                artistName={release.artistName}
                className="w-full h-full rounded-none"
              />
            )}
            {playButton('sm')}
          </div>

          <div className="min-w-0 flex-1 pr-2">
            <h3 className="font-semibold text-body text-foreground group-hover:text-primary transition-colors truncate">
              {release.title}
            </h3>
            <div className="flex items-center gap-1.5 text-caption text-muted-foreground mt-0.5 truncate">
              <span className="truncate">{release.artistName}</span>
              {releaseYear ? (
                <>
                  <span className="opacity-40">·</span>
                  <span>{releaseYear}</span>
                </>
              ) : null}
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-caption text-muted-foreground hidden sm:inline">
            {formatDuration(release.totalDurationSeconds)}
          </span>
          {actionMenu()}
        </div>
      </div>
    )
  }

  return (
    <div className="group relative flex flex-col p-2.5 rounded-xl hover:bg-muted/70 active:scale-[0.98] transition-all duration-150 select-none">
      <div className="relative aspect-square w-full mb-2.5 flex items-center justify-center overflow-hidden rounded-md bg-card shadow-sm">
        <Link
          to="/albums/$idOrSlug"
          params={{ idOrSlug: release.slug || release.id }}
          className="w-full h-full block text-inherit no-underline"
        >
          {release.coverImageUrl ? (
            <img
              src={release.coverImageUrl}
              alt={release.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <ProceduralCover
              size="lg"
              title={release.title}
              artistName={release.artistName}
              className="w-full h-full rounded-none"
            />
          )}
        </Link>

        {playButton('md')}

        <div className="absolute top-1.5 right-1.5 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {actionMenu(
            'w-9 h-9 rounded-full bg-background/80 backdrop-blur-xs border border-border/60 text-foreground shadow-sm flex items-center justify-center hover:bg-background transition-colors cursor-pointer',
          )}
        </div>
      </div>

      <div className="w-full">
        <Link
          to="/albums/$idOrSlug"
          params={{ idOrSlug: release.slug || release.id }}
          className="font-semibold text-body truncate group-hover:text-primary transition-colors block text-inherit no-underline"
          title={release.title}
        >
          {release.title}
        </Link>
        <div className="text-caption text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
          <Link
            to="/artists/$idOrSlug"
            params={{ idOrSlug: release.artistSlug || release.artistId }}
            className="hover:underline hover:text-foreground truncate text-inherit no-underline"
            title={release.artistName}
          >
            {release.artistName}
          </Link>
        </div>
      </div>
    </div>
  )
}
