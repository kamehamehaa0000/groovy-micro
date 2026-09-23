import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useThemeStore } from '../stores/theme.store'
import { useLikesStore } from '../stores/likes.store'
import { useFollowsStore } from '../stores/follows.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { useEntitlementsStore } from '../stores/entitlements.store'
import { usePlaylistsStore } from '../stores/playlists.store'
import { usePlayerStore } from '../stores/player.store'
import { useGoogleFedCM } from '../hooks/useGoogleFedCM'
import { DarkModeSVG, LightModeSVG } from '../components/icons'
import { GlobalAudioEngine } from '../components/player/GlobalAudioEngine'
import { PlayerBar } from '../components/player/PlayerBar'
import { QueueDrawer } from '../components/player/QueueDrawer'
import { AuthPromptModal } from '../components/auth/AuthPromptModal'
import { GlobalSearchModal } from '../components/search/GlobalSearchModal'
import { LiveJamModal } from '../components/jam/LiveJamModal'
import { useJamStore } from '../stores/jam.store'
import { MobileBottomBar } from '../components/navigation/MobileBottomBar'
import { MobileActionDrawer } from '../components/navigation/MobileActionDrawer'
import { CreatePlaylistModal } from '../components/playlists/CreatePlaylistModal'

export interface RouterContext {
  auth: ReturnType<typeof useAuthStore.getState>
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [rightActionDrawerOpen, setRightActionDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  // Global keyboard shortcut: Ctrl+K / Cmd+K opens search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Native Browser FedCM for Google Single-Tap (Zero script tags, pure Web API)
  useGoogleFedCM()

  useEffect(() => {
    // Skip silent refresh if on OAuth callback, email verification, or password reset route
    if (
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/oauth/callback') ||
        window.location.pathname.startsWith('/verify-email') ||
        window.location.pathname.startsWith('/reset-password'))
    ) {
      return
    }
    checkAuth()
  }, [checkAuth])

  // Synchronize user likes, follows, pre-saves, entitlements & playlist saves into high-speed client Sets on authentication
  useEffect(() => {
    if (isAuthenticated) {
      useLikesStore.getState().initializeLikes()
      useFollowsStore.getState().initializeFollows()
      usePreSavesStore.getState().initializePreSaves()
      useEntitlementsStore.getState().initializeEntitlements()
      usePlaylistsStore.getState().initializePlaylists()
      usePlayerStore.getState().initializeSync(true)
      useJamStore.getState().reconnectActiveRoom()
    } else {
      useLikesStore.getState().clearLikes()
      useFollowsStore.getState().clearFollows()
      usePreSavesStore.getState().clearPreSaves()
      useEntitlementsStore.getState().clearEntitlements()
      usePlaylistsStore.getState().clearPlaylists()
    }
  }, [isAuthenticated])

  const { pathname } = useLocation()
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/signup' ||
    pathname === '/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans flex flex-col transition-colors duration-200">
      {/* ===================== TOP HEADER ===================== */}
      {isAuthPage ? (
        /* Dedicated Auth Header with Back to Home & Theme Toggle */
        <header className="w-full h-14 border-b border-line bg-canvas/90 backdrop-blur-md px-5 sm:px-8 flex items-center justify-between shrink-0">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-ink-soft hover:text-ink transition-colors group"
          >
            <span className="transition-transform duration-200 group-hover:-translate-x-1">
              &larr;
            </span>
            <span>Back to home</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="font-serif italic text-lg tracking-tight text-ink hover:opacity-80 transition-opacity"
            >
              Groovy
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink-soft hover:text-ink hover:border-ink transition-colors cursor-pointer"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <LightModeSVG /> : <DarkModeSVG />}
            </button>
          </div>
        </header>
      ) : (
        /* ===================== TOP NAVIGATION HEADER ===================== */
        <header className="sticky top-0 z-40 w-full h-14 border-b border-line bg-canvas/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between shrink-0 transition-colors duration-200">
          {/* ---------------- MOBILE TOP BAR (< md) ---------------- */}
          <div className="md:hidden flex items-center justify-between w-full">
            {/* Left: Profile Icon (Left Sidebar Toggle) */}
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(true)}
              aria-label="Open profile and navigation menu"
              className="w-8 h-8 rounded-full border border-line bg-panel hover:border-ink flex items-center justify-center overflow-hidden cursor-pointer shadow-2xs transition-colors shrink-0"
            >
              {isAuthenticated && user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-full h-full object-cover"
                />
              ) : isAuthenticated && user ? (
                <span className="font-serif italic text-xs font-bold text-ink">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <svg
                  className="w-4 h-4 text-ink-soft"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </button>

            {/* Center: Brand Monogram / Title */}
            <div className="flex items-start w-full gap-2">
              <Link
                to="/"
                className="font-serif text-sm tracking-tight mx-1  ml-2 text-ink hover:opacity-80 transition-opacity"
              >
                Home
              </Link>
              <Link
                to="/feed"
                className="font-serif text-sm tracking-tight mx-1 text-ink hover:opacity-80 transition-opacity"
              >
                Feed
              </Link>
            </div>
            {/* Right: Plus (+) Icon (Quick Action Drawer) */}
            <button
              type="button"
              onClick={() => setRightActionDrawerOpen(true)}
              aria-label="Create and quick actions"
              className="w-8 h-8 rounded-full border border-line bg-panel hover:border-ink hover:text-ink text-ink-soft flex items-center justify-center cursor-pointer shadow-2xs transition-colors shrink-0"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {/* ---------------- DESKTOP TOP BAR (>= md) ---------------- */}
          <div className="hidden md:flex items-center justify-between w-full">
            {/* Left: Brand Monogram Crest & Title */}
            <div className="flex items-center gap-6">
              <Link
                to="/"
                className="flex items-center gap-2.5 text-inherit no-underline group"
              >
                <span className="font-serif italic text-lg tracking-tight text-ink">
                  Groovy
                </span>
                <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-ink-soft border-l border-line pl-2 ml-0.5 hidden sm:inline-block">
                  High-Fidelity Streaming
                </span>
              </Link>

              {/* Top Route Navigation Links */}
              <nav className="flex items-center gap-5 pl-4 border-l border-line font-mono text-[10px] uppercase tracking-[0.14em]">
                <Link
                  to="/"
                  activeProps={{
                    className:
                      'text-ink font-semibold border-b border-blue pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-ink-soft hover:text-ink pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Catalog
                </Link>
                <Link
                  to="/search"
                  activeProps={{
                    className:
                      'text-ink font-semibold border-b border-blue pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-ink-soft hover:text-ink pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Search
                </Link>
                <Link
                  to="/artists"
                  activeProps={{
                    className:
                      'text-ink font-semibold border-b border-blue pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-ink-soft hover:text-ink pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Artists
                </Link>
                <Link
                  to="/playlists"
                  activeProps={{
                    className:
                      'text-ink font-semibold border-b border-blue pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-ink-soft hover:text-ink pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Playlists
                </Link>
                {isAuthenticated && (
                  <>
                    <Link
                      to="/feed"
                      activeProps={{
                        className:
                          'text-ink font-semibold border-b border-blue pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-ink-soft hover:text-ink pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Feed
                    </Link>
                    <Link
                      to="/activity"
                      activeProps={{
                        className:
                          'text-ink font-semibold border-b border-blue pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-ink-soft hover:text-ink pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Activity
                    </Link>
                    <button
                      type="button"
                      onClick={() => useJamStore.getState().openModal()}
                      className="flex items-center gap-1.5 text-ink-soft hover:text-emerald-400 pb-0.5 transition-colors cursor-pointer"
                      title="Start or Join Live Jam"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Live Jam</span>
                    </button>
                    <Link
                      to="/profile"
                      activeProps={{
                        className:
                          'text-ink font-semibold border-b border-blue pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-ink-soft hover:text-ink pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Profile
                    </Link>
                    <Link
                      to="/studio"
                      activeProps={{
                        className:
                          'text-ink font-semibold border-b border-blue pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-ink-soft hover:text-ink pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Studio
                    </Link>
                    <Link
                      to="/collection"
                      activeProps={{
                        className:
                          'text-ink font-semibold border-b border-blue pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-ink-soft hover:text-ink pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Collection
                    </Link>
                  </>
                )}
                {user?.role === 'ADMIN' && (
                  <Link
                    to="/admin/verification"
                    activeProps={{
                      className:
                        'text-ink font-semibold border-b border-blue pb-0.5',
                    }}
                    inactiveProps={{
                      className: 'text-blue hover:underline pb-0.5',
                    }}
                    className="transition-colors"
                  >
                    Admin Desk
                  </Link>
                )}
              </nav>
            </div>

            {/* Right: Search, Theme Toggle & User Auth Controls */}
            <div className="flex items-center gap-3">
              {/* Global Search Trigger (Desktop & Tablet) */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2.5 bg-panel border border-line hover:border-ink/60 px-3 py-1.5 rounded-full text-xs text-ink-soft transition-all cursor-pointer shadow-2xs hover:text-ink w-36 md:w-52"
              >
                <svg
                  className="w-3.5 h-3.5 text-ink-soft shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="truncate text-[11px] font-sans">
                  Search...
                </span>
                <kbd className="ml-auto font-mono text-[9px] border border-line bg-canvas px-1.5 py-0.5 rounded text-ink-soft/80">
                  ⌘K
                </kbd>
              </button>

              {/* Theme Switcher Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme mode"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                className="w-8 h-8 rounded-full border border-line bg-panel hover:bg-canvas hover:border-ink flex items-center justify-center text-ink-soft hover:text-ink transition-colors cursor-pointer shadow-2xs"
              >
                {theme === 'dark' ? <DarkModeSVG /> : <LightModeSVG />}
              </button>

              {/* User Auth Section */}
              {isLoading ? (
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft animate-pulse px-2">
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
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-panel text-ink flex items-center justify-center font-serif italic text-xs">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-serif italic text-xs text-ink leading-tight">
                        {user.displayName}
                      </span>
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink-soft">
                        {user.role}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="font-mono text-[9.5px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-panel hover:bg-canvas text-ink transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
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
            </div>
          </div>
        </header>
      )}

      {/* ===================== MOBILE LEFT SIDEBAR DRAWER (< md) ===================== */}
      {!isAuthPage && leftSidebarOpen && (
        <div
          onClick={() => setLeftSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 transition-opacity"
        />
      )}

      {!isAuthPage && (
        <aside
          aria-label="Navigation and profile drawer"
          className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-panel border-r border-line p-5 flex flex-col justify-between shadow-2xl transition-transform duration-200 ease-in-out ${
            leftSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="space-y-5 overflow-y-auto">
            {/* Drawer Header: Profile / User Info */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              {isAuthenticated && user ? (
                <Link
                  to="/profile"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center gap-3 min-w-0 flex-1 group"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-line group-hover:border-ink transition-colors shadow-2xs shrink-0">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-canvas-deep text-ink flex items-center justify-center font-serif italic text-sm">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif italic text-sm font-bold text-ink truncate group-hover:text-blue transition-colors">
                      {user.displayName}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-ink-soft truncate">
                      {user.role} • View Profile &rarr;
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="font-serif italic text-base font-bold text-ink">
                    Groovy Guest
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                    Welcome to High-Fidelity Streaming
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1.5 text-ink-soft hover:text-ink border border-line hover:border-ink rounded cursor-pointer transition-colors shrink-0 ml-2"
                aria-label="Close navigation menu"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Guest Auth Action Buttons */}
            {!isAuthenticated && (
              <div className="grid grid-cols-2 gap-2 border-b border-line pb-4">
                <Link
                  to="/login"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="font-mono text-center text-xs uppercase tracking-wider py-2 px-3 border border-line bg-canvas hover:bg-panel text-ink transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="font-mono text-center text-xs uppercase tracking-wider py-2 px-3 bg-ink text-canvas hover:bg-canvas hover:text-ink border border-ink font-semibold transition-colors"
                >
                  Join
                </Link>
              </div>
            )}

            {/* Navigation Directory */}
            <div className="space-y-1">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400 mb-2">
                Catalog &amp; Discovery
              </div>
              <nav className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.14em]">
                <Link
                  to="/"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                >
                  <span>Catalog Overview</span>
                  <span className="text-ink-soft">&rarr;</span>
                </Link>
                <Link
                  to="/search"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                >
                  <span>Search Catalog</span>
                  <span className="text-ink-soft">&rarr;</span>
                </Link>
                <Link
                  to="/artists"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                >
                  <span>Artists Roster</span>
                  <span className="text-ink-soft">&rarr;</span>
                </Link>
                <Link
                  to="/playlists"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                >
                  <span>Playlists</span>
                  <span className="text-ink-soft">&rarr;</span>
                </Link>

                {isAuthenticated && (
                  <>
                    <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400 mt-4 mb-2">
                      Your Vault
                    </div>
                    <Link
                      to="/feed"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                    >
                      <span>Social Feed</span>
                      <span className="text-ink-soft">&rarr;</span>
                    </Link>
                    <Link
                      to="/activity"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                    >
                      <span>Social &amp; Activity</span>
                      <span className="text-ink-soft">&rarr;</span>
                    </Link>
                    <Link
                      to="/profile"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                    >
                      <span>Profile &amp; Vault</span>
                      <span className="text-ink-soft">&rarr;</span>
                    </Link>
                    <Link
                      to="/studio"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                    >
                      <span>Artist Studio</span>
                      <span className="text-ink-soft">&rarr;</span>
                    </Link>
                    <Link
                      to="/collection"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line"
                    >
                      <span>Personal Collection</span>
                      <span className="text-ink-soft">&rarr;</span>
                    </Link>
                    {user?.role === 'ADMIN' && (
                      <Link
                        to="/admin/verification"
                        onClick={() => setLeftSidebarOpen(false)}
                        className="flex items-center justify-between p-2 text-blue hover:bg-canvas rounded border border-transparent hover:border-blue/30"
                      >
                        <span>Admin Desk</span>
                        <span className="text-blue">&rarr;</span>
                      </Link>
                    )}
                  </>
                )}
              </nav>
            </div>
          </div>

          {/* Drawer Bottom Controls: Theme Switcher & Sign Out */}
          <div className="pt-4 border-t border-line space-y-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center justify-between p-2 font-mono text-xs uppercase tracking-[0.14em] text-ink hover:bg-canvas rounded border border-line cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {theme === 'dark' ? <LightModeSVG /> : <DarkModeSVG />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </span>
              <span className="text-[10px] text-ink-soft font-sans">
                Toggle
              </span>
            </button>

            {isAuthenticated && (
              <button
                type="button"
                onClick={() => {
                  setLeftSidebarOpen(false)
                  logout()
                }}
                className="w-full py-2 px-3 font-mono text-xs uppercase tracking-wider text-red-500 hover:text-red-600 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 rounded transition-colors cursor-pointer text-center"
              >
                Sign Out
              </button>
            )}
          </div>
        </aside>
      )}

      {/* ===================== MAIN CONTENT AREA ===================== */}
      {isAuthPage ? (
        /* Dedicated Auth Content Outside Main Layout Outlet */
        <div
          className={`flex-1 flex items-center justify-center p-4 sm:p-8 ${currentTrack ? 'pb-32 md:pb-24' : 'pb-16 md:pb-0'}`}
        >
          <Outlet />
        </div>
      ) : (
        <div
          className={`flex-1 flex flex-col min-w-0 ${currentTrack ? 'pb-32 md:pb-24' : 'pb-16 md:pb-0'}`}
        >
          <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-12 py-10">
            <Outlet />
          </main>

          {/* Editorial Maison Footnote */}
          <footer className="border-t border-line py-8 px-6 text-center">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-soft">
              Groovy Streaming @ 2026 • All Rights Reserved • Made with ❤️ by
              &nbsp;
              <a
                href="https://github.com/kamehamehaa0000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:text-ink-soft "
              >
                Aayush Gupta
              </a>
            </p>
          </footer>
        </div>
      )}

      {/* ===================== GLOBAL AUDIO ENGINE & CONTROLS ===================== */}
      <GlobalAudioEngine key="permanent-audio-engine" />
      <PlayerBar key="permanent-player-bar" />
      <QueueDrawer key="permanent-queue-drawer" />
      <AuthPromptModal key="permanent-auth-modal" />
      <LiveJamModal key="permanent-live-jam-modal" />
      <CreatePlaylistModal key="permanent-create-playlist-modal" />
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
      <MobileActionDrawer
        isOpen={rightActionDrawerOpen}
        onClose={() => setRightActionDrawerOpen(false)}
      />
      <MobileBottomBar />
    </div>
  )
}
