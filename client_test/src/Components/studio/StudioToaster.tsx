/**
 * Backwards-compatible alias for the app-wide toast surface.
 *
 * Toasts are mounted once in the root route; studio no longer mounts a
 * separate toaster.
 */
export { AppToaster as StudioToaster } from '../common/AppToaster'
