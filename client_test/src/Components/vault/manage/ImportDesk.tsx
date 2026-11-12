/**
 * The import desk: parse files, stage releases, upload.
 *
 * The shared state lives in VaultManageContext.
 */
import { ProceduralCover } from '../../common/ProceduralCover'
import {
  UploadCloudSVG,
} from '../../Icons'


import { useVaultManage } from './VaultManageContext'

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
              <div className="p-4 bg-card border border-border text-caption text-foreground flex items-center gap-3 font-mono shadow-xs rounded-xl">
                <div className="w-4 h-4 border-2 border-border-soft border-t-foreground rounded-full animate-spin shrink-0" />
                <span>
                  Extracting ID3 tags, duration &amp; artwork in browser (
                  {parsingProgress.current} / {parsingProgress.total} files)...
                </span>
              </div>
            )}

            {/* Upload Progress Indicator */}
            {isUploading && (
              <div className="p-5 border border-border bg-card space-y-3 shadow-xs rounded-xl">
                <div className="flex justify-between font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                  <span>{uploadStatusText}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-background border border-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all duration-200 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Duplicate Detection Alert Banner */}
            {duplicateNotice && duplicateNotice.count > 0 && (
              <div className="p-4 bg-primary/10 border border-primary/20 text-primary font-mono text-caption flex flex-col gap-2 shadow-xs rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-body">⚡</span>
                    <span>
                      <strong>{duplicateNotice.count}</strong> duplicate track(s)
                      were automatically detected and excluded from the upload
                      queue.
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
                      className="cursor-pointer font-bold text-body leading-none"
                      title="Dismiss notification"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {showDuplicateDetails && (
                  <div className="mt-2 border-t border-primary/20 pt-2 space-y-1.5 max-h-44 overflow-y-auto">
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
                    <h3 className="font-serif italic text-heading sm:text-2xl text-foreground font-semibold">
                      Import Staging Desk
                    </h3>
                    <p className="font-sans text-caption sm:text-body text-muted-foreground mt-0.5">
                      Review and refine release tags before uploading to your
                      private storage vault.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCreatingContainer((v) => !v)}
                      disabled={isUploading}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline cursor-pointer font-semibold"
                    >
                      + New Release / Mixtape
                    </button>
                    <span className="text-border">&bull;</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      + Add More Files
                    </button>
                    <span className="text-border">&bull;</span>
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
                    className="p-5 border border-primary/30 bg-primary/5 space-y-3 shadow-xs rounded-xl"
                  >
                    <div className="flex items-center justify-between font-eyebrow text-eyebrow uppercase tracking-wider text-primary font-bold">
                      <span>Create Empty Staged Release / Mixtape Container</span>
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
                          className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground font-sans rounded-md"
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
                          className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground font-sans rounded-md"
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
                          className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground font-sans rounded-md cursor-pointer"
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
                      <button
                        type="button"
                        onClick={() => setIsCreatingContainer(false)}
                        className="px-3 py-1.5 border border-border font-eyebrow text-eyebrow uppercase text-muted-foreground hover:text-foreground cursor-pointer bg-background rounded-md transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 bg-foreground text-background font-eyebrow text-eyebrow uppercase font-semibold hover:opacity-90 cursor-pointer rounded-md shadow-xs transition-opacity"
                      >
                        Create Container
                      </button>
                    </div>
                  </form>
                )}

                {importReleases.map((release, relIdx) => (
                  <div
                    key={release.id}
                    className="border border-border bg-card p-5 space-y-4 shadow-xs rounded-xl"
                  >
                    {release.targetExistingAlbumId && (
                      <div className="flex items-center gap-2 px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary font-eyebrow text-eyebrow uppercase tracking-wider font-semibold rounded-md">
                        <span>
                          ↳ Appending new track(s) to existing library album
                        </span>
                      </div>
                    )}

                    <div className="flex items-start gap-4">
                      {/* Cover Art Preview */}
                      <div className="w-20 h-20 bg-background border border-border shrink-0 overflow-hidden relative shadow-raised rounded-lg">
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
                            className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground transition-colors font-sans disabled:opacity-70 rounded-md"
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
                            className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground transition-colors font-sans disabled:opacity-70 rounded-md"
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
                              className="w-full px-3 py-2 border border-border bg-background text-foreground text-caption focus:outline-none focus:border-foreground transition-colors font-sans disabled:opacity-70 rounded-md cursor-pointer"
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
                    <div className="border border-border/60 bg-muted/20 divide-y divide-border/40 p-2 text-caption rounded-lg">
                      {release.tracks.map((track) => (
                        <div
                          key={track.id}
                          className="py-1.5 px-2 flex items-center justify-between hover:bg-background transition-colors gap-2 rounded-control"
                        >
                          <div className="flex items-center gap-2.5 truncate min-w-0">
                            <span className="font-mono text-eyebrow text-muted-foreground w-4 text-right shrink-0">
                              {track.trackNumber}
                            </span>
                            <span className="font-serif italic text-caption text-foreground truncate">
                              {track.title}
                            </span>
                            {track.artistName !== release.artistName && (
                              <span className="font-sans text-muted-foreground text-eyebrow truncate shrink-0">
                                ({track.artistName})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono text-eyebrow text-muted-foreground mr-1">
                              {Math.floor(track.durationSeconds / 60)}:
                              {(track.durationSeconds % 60)
                                .toString()
                                .padStart(2, '0')}
                            </span>

                            {/* Detach as Single */}
                            {(release.tracks.length > 1 ||
                              release.albumType !== 'SINGLE') && (
                              <button
                                type="button"
                                disabled={isUploading}
                                onClick={() =>
                                  handleDetachTrackAsSingle(release.id, track.id)
                                }
                                className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 border border-border text-muted-foreground hover:text-foreground hover:border-foreground bg-card transition-colors cursor-pointer rounded-control"
                                title="Extract this song into its own Single release"
                              >
                                Detach
                              </button>
                            )}

                            {/* Move / Attach to Release */}
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() =>
                                setMovingTrackInfo({
                                  sourceReleaseId: release.id,
                                  track,
                                })
                              }
                              className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 border border-border text-primary hover:border-primary bg-card transition-colors cursor-pointer rounded-control"
                              title="Move track to another staged release or attach to library album"
                            >
                              Move / Attach
                            </button>

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
                              className="text-muted-foreground hover:text-destructive font-mono text-caption cursor-pointer p-0.5 ml-1"
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
                <div className="p-4 border border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs rounded-xl">
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
                    <button
                      type="button"
                      onClick={() => {
                        if (personalReleases.length > 0) {
                          handleTabChange('collection')
                        }
                      }}
                      disabled={isUploading}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground hover:border-foreground bg-background transition-colors cursor-pointer rounded-md"
                    >
                      Back to Collection
                    </button>
                    <button
                      type="button"
                      onClick={handleStartImport}
                      disabled={
                        importReleases.length === 0 || isUploading || isOverQuota
                      }
                      className={`font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 font-semibold transition-all cursor-pointer rounded-md ${
                        importReleases.length === 0 || isUploading || isOverQuota
                          ? 'bg-muted text-muted-foreground/50 border border-border cursor-not-allowed'
                          : 'bg-foreground text-background hover:opacity-90 shadow-xs'
                      }`}
                    >
                      {isUploading
                        ? 'Importing...'
                        : isOverQuota
                          ? 'Quota Exceeded'
                          : `Import ${totalSelectedTracks} Track${
                              totalSelectedTracks === 1 ? '' : 's'
                            } to Collection`}
                    </button>
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
                className="border-2 border-dashed border-border bg-card hover:border-foreground/50 p-10 sm:p-14 text-center space-y-4 shadow-xs rounded-2xl transition-colors"
              >
                <div className="w-14 h-14 bg-background border border-border text-primary flex items-center justify-center mx-auto text-2xl rounded-xl shadow-raised">
                  <UploadCloudSVG className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif italic text-2xl text-foreground font-normal">
                    Drop audio files or whole music folders here
                  </h3>
                  <p className="font-sans text-caption sm:text-body text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    Supports MP3, FLAC, WAV, AAC, M4A, OGG. Tags and embedded
                    cover art are extracted in-browser using zero-copy streaming
                    tokens, automatically grouping albums and singles.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 bg-foreground text-background hover:opacity-90 transition-opacity font-semibold cursor-pointer shadow-xs rounded-md"
                  >
                    Choose Audio Files
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 border border-border text-foreground hover:border-foreground bg-background transition-colors cursor-pointer rounded-md shadow-raised"
                  >
                    Choose Folder
                  </button>
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
