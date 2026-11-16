import { ConfirmDialog } from '../ui/Modal'
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
    <ConfirmDialog
      open
      tone="danger"
      title={
        request.type === 'album'
          ? 'Move Release to Trash?'
          : 'Move Master Track to Trash?'
      }
      description={
        request.type === 'album' ? (
          <>
            Are you sure you want to move{' '}
            <strong className="text-foreground font-semibold">
              "{request.title}"
            </strong>{' '}
            and its {request.trackCount || 'associated'} cut(s) to the 30-day
            trash? You can restore it anytime within 30 days.
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
                Since this is the only cut in this release, the parent release
                will also be moved to the 30-day trash.
              </span>
            ) : (
              <span className="block text-muted-foreground mt-1">
                You can restore it anytime within 30 days.
              </span>
            )}
          </>
        )
      }
      confirmLabel={isDeleting ? 'Moving...' : 'Move to Trash'}
      cancelLabel="Cancel"
      isBusy={isDeleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
