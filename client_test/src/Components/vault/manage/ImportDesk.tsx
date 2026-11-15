/**
 * The import desk: parse files, stage releases, upload.
 *
 * The shared state lives in VaultManageContext.
 */
import { ProceduralCover } from '../../common/ProceduralCover'
import {
  UploadCloudSVG,
} from '../../Icons'
import { Button } from '../../ui/Button'
import { useVaultManage } from './VaultManageContext'
import { H2 } from '../../ui/typography'

export function ImportDesk() {
  const {
    personalReleases,
    quota,
    totalSelectedTracks,
    isOverQuota,
    importReleases,
    setImportReleases,
    isParsing,
    parsingProgress,
    isUploading,
    uploadProgress,
    uploadStatusText,
    duplicateNotice,
    setDuplicateNotice,
    showDuplicateDetails,
    setShowDuplicateDetails,
    isCreatingContainer,
    setIsCreatingContainer,
    newContainerForm,
    setNewContainerForm,
    setMovingTrackInfo,
    handleFilesSelected,
    handleCreateStagedContainer,
    handleDetachTrackAsSingle,
    handleRemoveTrackFromStagedRelease,
    handleStartImport,
    handleTabChange,
    fileInputRef,
    folderInputRef,  } = useVaultManage()

  return (

          <div className="space-y-6">
            {/* Parsing progress indicator */}
            {isParsing && (
              <div className="p-4 bg-card text-caption text-foreground flex items-center gap-3 font-mono shadow-raised rounded-xl">
                <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin shrink-0" />
                <span>
                  Reading audio tags &amp; artwork ({parsingProgress.current} / {parsingProgress.total} files)...
                </span>
              </div>
            )}

            {/* Upload Progress Indicator */}
            {isUploading && (
              <div className="p-4 sm:p-5 bg-card space-y-2.5 shadow-raised rounded-xl">
                <div className="flex justify-between font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                  <span>{uploadStatusText}</span>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all duration-200 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Duplicate Detection Alert Banner */}
            {duplicateNotice && duplicateNotice.count > 0 && (
              <div className="p-4 bg-card text-foreground text-caption flex flex-col gap-2 shadow-raised rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-bold">✦</span>
                    <span>
                      <strong>{duplicateNotice.count}</strong> duplicate track{duplicateNotice.count === 1 ? '' : 's'} skipped (already in your collection).
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDuplicateDetails((v) => !v)}
                      className="underline hover:opacity-80 text-eyebrow uppercase tracking-wider cursor-pointer font-bold"
                    >
                      {showDuplicateDetails ? 'Hide details' : 'View skipped'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplicateNotice(null)}
                      className="cursor-pointer font-bold leading-none text-muted-foreground hover:text-foreground"
                      title="Dismiss notification"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {showDuplicateDetails && (
                  <div className="mt-2 border-t border-border/30 pt-2 space-y-1.5 max-h-44 overflow-y-auto">
                    {duplicateNotice.details.map((d, i) => (
                      <div
                        key={i}
                        className="text-eyebrow text-muted-foreground flex items-center justify-between font-sans px-1"
                      >
                        <span className="truncate">
                          <strong>{d.artistName}</strong> &mdash; {d.title}{' '}
                          <span className="text-muted-foreground/60">
                            ({d.albumTitle})
                          </span>
                        </span>
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider shrink-0 text-primary ml-3">
                          {d.reason === 'already_in_collection'
                            ? 'In Library'
                            : 'Batch Duplicate'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Review Desk / Release List */}
            {importReleases.length > 0 ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <H2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Staged Releases
                    </H2>
                    <p className="font-sans text-caption sm:text-body text-muted-foreground mt-0.5">
                      Review and organize release metadata before uploading to your vault.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCreatingContainer((v) => !v)}
                      disabled={isUploading}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground hover:underline cursor-pointer font-semibold"
                    >
                      + New Container
                    </button>
                    <span className="text-muted-foreground/30">&bull;</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      + Add More Files
                    </button>
                    <span className="text-muted-foreground/30">&bull;</span>
                    <button
                      type="button"
                      onClick={() => setImportReleases([])}
                      disabled={isUploading}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Create Staged Container Form */}
                {isCreatingContainer && (
                  <form
                    onSubmit={handleCreateStagedContainer}
                    className="p-4 sm:p-5 bg-card space-y-4 shadow-raised rounded-xl"
                  >
                    <div className="flex items-center justify-between font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-bold">
                      <span>Create Empty Release Container</span>
                      <button
                        type="button"
                        onClick={() => setIsCreatingContainer(false)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                          Release Title *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Summer Mixtape Vol. 1"
                          required
                          value={newContainerForm.title}
                          onChange={(e) =>
                            setNewContainerForm((f) => ({
                              ...f,
                              title: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 bg-background text-foreground text-caption focus:outline-none focus:ring-1 focus:ring-foreground/20 font-sans rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                          Artist Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Various Artists"
                          value={newContainerForm.artistName}
                          onChange={(e) =>
                            setNewContainerForm((f) => ({
                              ...f,
                              artistName: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 bg-background text-foreground text-caption focus:outline-none focus:ring-1 focus:ring-foreground/20 font-sans rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                          Release Type
                        </label>
                        <select
                          value={newContainerForm.albumType}
                          onChange={(e) =>
                            setNewContainerForm((f) => ({
                              ...f,
                              albumType: e.target.value as any,
                            }))
                          }
                          className="w-full px-3 py-2 bg-background text-foreground text-caption focus:outline-none focus:ring-1 focus:ring-foreground/20 font-sans rounded-lg cursor-pointer"
                        >
                          <option value="MIXTAPE">Mixtape</option>
                          <option value="EP">EP</option>
                          <option value="ALBUM">Album</option>
                          <option value="LP">LP</option>
                          <option value="SINGLE">Single</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCreatingContainer(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="pixel"
                        size="sm"
                      >
                        Create Container
                      </Button>
                    </div>
                  </form>
                )}

                {importReleases.map((release, relIdx) => (
                  <div
                    key={release.id}
                    className="bg-card p-4 sm:p-5 space-y-4 shadow-raised rounded-xl"
                  >
                    {release.targetExistingAlbumId && (
                      <div className="flex items-center gap-2 px-2.5 py-1 bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold rounded-md shadow-raised">
                        <span>
                          ↳ Appending track(s) to existing library album
                        </span>
                      </div>
                    )}

                    <div className="flex items-start gap-4">
                      {/* Cover Art Preview */}
                      <div className="w-16 h-16 sm:w-18 sm:h-18 bg-background shrink-0 overflow-hidden relative shadow-raised rounded-lg">
                        {release.coverPreviewUrl ? (
                          <img
                            src={release.coverPreviewUrl}
                            alt={release.albumTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ProceduralCover
                            title={release.albumTitle}
                            artistName={release.artistName}
                            size="md"
                            className="w-full h-full rounded-none"
                          />
                        )}
                      </div>

                      {/* Release metadata editor */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                            Album Title
                          </label>
                          <input
                            type="text"
                            value={release.albumTitle}
                            disabled={
                              isUploading || !!release.targetExistingAlbumId
                            }
                            onChange={(e) => {
                              const val = e.target.value
                              setImportReleases((prev) =>
                                prev.map((r, i) =>
                                  i === relIdx ? { ...r, albumTitle: val } : r,
                                ),
                              )
                            }}
                            className="w-full px-3 py-2 bg-background text-foreground text-caption focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors font-sans disabled:opacity-60 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                            Artist Name
                          </label>
                          <input
                            type="text"
                            value={release.artistName}
                            disabled={
                              isUploading || !!release.targetExistingAlbumId
                            }
                            onChange={(e) => {
                              const val = e.target.value
                              setImportReleases((prev) =>
                                prev.map((r, i) =>
                                  i === relIdx ? { ...r, artistName: val } : r,
                                ),
                              )
                            }}
                            className="w-full px-3 py-2 bg-background text-foreground text-caption focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors font-sans disabled:opacity-60 rounded-lg"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                              Release Type
                            </label>
                            <select
                              value={release.albumType}
                              disabled={
                                isUploading || !!release.targetExistingAlbumId
                              }
                              onChange={(e) => {
                                const val = e.target.value as any
                                setImportReleases((prev) =>
                                  prev.map((r, i) =>
                                    i === relIdx ? { ...r, albumType: val } : r,
                                  ),
                                )
                              }}
                              className="w-full px-3 py-2 bg-background text-foreground text-caption focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-colors font-sans disabled:opacity-60 rounded-lg cursor-pointer"
                            >
                              <option value="ALBUM">Album</option>
                              <option value="EP">EP</option>
                              <option value="MIXTAPE">Mixtape</option>
                              <option value="LP">LP</option>
                              <option value="SINGLE">Single</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setImportReleases((prev) =>
                                prev.filter((_, i) => i !== relIdx),
                              )
                            }}
                            disabled={isUploading}
                            className="mt-4 p-2 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Remove release container"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Tracks list */}
                    <div className="bg-background/40 divide-y divide-border/20 p-2 text-caption rounded-xl">
                      {release.tracks.map((track) => (
                        <div
                          key={track.id}
                          className="py-1.5 px-2 flex items-center justify-between hover:bg-card/70 transition-colors gap-2 rounded-lg"
                        >
                          <div className="flex items-center gap-2.5 truncate min-w-0">
                            <span className="font-mono text-eyebrow text-muted-foreground w-4 text-right shrink-0">
                              {track.trackNumber}
                            </span>
                            <span className="text-caption text-foreground truncate font-medium">
                              {track.title}
                            </span>
                            {track.artistName !== release.artistName && (
                              <span className="font-sans text-muted-foreground text-eyebrow truncate shrink-0">
                                ({track.artistName})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-eyebrow text-muted-foreground mr-1">
                              {Math.floor(track.durationSeconds / 60)}:
                              {(track.durationSeconds % 60)
                                .toString()
                                .padStart(2, '0')}
                            </span>

                            {/* Detach as Single */}
                            {(release.tracks.length > 1 ||
                              release.albumType !== 'SINGLE') && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isUploading}
                                onClick={() =>
                                  handleDetachTrackAsSingle(release.id, track.id)
                                }
                                className="h-6.5 text-eyebrow px-2 rounded-control"
                                title="Extract this song into its own Single release"
                              >
                                Detach
                              </Button>
                            )}

                            {/* Move / Attach to Release */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isUploading}
                              onClick={() =>
                                setMovingTrackInfo({
                                  sourceReleaseId: release.id,
                                  track,
                                })
                              }
                              className="h-6.5 text-eyebrow px-2 rounded-control text-foreground"
                              title="Move track to another staged release or attach to library album"
                            >
                              Move / Attach
                            </Button>

                            {/* Remove Track */}
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() =>
                                handleRemoveTrackFromStagedRelease(
                                  release.id,
                                  track.id,
                                )
                              }
                              className="text-muted-foreground hover:text-destructive font-mono text-caption cursor-pointer p-1 ml-0.5 rounded-control"
                              title="Remove this track from upload"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}

                      {release.tracks.length === 0 && (
                        <div className="py-4 text-center font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground/60">
                          Container is empty. Move tracks into this container or
                          remove it.
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Action Bar */}
                <div className="p-4 bg-card flex flex-col sm:flex-row items-center justify-between gap-4 shadow-raised rounded-xl">
                  <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                    <span>
                      Staged:{' '}
                      <strong className="text-foreground font-bold font-mono">
                        {totalSelectedTracks}
                      </strong>{' '}
                      track(s) across{' '}
                      <strong className="text-foreground font-bold font-mono">
                        {importReleases.length}
                      </strong>{' '}
                      release(s)
                    </span>
                    {isOverQuota && (
                      <span className="ml-2 text-destructive font-semibold">
                        (Exceeds remaining quota: {quota?.remainingSongs} slots
                        available)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (personalReleases.length > 0) {
                          handleTabChange('collection')
                        }
                      }}
                      disabled={isUploading}
                    >
                      Back to Collection
                    </Button>
                    <Button
                      type="button"
                      variant="pixel"
                      size="sm"
                      onClick={handleStartImport}
                      disabled={
                        importReleases.length === 0 || isUploading || isOverQuota
                      }
                    >
                      {isUploading
                        ? 'Importing...'
                        : isOverQuota
                          ? 'Quota Exceeded'
                          : `Import ${totalSelectedTracks} Track${
                              totalSelectedTracks === 1 ? '' : 's'
                            } to Collection`}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty Drop Zone */
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (e.dataTransfer.files) {
                    handleFilesSelected(e.dataTransfer.files)
                  }
                }}
                className="border-2 border-dashed border-border/80 hover:border-foreground/40 bg-card p-8 sm:p-14 text-center space-y-4 shadow-raised rounded-2xl transition-colors"
              >
                <div className="w-12 h-12 bg-background text-foreground flex items-center justify-center mx-auto rounded-xl shadow-raised">
                  <UploadCloudSVG className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <H2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                    Drop audio files or whole music folders here
                  </H2>
                  <p className="font-sans text-caption sm:text-body text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    Supports MP3, FLAC, WAV, AAC, M4A, and OGG. Audio tags and cover art are extracted automatically, grouping songs into albums and singles.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="pixel"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Audio Files
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    Choose Folder
                  </Button>
                </div>
              </div>
            )}

            {/* Hidden File Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp3,.flac,.wav,.m4a,.aac,.ogg,audio/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFilesSelected(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-ignore
              webkitdirectory="true"
              directory="true"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFilesSelected(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
      
  )
}
