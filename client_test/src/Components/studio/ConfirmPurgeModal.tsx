import { Trash2 } from 'lucide-react'
import type { TrashPurgeRequest } from './studio.types'

interface ConfirmPurgeModalProps {
  /** The queued permanent-purge request (empty trash, release, or single cut). */
  request: TrashPurgeRequest
  isPurging: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmPurgeModal({
  request,
  isPurging,
  onCancel,
  onConfirm,
}: ConfirmPurgeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-[3px] animate-in fade-in duration-150">
      <div className="w-full max-w-md border border-border bg-background p-6 shadow-2xl space-y-4 rounded-control">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 border border-border bg-card flex items-center justify-center text-destructive shrink-0">
            <Trash2 className="w-4 h-4 shrink-0" />
          </div>
          <div>
            <h4 className="font-serif italic text-lg text-foreground font-normal">
              {request.type === 'empty'
                ? 'Empty Studio Trash?'
                : request.type === 'permanent_release'
                  ? 'Permanently Delete Release?'
                  : 'Permanently Delete Master Cut?'}
            </h4>
            <p className="font-sans text-caption text-muted-foreground mt-1 leading-relaxed">
              {request.type === 'empty'
                ? 'Are you sure you want to permanently delete all items in the studio trash? All associated master audio recordings and artwork will be permanently purged from cloud storage. This action cannot be undone.'
                : request.type === 'permanent_release'
                  ? `Are you sure you want to permanently delete "${request.title}" and all its audio files and artwork? This action cannot be undone.`
                  : `Are you sure you want to permanently delete "${request.title}"? Master audio will be purged from storage. This action cannot be undone.`}
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isPurging}
            onClick={() => onCancel}
            className="font-eyebrow text-caption uppercase tracking-wider px-3.5 py-2 border border-border text-muted-foreground hover:text-foreground bg-card transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPurging}
            onClick={onConfirm}
            className="font-eyebrow text-caption uppercase tracking-wider px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors cursor-pointer font-semibold shadow-xs"
          >
            {isPurging ? 'Deleting...' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  )
}
