import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useThemeStore } from '../stores/theme.store'
import { useGoogleFedCM } from '../hooks/useGoogleFedCM'

export interface RouterContext {
  auth: ReturnType<typeof useAuthStore.getState>
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Native Browser FedCM for Google Single-Tap (Zero script tags, pure Web API)
  useGoogleFedCM()

  useEffect(() => {
    // Skip silent refresh if on OAuth callback or email verification route
    if (
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/oauth/callback') ||
        window.location.pathname.startsWith('/verify-email'))
    ) {
      return
    }
    checkAuth()
  }, [checkAuth])

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans flex flex-col transition-colors duration-200">
      {/* ===================== TOP NAVIGATION HEADER ===================== */}
      <header className="sticky top-0 z-40 w-full h-14 border-b border-line bg-canvas/90 backdrop-blur-md px-5 sm:px-8 flex items-center justify-between shrink-0 transition-colors duration-200">
        {/* Left: Brand Monogram Crest & Title */}
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-inherit no-underline group"
          >
            <div className="w-7 h-7 rounded-full border border-line bg-panel flex items-center justify-center font-serif italic text-sm text-ink group-hover:border-ink transition-colors shadow-2xs">
              G<span className="not-italic text-blue font-sans text-xs -mt-0.5">·</span>
            </div>
            <span className="font-serif italic text-lg tracking-tight text-ink">
              groov<span className="not-italic text-blue font-sans">y</span>
            </span>
            <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-ink-soft border-l border-line pl-2 ml-0.5 hidden sm:inline-block">
              Sound Atelier
            </span>
          </Link>

          {/* Top Route Navigation Links */}
          <nav className="hidden md:flex items-center gap-5 pl-4 border-l border-line font-mono text-[10px] uppercase tracking-[0.14em]">
            <Link
              to="/"
              activeProps={{
                className: 'text-ink font-semibold border-b border-blue pb-0.5',
              }}
              inactiveProps={{
                className: 'text-ink-soft hover:text-ink pb-0.5',
              }}
              className="transition-colors"
            >
              Catalog
            </Link>
            {isAuthenticated && (
              <Link
                to="/profile"
                activeProps={{
                  className: 'text-ink font-semibold border-b border-blue pb-0.5',
                }}
                inactiveProps={{
                  className: 'text-ink-soft hover:text-ink pb-0.5',
                }}
                className="transition-colors"
              >
                Curator Vault
              </Link>
            )}
          </nav>
        </div>

        {/* Right: Theme Toggle & User Auth Controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Theme Switcher Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme mode"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="w-8 h-8 rounded-full border border-line bg-panel hover:bg-canvas hover:border-ink flex items-center justify-center text-ink-soft hover:text-ink transition-colors cursor-pointer shadow-2xs"
          >
            {theme === 'dark' ? (
              <svg className="w-3.5 h-3.5 text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* User Auth Section */}
          {isLoading ? (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft animate-pulse px-2 hidden sm:inline-block">
              Authenticating...
            </span>
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="flex items-center gap-2.5 text-inherit no-underline group"
                title="Open Curator Profile & Vault"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden border border-line group-hover:border-ink transition-colors shadow-2xs">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-panel text-ink flex items-center justify-center font-serif italic text-xs">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="font-serif italic text-xs text-ink leading-tight">
                    {user.displayName}
                  </span>
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-soft">
                    {user.role} {user.isEmailVerified ? '· Verified' : ''}
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="hidden sm:inline-block font-mono text-[9.5px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-panel hover:bg-canvas text-ink transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                to="/login"
                className="font-mono text-[10.5px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-panel hover:bg-canvas-deep text-ink transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="font-mono text-[10.5px] uppercase tracking-[0.12em] py-1.5 px-3 bg-ink text-canvas border border-ink hover:bg-canvas hover:text-ink font-medium transition-colors"
              >
                Join
              </Link>
            </div>
          )}

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-1.5 text-ink hover:text-ink-soft cursor-pointer"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ===================== MOBILE SLIDEOUT DRAWER (< md) ===================== */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="md:hidden fixed inset-0 bg-ink/30 backdrop-blur-xs z-40 transition-opacity"
        />
      )}

      <div
        className={`md:hidden fixed top-14 left-0 bottom-0 z-50 w-64 bg-canvas-deep border-r border-line p-6 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-deep mb-3">
              Navigation
            </div>
            <nav className="flex flex-col gap-1.5">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between p-2 font-mono text-xs uppercase tracking-[0.14em] text-ink hover:bg-panel border border-transparent hover:border-line"
              >
                <span>Catalog Overview</span>
                <span className="text-blue">&rarr;</span>
              </Link>
              {isAuthenticated && (
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between p-2 font-mono text-xs uppercase tracking-[0.14em] text-ink hover:bg-panel border border-transparent hover:border-line"
                >
                  <span>Curator Vault</span>
                  <span className="text-blue">&rarr;</span>
                </Link>
              )}
            </nav>
          </div>
        </div>

        <div className="border-t border-line pt-4 space-y-3">
          {isAuthenticated && user ? (
            <div className="space-y-2">
              <div className="text-xs font-serif italic text-ink">{user.displayName}</div>
              <div className="font-mono text-[9px] uppercase text-ink-soft">{user.email}</div>
              <button
                type="button"
                onClick={() => {
                  logout()
                  setMobileMenuOpen(false)
                }}
                className="w-full text-center font-mono text-[10px] uppercase py-1.5 border border-line bg-canvas text-ink cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-center font-mono text-[10px] uppercase py-2 border border-line bg-panel text-ink"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-center font-mono text-[10px] uppercase py-2 bg-ink text-canvas border border-ink"
              >
                Join
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ===================== MAIN CONTENT AREA ===================== */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-12 py-10">
          <Outlet />
        </main>

        {/* Editorial Maison Footnote */}
        <footer className="border-t border-line py-8 px-6 text-center">
          <div className="font-serif italic text-base text-ink mb-1">
            Groov<span className="not-italic text-blue font-serif">y</span> · Sound Atelier
          </div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-soft">
            Maison Édition — High-Fidelity Streaming &bull; Fastify &bull; PostgreSQL &bull; Redis &bull; Cloudflare R2
          </p>
        </footer>
      </div>
    </div>
  )
}
