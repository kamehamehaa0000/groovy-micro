import { Link } from '@tanstack/react-router'
import {
  Calendar,
  Check,
  ChevronDown,
  Disc3,
  ExternalLink,
  Globe,
  Link2,
  ListMusic,
  Lock,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react'
import type { Album, ReleaseVisibility, Song } from '../../types/catalog'
import { formatDuration } from '../../lib/catalog.api'
import { MarqueeText } from '../common/MarqueeText'

interface ReleaseCardProps {
  album: Album
  tracks: Song[]
  /** True while the cut list is being fetched (the card was just expanded). */
  isLoadingTracks: boolean
  isExpanded: boolean
  isVisibilityMenuOpen: boolean
  onToggleVisibilityMenu: () => void
  onCloseVisibilityMenu: () => void
  onChangeVisibility: (visibility: ReleaseVisibility) => void
  onToggleExpand: () => void
  onCopySecretLink: () => void
  onEdit: () => void
  onDelete: () => void
  onDetachCut: (track: Song) => void
  onDeleteCut: (track: Song) => void
}

export function ReleaseCard({
  album,
  tracks,
  isLoadingTracks,
  isExpanded,
  isVisibilityMenuOpen,
  onToggleVisibilityMenu,
  onCloseVisibilityMenu,
  onChangeVisibility,
  onToggleExpand,
  onCopySecretLink,
  onEdit,
  onDelete,
  onDetachCut,
  onDeleteCut,
}: ReleaseCardProps) {
  const cuts = album.totalTracks || tracks.length || 1
  const vis = album.visibility || 'PUBLIC'
  const visLabel =
    vis === 'UNLISTED'
      ? 'Unlisted'
      : vis === 'PRIVATE'
        ? 'Private'
        : 'Public'
  const visClass =
    vis === 'UNLISTED'
      ? 'bg-info-soft text-info'
      : vis === 'PRIVATE'
        ? 'bg-destructive-soft text-destructive'
        : 'bg-background text-muted-foreground hover:text-foreground'
  const VisIcon =
    vis === 'UNLISTED' ? Link2 : vis === 'PRIVATE' ? Lock : Globe
  const isScheduled = album.status === 'SCHEDULED'
  const isDraft = album.status === 'DRAFT'

  return (
    <div
      key={album.id}
      className="bg-card rounded-2xl shadow-raised min-w-0 overflow-hidden"
    >
      <div className="flex items-start gap-3.5 p-4 sm:p-5 min-w-0">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-muted overflow-hidden shrink-0 relative shadow-xs">
          {album.coverImageUrl ? (
            <img
              src={album.coverImageUrl}
              alt={album.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Disc3 className="w-6 h-6 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 bg-background text-primary font-semibold rounded-full shrink-0">
              {album.albumType}
            </span>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={onToggleVisibilityMenu}
                className={`font-eyebrow text-eyebrow uppercase tracking-wider pl-2 pr-1.5 py-0.5 rounded-full flex items-center gap-1 cursor-pointer transition-colors ${visClass}`}
                title="Change release visibility"
                aria-haspopup="menu"
                aria-expanded={isVisibilityMenuOpen}
              >
                <VisIcon className="w-3 h-3 shrink-0" />
                <span>{visLabel}</span>
                <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
              </button>

              {isVisibilityMenuOpen && (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={onCloseVisibilityMenu}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1.5 z-50 w-40 bg-card rounded-xl shadow-floating p-1.5 border-none"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCloseVisibilityMenu()
                        onChangeVisibility('PUBLIC')
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left font-eyebrow text-eyebrow uppercase tracking-wider hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1">Public</span>
                      {vis === 'PUBLIC' && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                      )}
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCloseVisibilityMenu()
                        onChangeVisibility('UNLISTED')
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left font-eyebrow text-eyebrow uppercase tracking-wider hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1">Unlisted</span>
                      {vis === 'UNLISTED' && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                      )}
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCloseVisibilityMenu()
                        onChangeVisibility('PRIVATE')
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left font-eyebrow text-eyebrow uppercase tracking-wider hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1">Private</span>
                      {vis === 'PRIVATE' && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <MarqueeText
            className="min-w-0 w-full"
            innerClassName="text-title font-semibold text-foreground sm:text-lg"
          >
            {album.title}
          </MarqueeText>

          <div className="font-mono text-eyebrow text-muted-foreground flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
            <span>{cuts} cuts</span>
            <span aria-hidden="true">·</span>
            <span>
              {formatDuration(album.totalDurationSeconds)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{album.likesCount} likes</span>
            {isScheduled && (album.preSavesCount ?? 0) > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{album.preSavesCount} pre-saves</span>
              </>
            )}
          </div>

          <div className="font-eyebrow text-eyebrow uppercase tracking-wider flex items-center gap-1.5 min-w-0">
            {isScheduled ? (
              <>
                <Calendar className="w-3 h-3 shrink-0 text-warning" />
                <span className="truncate text-warning">
                  Scheduled ·{' '}
                  {album.scheduledReleaseAt
                    ? new Date(
                        album.scheduledReleaseAt,
                      ).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Upcoming'}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isDraft ? 'bg-muted-foreground' : 'bg-success'
                  }`}
                />
                <span
                  className={`truncate ${
                    isDraft
                      ? 'text-muted-foreground'
                      : 'text-success'
                  }`}
                >
                  {isDraft
                    ? 'Draft'
                    : `Published · ${
                        album.releaseDate
                          ? new Date(
                              album.releaseDate,
                            ).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Recent'
                      }`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-border-soft px-3 sm:px-4 py-2.5 bg-card/60">
        <button
          type="button"
          onClick={onDelete}
          className="p-2 rounded-full bg-background hover:bg-destructive-soft text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
          title="Move to 30-Day Trash"
          aria-label={`Move ${album.title} to 30-Day Trash`}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {vis === 'UNLISTED' && album.shareToken && (
          <button
            type="button"
            onClick={onCopySecretLink}
            className="p-2 rounded-full bg-info-soft text-info hover:bg-info/20 cursor-pointer transition-colors"
            title="Copy secret share link"
            aria-label={`Copy secret share link for ${album.title}`}
          >
            <Link2 className="w-4 h-4" />
          </button>
        )}

        <Link
          to="/albums/$idOrSlug"
          params={{ idOrSlug: album.slug }}
          search={
            album.shareToken
              ? { shareToken: album.shareToken }
              : {}
          }
          className="p-2 rounded-full bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
          title="View release in catalog"
          aria-label={`View ${album.title} in catalog`}
        >
          <ExternalLink className="w-4 h-4" />
        </Link>

        <button
          type="button"
          onClick={onEdit}
          className="p-2 rounded-full bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Edit release details"
          aria-label={`Edit ${album.title}`}
        >
          <Pencil className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className={`p-2 rounded-full cursor-pointer transition-colors ${
            isExpanded
              ? 'bg-foreground text-background shadow-xs'
              : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
          }`}
          title={
            isExpanded
              ? `Hide ${cuts} cuts`
              : `Show ${cuts} cuts`
          }
          aria-label={
            isExpanded
              ? `Hide the ${cuts} cuts in ${album.title}`
              : `Show the ${cuts} cuts in ${album.title}`
          }
          aria-expanded={isExpanded}
        >
          <ListMusic className="w-4 h-4" />
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-border-soft px-3 sm:px-4 py-3 space-y-2.5">
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
            Master Cuts ({tracks.length})
          </span>

          {isLoadingTracks && tracks.length === 0 ? (
            <div className="font-mono text-caption text-muted-foreground animate-pulse">
              Loading cuts...
            </div>
          ) : tracks.length === 0 ? (
            <div className="font-sans text-caption text-muted-foreground italic">
              No cuts in this release yet.
            </div>
          ) : (
            <div className="bg-background rounded-xl divide-y divide-border-soft overflow-hidden">
              {tracks.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-caption min-w-0"
                >
                  <span className="font-mono text-eyebrow text-muted-foreground w-5 shrink-0 text-right">
                    {String(
                      track.trackNumber || i + 1,
                    ).padStart(2, '0')}
                  </span>

                  <div className="min-w-0 flex-1">
                    <MarqueeText
                      className="min-w-0 w-full"
                      innerClassName="font-sans text-caption font-medium text-foreground"
                    >
                      {track.title}
                    </MarqueeText>
                  </div>

                  {track.isExplicit && (
                    <span className="font-mono text-eyebrow px-1 bg-muted text-muted-foreground rounded-control shrink-0">
                      E
                    </span>
                  )}

                  <span className="font-mono text-eyebrow text-muted-foreground shrink-0">
                    {formatDuration(track.durationSeconds)}
                  </span>

                  {album.albumType !== 'SINGLE' && (
                    <button
                      type="button"
                      onClick={() => onDetachCut(track)}
                      className="p-1.5 rounded-full bg-card hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0 transition-colors"
                      title="Detach cut into a standalone single"
                      aria-label={`Detach ${track.title} into a standalone single`}
                    >
                      <Scissors className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteCut(track)}
                    className="p-1.5 rounded-full hover:bg-destructive-soft text-muted-foreground hover:text-destructive cursor-pointer shrink-0 transition-colors"
                    title="Move cut to 30-Day Trash"
                    aria-label={`Move ${track.title} to trash`}
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
