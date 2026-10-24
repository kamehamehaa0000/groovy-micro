import { toast } from 'sonner'
import type { ExternalToast } from 'sonner'

/**
 * Global toast defaults.
 *
 * Every call site goes through `notify` so timing, placement, and tone can be
 * changed in one place. `AppToaster` reads the same object, so the surface and
 * the individual toasts can never drift apart.
 */
export const TOAST = {
  position: 'top-center' as const,
  /** Success / info — short and out of the way. */
  duration: 2000,
  /** Errors need a beat longer to read. */
  errorDuration: 3500,
  visibleToasts: 3,
  /** Clears the 56px sticky header plus a little breathing room. */
  offset: 68,
  mobileOffset: 68,
} as const

type NotifyOptions = ExternalToast

export const notify = {
  success: (message: string, options?: NotifyOptions) =>
    toast.success(message, { duration: TOAST.duration, ...options }),
  error: (message: string, options?: NotifyOptions) =>
    toast.error(message, { duration: TOAST.errorDuration, ...options }),
  info: (message: string, options?: NotifyOptions) =>
    toast.info(message, { duration: TOAST.duration, ...options }),
  message: (message: string, options?: NotifyOptions) =>
    toast(message, { duration: TOAST.duration, ...options }),
  /** Clear all visible toasts (used before long studio operations). */
  dismiss: toast.dismiss,
}
