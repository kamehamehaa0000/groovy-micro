export const AUTH_ROUTES = [
  '/login',
  '/register',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/oauth/callback',
]

const REDIRECT_STORAGE_KEY = 'groovy_auth_redirect'
const LAST_PATH_STORAGE_KEY = 'groovy_last_visited_path'

export function isAuthRoute(path: string): boolean {
  const cleanPath = path.split('?')[0].split('#')[0]
  return AUTH_ROUTES.some((route) => cleanPath === route || cleanPath.startsWith(`${route}/`))
}

export function getSafeRedirect(target?: string | null): string | null {
  if (!target || typeof target !== 'string') return null
  const trimmed = target.trim()
  // Must be a relative path and not a protocol-relative URL
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null
  }
  // Must not be an authentication page to prevent redirect loops
  if (isAuthRoute(trimmed)) {
    return null
  }
  return trimmed
}

export function saveAuthRedirect(target: string): void {
  const safe = getSafeRedirect(target)
  if (safe && typeof window !== 'undefined') {
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, safe)
  }
}

export function getSavedAuthRedirect(): string | null {
  if (typeof window === 'undefined') return null
  const saved = sessionStorage.getItem(REDIRECT_STORAGE_KEY)
  return getSafeRedirect(saved)
}

export function clearSavedAuthRedirect(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY)
  }
}

export function trackLastVisitedPath(pathWithSearch: string): void {
  if (typeof window === 'undefined') return
  if (!isAuthRoute(pathWithSearch)) {
    sessionStorage.setItem(LAST_PATH_STORAGE_KEY, pathWithSearch)
  }
}

export function getLastVisitedPath(): string | null {
  if (typeof window === 'undefined') return null
  const path = sessionStorage.getItem(LAST_PATH_STORAGE_KEY)
  return getSafeRedirect(path)
}

export function resolveRedirectTarget(explicitRedirect?: string | null): string {
  // 1. Explicit search param
  const fromParam = getSafeRedirect(explicitRedirect)
  if (fromParam) return fromParam

  // 2. Saved OAuth redirect
  const fromSaved = getSavedAuthRedirect()
  if (fromSaved) return fromSaved

  // 3. Last visited non-auth route in session
  const fromHistory = getLastVisitedPath()
  if (fromHistory) return fromHistory

  // 4. Default fallback to home
  return '/'
}
