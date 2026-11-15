/**
 * The recycle bin: restore or permanently remove.
 *
 * The shared state lives in VaultManageContext.
 */
import { useVaultManage } from './VaultManageContext'
import { H2, H3 } from '../../ui/typography'
import { Button } from '../../ui'
import { RotateCcwClockIcon, TrashIcon } from 'lucide-react'

export function TrashDesk() {
  const {
    trashedSongs,
    trashedReleases,
    isLoadingTrash,
    isRestoring,
    isPurging,
    setTrashConfirm,
    handleRestoreSong,
    handleRestoreRelease,
  } = useVaultManage()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-card/60">
        <div>
          <H3 className="text-title font-semibold tracking-tight text-foreground sm:text-lg">
            Recycle Bin
          </H3>
          <p className="font-sans text-caption text-muted-foreground mt-1">
            Soft-deleted songs and releases do not consume personal quota. You
            can restore them or permanently purge them.
          </p>
        </div>
        {(trashedSongs.length > 0 || trashedReleases.length > 0) && (
          <Button
            variant="pixel"
            size="sm"
            type="button"
            disabled={isPurging}
            onClick={() => setTrashConfirm({ type: 'empty' })}
            className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-destructive/40 bg-destructive-soft hover:bg-destructive/20 text-destructive transition-colors font-semibold cursor-pointer shrink-0"
          >
            {isPurging ? 'Emptying...' : 'Empty Recycle Bin'}
          </Button>
        )}
      </div>

      {isLoadingTrash ? (
        <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
          Loading recycle bin...
        </div>
      ) : trashedSongs.length === 0 && trashedReleases.length === 0 ? (
        <div className="p-16 border border-dashed border-border bg-muted/20 text-center space-y-2 rounded-2xl">
          <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Recycle Bin is Empty
          </H2>
          <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto">
            No soft-deleted songs or releases found. When you delete items from
            your collection, they will appear here before being permanently
            purged.
          </p>
        </div>
      ) : (
        <div className="space-y-8 ">
          {/* Trashed Releases */}
          {trashedReleases.length > 0 && (
            <div className="space-y-3 ">
              <div className="flex items-center gap-2 font-eyebrow text-caption uppercase tracking-wider text-foreground font-semibold ">
                <span>Trashed Releases ({trashedReleases.length})</span>
              </div>

              <div className="bg-card rounded-2xl px-2 py-2.5">
                {trashedReleases.map((rel) => (
                  <div
                    key={rel.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-background transition-colors rounded-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0 ">
                      <div className="w-12 h-12  bg-background shrink-0 overflow-hidden">
                        {rel.coverImageUrl ? (
                          <img
                            src={rel.coverImageUrl}
                            alt={rel.title}
                            className="w-full h-full object-cover grayscale opacity-70"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-serif text-lg text-muted-foreground">
                            {rel.title.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-title text-foreground truncate font-medium">
                            {rel.title}
                          </span>
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 border border-border bg-background text-muted-foreground font-semibold">
                            {rel.albumType}
                          </span>
                        </div>
                        <div className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                          {rel.artistName} &bull; {rel.totalTracks}{' '}
                          {rel.totalTracks === 1 ? 'track' : 'tracks'}
                        </div>
                        <div className="font-mono text-eyebrow text-muted-foreground/70 mt-1">
                          Deleted on{' '}
                          {new Date(rel.deletedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="pixel"
                        size="sm"
                        type="button"
                        disabled={isRestoring}
                        onClick={() => handleRestoreRelease(rel.id)}
                      >
                        <RotateCcwClockIcon className="w-4 h-4" />{' '}
                      </Button>
                      <Button
                        variant="pixel"
                        size="sm"
                        type="button"
                        disabled={isPurging}
                        onClick={() =>
                          setTrashConfirm({
                            type: 'permanent_release',
                            id: rel.id,
                            title: rel.title,
                          })
                        }
                      >
                        <TrashIcon className="w-4 h-4" />{' '}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trashed Individual Songs */}
          {trashedSongs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-eyebrow text-caption uppercase tracking-wider text-foreground font-semibold">
                <span>Trashed Standalone Songs ({trashedSongs.length})</span>
              </div>

              <div className="bg-card rounded-2xl px-2 py-2.5">
                {trashedSongs.map((song) => (
                  <div
                    key={song.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-background transition-colors rounded-xl"
                  >
                    <div className="min-w-0">
                      <div className="text-body text-foreground truncate font-medium">
                        {song.title}
                      </div>
                      <div className="font-sans text-caption text-muted-foreground truncate mt-0.5">
                        {song.artistName}{' '}
                        {song.albumTitle ? `— ${song.albumTitle}` : ''} &bull;{' '}
                        {Math.floor(song.durationSeconds / 60)}:
                        {(song.durationSeconds % 60)
                          .toString()
                          .padStart(2, '0')}
                      </div>
                      <div className="font-mono text-eyebrow text-muted-foreground/70 mt-1">
                        Deleted on{' '}
                        {new Date(song.deletedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="pixel"
                        size="sm"
                        type="button"
                        disabled={isRestoring}
                        onClick={() => handleRestoreSong(song.id)}
                      >
                        <RotateCcwClockIcon className="w-4 h-4" />{' '}
                      </Button>
                      <Button
                        variant="pixel"
                        size="sm"
                        type="button"
                        disabled={isPurging}
                        onClick={() =>
                          setTrashConfirm({
                            type: 'permanent_song',
                            id: song.id,
                            title: song.title,
                          })
                        }
                      >
                        <TrashIcon className="w-4 h-4" />{' '}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
