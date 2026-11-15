/**
 * Your personal releases, with the tracks you have in them.
 *
 * The shared state lives in VaultManageContext.
 */
import { Link } from '@tanstack/react-router'
import { ProceduralCover } from '../../common/ProceduralCover'
import { SongRow } from '../../common/SongRow'
import {
  PlayIconSVG,
  TrashIconSVG,
  UploadCloudSVG,
  ChevronDownIconSVG,
  PlusIconSVG,
  ExternalLinkSVG,
  SearchIconSVG,
} from '../../Icons'


import { useVaultManage } from './VaultManageContext'
import { H2 } from '../../ui/typography'

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
    toggleExpandRelease,  } = useVaultManage()

  return (

          <div className="space-y-6">
            {/* Active Artist Filter Banner */}
            {selectedArtistFilter && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between font-mono text-caption text-primary">
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
                <input
                  type="text"
                  placeholder="Search releases, artists, or songs in collection..."
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                  className="w-full font-mono text-caption py-2.5 pl-9 pr-9 border border-border bg-card rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-raised"
                />
                <SearchIconSVG className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {collectionSearch && (
                  <button
                    type="button"
                    onClick={() => setCollectionSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-caption p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTabChange('import')}
                  className="inline-flex items-center justify-center gap-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 bg-foreground text-background hover:opacity-90 rounded-md transition-all shadow-xs shrink-0 cursor-pointer font-medium"
                >
                  <PlusIconSVG className="w-3.5 h-3.5" />
                  <span>Import Music</span>
                </button>
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground shrink-0 border-l border-border pl-3">
                  {filteredReleases.length}{' '}
                  {filteredReleases.length === 1 ? 'Release' : 'Releases'}
                </span>
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
                    Upload your offline MP3, FLAC, WAV, AAC, or OGG files. They
                    will be stored securely in your private vault with full
                    metadata tags and album clusters.
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
                      className="border border-border bg-card shadow-xs overflow-hidden transition-all rounded-xl hover:border-foreground/40"
                    >
                      {/* Release Header */}
                      <div className="p-3.5 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                        {/* Left Info: Artwork + Title + Badges + Artist */}
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                          {/* Clickable Artwork Cover */}
                          <Link
                            to="/albums/$idOrSlug"
                            params={{ idOrSlug: release.slug || release.id }}
                            className="relative w-14 h-14 sm:w-16 sm:h-16 bg-background border border-border shrink-0 overflow-hidden shadow-raised group/cover block rounded-lg"
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
                              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 font-semibold shrink-0 rounded-control">
                                {release.albumType || 'Album'}
                              </span>
                              {release.genre && (
                                <span className="hidden sm:inline-block font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground bg-background border border-border px-1.5 py-0.5 shrink-0 rounded-control">
                                  {release.genre}
                                </span>
                              )}
                            </div>

                            {/* Artist Link & Track Stats */}
                            <p className="font-sans text-caption text-muted-foreground truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <Link
                                to="/artists/$idOrSlug"
                                params={{
                                  idOrSlug:
                                    release.artistSlug || release.artistId,
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
                                    {Math.floor(
                                      release.totalDurationSeconds / 60,
                                    )}
                                    m {release.totalDurationSeconds % 60}s
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
                              <button
                                type="button"
                                onClick={() =>
                                  handlePlayPersonalTrack(
                                    release,
                                    release.tracks[0],
                                    0,
                                  )
                                }
                                className="h-8 px-2.5 sm:px-3 border border-border bg-background hover:bg-card flex items-center gap-1.5 text-foreground transition-colors cursor-pointer shadow-raised font-eyebrow text-eyebrow uppercase tracking-wider rounded-md"
                                title="Play Release from Beginning"
                              >
                                <PlayIconSVG className="w-3.5 h-3.5 text-primary ml-0.5" />
                                <span className="hidden sm:inline">Play</span>
                              </button>
                            )}

                            {/* Queue Entire Release Button */}
                            {release.tracks?.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleQueuePersonalRelease(release)
                                }
                                className="h-8 px-2.5 sm:px-3 border border-border bg-background hover:bg-card flex items-center gap-1.5 text-foreground transition-colors cursor-pointer shadow-raised font-eyebrow text-eyebrow uppercase tracking-wider rounded-md"
                                title="Add all tracks from this release to Queue"
                              >
                                <PlusIconSVG className="w-3 h-3 text-muted-foreground" />
                                <span>+ Queue</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Toggle Expand Tracks Button */}
                            <button
                              type="button"
                              onClick={() => toggleExpandRelease(release.id)}
                              className={`h-8 px-3 border border-border bg-background hover:bg-card text-foreground transition-colors cursor-pointer font-eyebrow text-eyebrow uppercase tracking-wider flex items-center gap-1.5 rounded-md ${
                                isExpanded ? 'bg-card border-muted-foreground' : ''
                              }`}
                              title={
                                isExpanded ? 'Hide tracklist' : 'View all tracks'
                              }
                            >
                              <span>
                                {isExpanded
                                  ? 'Hide'
                                  : `Tracklist (${release.totalTracks})`}
                              </span>
                              <ChevronDownIconSVG
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isExpanded
                                    ? 'rotate-180 text-primary'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </button>

                            {/* Delete Release Button */}
                            <button
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
                              className="w-8 h-8 border border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground flex items-center justify-center transition-colors cursor-pointer shadow-raised rounded-md"
                              title="Delete Release from Personal Collection"
                            >
                              {isDeletingRelease ? (
                                <div className="w-3 h-3 border border-destructive border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <TrashIconSVG className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Tracks List */}
                      {isExpanded && release.tracks && (
                        <div className="border-t border-border bg-muted/20 divide-y divide-border/60">
                          {/* Tracklist Sub-header (Desktop) */}
                          <div className="hidden sm:flex items-center justify-between gap-4 px-4 py-2 border-b border-border/60 bg-background/30 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <span className="w-7 text-center">#</span>
                              <span>Cut Title &amp; Collaborators</span>
                            </div>
                            <div className="flex items-center justify-end gap-6 shrink-0 pr-3">
                              <span>Actions &amp; Duration</span>
                            </div>
                          </div>

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
                                    icon: (
                                      <TrashIconSVG className="w-3.5 h-3.5" />
                                    ),
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
