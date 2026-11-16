import { ConfirmDialog } from '../ui/Modal'
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
    <ConfirmDialog
      open
      tone="danger"

      title={
        request.type === 'empty'
          ? 'Empty Studio Trash?'
          : request.type === 'permanent_release'
            ? 'Permanently Delete Release?'
            : 'Permanently Delete Master Cut?'
      }
      description={
        request.type === 'empty'
          ? 'Are you sure you want to permanently delete all items in the studio trash? All associated master audio recordings and artwork will be permanently purged from cloud storage. This action cannot be undone.'
          : request.type === 'permanent_release'
            ? `Are you sure you want to permanently delete "${request.title}" and all its audio files and artwork? This action cannot be undone.`
            : `Are you sure you want to permanently delete "${request.title}"? Master audio will be purged from storage. This action cannot be undone.`
      }
      confirmLabel={isPurging ? 'Deleting...' : 'Delete Forever'}
      cancelLabel="Cancel"
      isBusy={isPurging}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
