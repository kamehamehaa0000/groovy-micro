import type { ReactNode } from 'react'
import { cn } from './cn'
import { Button } from './Button'

export interface SaveBarProps {
  /** There are unsaved changes. */
  isDirty: boolean
  /** A save is in flight. */
  isBusy?: boolean
  /** The label of the save button. */
  saveLabel: string
  /** The label of the save button while it is working. */
  busyLabel?: string
  /** Puts the fields back the way they were. */
  onRevert: () => void
  /**
   * Called when the save button is pressed. The button is a submit button by
   * default, so a form can leave this out and handle the submit itself.
   */
  onSave?: () => void
  /** Extra controls, rendered before the save button. */
  actions?: ReactNode
  /** The save button. Defaults to a filled button. */
  saveButton?: ReactNode
  className?: string
}

/**
 * The footer of a form that can be dirty.
 *
 * A form that is always savable is a form that lies: you cannot tell whether
 * anything changed. This bar says so, and offers the way back.
 */
export function SaveBar({
  isDirty,
  isBusy = false,
  saveLabel,
  busyLabel,
  onRevert,
  onSave,
  actions,
  saveButton,
  className,
}: SaveBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-3 pt-2',
        className,
      )}
    >
      {isDirty ? (
        <>
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-warning">
            Unsaved changes
          </span>
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="rounded-full"
            onClick={onRevert}
            disabled={isBusy}
          >
            Revert
          </Button>
        </>
      ) : null}
      {actions}
      {saveButton ?? (
        <button
          type="submit"
          onClick={onSave}
          disabled={isBusy || !isDirty}
          className="w-full cursor-pointer rounded-full bg-foreground px-6 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-background shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {isBusy ? (busyLabel ?? 'Saving...') : saveLabel}
        </button>
      )}
    </div>
  )
}
