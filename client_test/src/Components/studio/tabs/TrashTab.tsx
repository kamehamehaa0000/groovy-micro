import { RotateCcw } from 'lucide-react'
import type { TrashState } from '../hooks/useTrash'

interface TrashTabProps {
  trash: TrashState
}

export function TrashTab({ trash }: TrashTabProps) {
  const {
    trashAlbums,
    trashSongs,
    isPurging,
    setTrashConfirm,
    isLoadingTrash,
    handleRestoreAlbum,
    handleRestoreSong,
  } = trash

  return (
    <div className="space-y-6">
      <div className="p-4 border border-warning/40 bg-warning-soft text-warning font-sans text-caption flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-eyebrow text-eyebrow uppercase tracking-widest font-semibold block mb-0.5">
            30-Day Recovery Guarantee
          </span>
          <p className="leading-relaxed">
            Archived releases and master recordings are retained in this
            safe vault for 30 days before irreversible purging. You can
            restore them to your active catalog at any time, or permanently
            purge them.
          </p>
        </div>
        {(trashAlbums.length > 0 || trashSongs.length > 0) && (
          <button
            type="button"
            disabled={isPurging}
            onClick={() => setTrashConfirm({ type: 'empty' })}
            className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-destructive/40 bg-destructive-soft hover:bg-destructive/20 text-destructive transition-colors font-semibold cursor-pointer shrink-0"
          >
            {isPurging ? 'Emptying...' : 'Empty Trash'}
          </button>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
          Archived Releases ({trashAlbums.length})
        </h3>

        {isLoadingTrash ? (
          <div className="p-6 text-center font-mono text-caption text-muted-foreground animate-pulse">
            Loading trash archive...
          </div>
        ) : trashAlbums.length === 0 ? (
          <div className="p-6 border border-border bg-card text-center font-mono text-caption text-muted-foreground rounded-control">
            Trash is empty. No deleted albums found.
          </div>
        ) : (
          <div className="space-y-3">
            {trashAlbums.map((album) => (
              <div
                key={album.id}
                className="p-4 border border-border rounded-control bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="font-sans font-semibold text-body sm:text-title text-foreground truncate min-w-0">
                      {album.title}
                    </h4>
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 bg-background border border-border text-muted-foreground rounded-control shrink-0">
                      {album.albumType}
                    </span>
                  </div>
                  <span className="font-mono text-eyebrow text-muted-foreground mt-0.5 block">
                    Deleted:{' '}
                    {album.deletedAt
                      ? new Date(album.deletedAt).toLocaleDateString()
                      : 'Recently'}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestoreAlbum(album.id)}
                    className="font-eyebrow rounded-control text-eyebrow uppercase tracking-wider py-2 px-3.5 bg-foreground text-background hover:opacity-90 cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    <span>Restore Release</span>
                  </button>
                  <button
                    type="button"
                    disabled={isPurging}
                    onClick={() =>
                      setTrashConfirm({
                        type: 'permanent_release',
                        id: album.id,
                        title: album.title,
                      })
                    }
                    className="font-eyebrow rounded-control text-eyebrow uppercase tracking-wider py-2 px-3 border border-destructive/40 hover:bg-destructive/20 text-destructive font-semibold cursor-pointer transition-colors"
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archived Songs */}
      {trashSongs.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border-soft">
          <h3 className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
            Archived Master Cuts ({trashSongs.length})
          </h3>

          <div className="space-y-2">
            {trashSongs.map((song) => (
              <div
                key={song.id}
                className="p-3 border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <span className="font-sans font-semibold text-body text-foreground truncate block">
                    {song.title}
                  </span>
                  <span className="font-mono text-eyebrow text-muted-foreground">
                    Deleted:{' '}
                    {song.deletedAt
                      ? new Date(song.deletedAt).toLocaleDateString()
                      : 'Recently'}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestoreSong(song.id)}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    disabled={isPurging}
                    onClick={() =>
                      setTrashConfirm({
                        type: 'permanent_song',
                        id: song.id,
                        title: song.title,
                      })
                    }
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-destructive/40 hover:bg-destructive/20 text-destructive font-semibold cursor-pointer transition-colors"
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
