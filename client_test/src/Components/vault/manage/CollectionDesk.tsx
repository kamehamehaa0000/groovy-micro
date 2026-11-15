/**
 * Your personal releases, with the tracks you have in them.
 *
 * The shared state lives in VaultManageContext.
 */
import { Link } from '@tanstack/react-router'
import { ProceduralCover } from '../../common/ProceduralCover'
import { SongRow } from '../../common/SongRow'
import {
  TrashIconSVG,
  UploadCloudSVG,
  PlusIconSVG,
  ExternalLinkSVG,
  SearchIconSVG,
} from '../../Icons'

import { useVaultManage } from './VaultManageContext'
import { H2 } from '../../ui/typography'
import { Button, Input } from '../../ui'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ListPlusIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  X,
} from 'lucide-react'

export function CollectionDesk() {
  const {
    selectedArtistFilter,
    setSelectedArtistFilter,
    personalReleases,
    isLoadingReleases,
    collectionSearch,
    setCollectionSearch,
    expandedReleaseIds,
    filteredReleases,
    handlePlayPersonalTrack,
    handleQueuePersonalRelease,
    deletingItemId,
    setDeleteConfirm,
    toPlayerTrack,
    handleTabChange,
    toggleExpandRelease,
  } = useVaultManage()

  return (
    <div className="space-y-6">
      {/* Active Artist Filter Banner */}
      {selectedArtistFilter && (
        <div className="p-3 bg-primary/10  rounded-xl flex items-center justify-between font-mono text-caption text-primary">
          <div className="flex items-center gap-2">
            <span>Filtering collection by artist:</span>
            <strong className="text-foreground font-bold">
              "{selectedArtistFilter}"
            </strong>
          </div>
          <button
            type="button"
            onClick={() => setSelectedArtistFilter(null)}
            className="underline hover:opacity-80 cursor-pointer font-bold"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Search & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative w-full sm:max-w-md">
          <Input
            type="text"
            placeholder="Search releases, artists, or songs in collection..."
            value={collectionSearch}
            onChange={(e) => setCollectionSearch(e.target.value)}
            className="w-full font-mono text-caption py-2.5 pl-9 pr-9 bg-card rounded-full text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-raised"
          />
          <SearchIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          {collectionSearch && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setCollectionSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-caption p-1"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <Button
            variant="pixel"
            size="sm"
            type="button"
            onClick={() => handleTabChange('import')}
          >
            <PlusIcon className="w-4 h-4" />
            <span>Import Music</span>
          </Button>
        </div>
      </div>

      {/* Releases Content */}
      {isLoadingReleases ? (
        <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
          Loading personal collection...
        </div>
      ) : personalReleases.length === 0 ? (
        /* Empty Collection State */
        <div className="p-12 border border-dashed border-border bg-card/40 rounded-2xl text-center space-y-4 my-4">
          <div className="w-14 h-14 bg-background border border-border text-primary rounded-xl flex items-center justify-center mx-auto text-2xl shadow-raised">
            <UploadCloudSVG className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Your Personal Collection is Empty
            </H2>
            <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto leading-relaxed">
              Upload your offline MP3, FLAC, WAV, AAC, or OGG files.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleTabChange('import')}
            className="mt-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 bg-foreground text-background hover:opacity-90 rounded-md transition-all font-semibold cursor-pointer inline-flex items-center gap-2 shadow-xs"
          >
            <UploadCloudSVG className="w-4 h-4" />
            <span>Start Importing Music</span>
          </button>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-caption font-mono border border-border bg-card rounded-xl">
          No releases match "{collectionSearch}".
        </div>
      ) : (
        /* Releases Cards List */
        <div className="space-y-4">
          {filteredReleases.map((release) => {
            const isExpanded = expandedReleaseIds.has(release.id)
            const isDeletingRelease = deletingItemId === release.id

            return (
              <div
                key={release.id}
                className=" bg-card shadow-xs overflow-hidden transition-all rounded-xl hover:border-foreground/40"
              >
                {/* Release Header */}
                <div className="p-3.5 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  {/* Left Info: Artwork + Title + Badges + Artist */}
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Clickable Artwork Cover */}
                    <Link
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: release.slug || release.id }}
                      className="relative w-14 h-14 sm:w-16 sm:h-16 bg-background  shrink-0 overflow-hidden shadow-raised group/cover block rounded-lg"
                      title={`View "${release.title}" album page`}
                    >
                      {release.coverImageUrl ? (
                        <img
                          src={release.coverImageUrl}
                          alt={release.title}
                          className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <ProceduralCover
                          size="md"
                          title={release.title}
                          artistName={release.artistName}
                          className="w-full h-full rounded-none"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLinkSVG className="w-4 h-4 text-white" />
                      </div>
                    </Link>

                    {/* Release Title & Artist */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Link
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: release.slug || release.id }}
                          className="text-title sm:text-lg text-foreground font-medium hover:text-primary transition-colors line-clamp-1 truncate max-w-full"
                          title={release.title}
                        >
                          {release.title}
                        </Link>
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 font-semibold shrink-0 rounded-control">
                          {release.albumType || 'Album'}
                        </span>
                      </div>

                      {/* Artist Link & Track Stats */}
                      <p className="font-sans text-caption text-muted-foreground truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <Link
                          to="/artists/$idOrSlug"
                          params={{
                            idOrSlug: release.artistSlug || release.artistId,
                          }}
                          className="text-muted-foreground hover:text-foreground hover:underline transition-colors font-medium truncate"
                          title={`View ${release.artistName}'s profile`}
                        >
                          {release.artistName}
                        </Link>
                        <span className="opacity-60">&bull;</span>
                        <span className="font-mono text-eyebrow">
                          {release.totalTracks}{' '}
                          {release.totalTracks === 1 ? 'track' : 'tracks'}
                        </span>
                        {release.totalDurationSeconds > 0 && (
                          <>
                            <span className="opacity-60">&bull;</span>
                            <span className="font-mono text-eyebrow">
                              {Math.floor(release.totalDurationSeconds / 60)}m{' '}
                              {release.totalDurationSeconds % 60}s
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Action Controls (Responsive Bar) */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    <div className="flex items-center gap-2">
                      {/* Play Release Button */}
                      {release.tracks?.length > 0 && (
                        <Button
                          variant="pixel"
                          size="sm"
                          type="button"
                          onClick={() =>
                            handlePlayPersonalTrack(
                              release,
                              release.tracks[0],
                              0,
                            )
                          }
                          title="Play Release from Beginning"
                        >
                          <PlayIcon className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Queue Entire Release Button */}
                      {release.tracks?.length > 0 && (
                        <Button
                          variant="pixel"
                          size="sm"
                          type="button"
                          onClick={() => handleQueuePersonalRelease(release)}
                          title="Add all tracks from this release to Queue"
                        >
                          <ListPlusIcon className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Toggle Expand Tracks Button */}
                      <Button
                        variant="pixel"
                        size="sm"
                        type="button"
                        onClick={() => toggleExpandRelease(release.id)}
                        title={
                          isExpanded ? 'Hide tracklist' : 'View all tracks'
                        }
                      >
                        <span>
                          {isExpanded ? (
                            <ChevronUpIcon className="w-4 h-4" />
                          ) : (
                            <ChevronDownIcon className="w-4 h-4" />
                          )}
                        </span>
                      </Button>

                      {/* Delete Release Button */}
                      <Button
                        variant="pixel"
                        size="sm"
                        type="button"
                        disabled={isDeletingRelease}
                        onClick={() =>
                          setDeleteConfirm({
                            type: 'release',
                            id: release.id,
                            title: release.title,
                            trackCount: release.totalTracks,
                          })
                        }
                        title="Delete Release from Personal Collection"
                      >
                        {isDeletingRelease ? (
                          <Loader2Icon className=" w-4 h-4 animate-spin" />
                        ) : (
                          <TrashIcon className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expanded Tracks List */}
                {isExpanded && release.tracks && (
                  <div className="border-t border-border bg-muted/20 divide-y divide-border/60">
                    {release.tracks.map((track, tIdx) => {
                      const primaryCredits = (track.credits || [])
                        .filter((c) => c.role === 'PRIMARY')
                        .map((c) => ({
                          artistId: c.artistId,
                          stageName: c.stageName,
                          slug: c.slug,
                          role: c.role,
                        }))
                      const featuredCredits = (track.credits || [])
                        .filter((c) => c.role === 'FEATURED')
                        .map((c) => ({
                          artistId: c.artistId,
                          stageName: c.stageName,
                          slug: c.slug,
                          role: c.role,
                        }))

                      return (
                        <SongRow
                          key={track.id}
                          track={toPlayerTrack(release, track)}
                          index={tIdx}
                          trackNumberDisplay={track.trackNumber || tIdx + 1}
                          variant="album"
                          isPersonal={true}
                          primaryCredits={primaryCredits}
                          featuredCredits={featuredCredits}
                          onPlay={() =>
                            handlePlayPersonalTrack(release, track, tIdx)
                          }
                          customActions={[
                            {
                              label: 'Delete Track from Vault',
                              danger: true,
                              icon: <TrashIconSVG className="w-3.5 h-3.5" />,
                              onClick: () => {
                                setDeleteConfirm({
                                  type: 'song',
                                  id: track.id,
                                  title: track.title,
                                  parentReleaseId: release.id,
                                })
                              },
                            },
                          ]}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
