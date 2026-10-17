import { Trash2 } from 'lucide-react'
import type { ReleaseDeleteRequest } from './studio.types'

interface ConfirmSoftDeleteModalProps {
  /** The queued soft-delete (move to 30-day trash) request. */
  request: ReleaseDeleteRequest
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmSoftDeleteModal({
  request,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmSoftDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-[3px] animate-in fade-in duration-150">
      <div className="w-full max-w-md border border-border bg-background p-6 shadow-2xl space-y-4 rounded-control">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 border border-border bg-card flex items-center justify-center text-destructive shrink-0 rounded-control">
            <Trash2 className="w-4 h-4 shrink-0" />
          </div>
          <div>
            <h4 className="font-serif italic text-lg text-foreground font-normal">
              {request.type === 'album'
                ? 'Move Release to Trash?'
                : 'Move Master Track to Trash?'}
            </h4>
            <p className="font-sans text-caption text-muted-foreground mt-1 leading-relaxed">
              {request.type === 'album' ? (
                <>
                  Are you sure you want to move{' '}
                  <strong className="text-foreground font-semibold">
                    "{request.title}"
                  </strong>{' '}
                  and its {request.trackCount || 'associated'} cut(s)
                  to the 30-day trash? You can restore it anytime within 30
                  days.
                </>
              ) : (
                <>
                  Are you sure you want to move{' '}
                  <strong className="text-foreground font-semibold">
                    "{request.title}"
                  </strong>{' '}
                  to the 30-day trash?
                  {request.trackCount === 1 ? (
                    <span className="block text-foreground font-medium mt-1">
                      Since this is the only cut in this release, the parent
                      release will also be moved to the 30-day trash.
                    </span>
                  ) : (
                    <span className="block text-muted-foreground mt-1">
                      You can restore it anytime within 30 days.
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            className="font-eyebrow text-caption uppercase tracking-wider px-3.5 py-2 border border-border text-muted-foreground hover:text-foreground bg-card transition-colors cursor-pointer rounded-control"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="font-eyebrow text-caption uppercase tracking-wider px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors cursor-pointer font-semibold shadow-xs rounded-control"
          >
            {isDeleting ? 'Moving...' : 'Move to Trash'}
          </button>
        </div>
      </div>
    </div>
  )
}
