import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useThemeStore } from '../stores/theme.store'
import { useLikesStore } from '../stores/likes.store'
import { useFollowsStore } from '../stores/follows.store'
import { usePreSavesStore } from '../stores/presaves.store'
import { useEntitlementsStore } from '../stores/entitlements.store'
import { usePlaylistsStore } from '../stores/playlists.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../stores/create-playlist-modal.store'
import { useGoogleFedCM } from '../hooks/useGoogleFedCM'
import { DarkModeSVG, LightModeSVG, PlusIconSVG } from '../components/icons'
import { GlobalAudioEngine } from '../components/player/GlobalAudioEngine'
import { PlayerBar } from '../components/player/PlayerBar'
import { QueueDrawer } from '../components/player/QueueDrawer'
import { DeviceSheet } from '../components/player/DevicePanel'
import { DesktopRightSidebar } from '../components/player/DesktopRightSidebar'
import { MobileExpandedPlayer } from '../components/player/MobileExpandedPlayer'
import { AuthPromptModal } from '../components/auth/AuthPromptModal'
import { GlobalSearchModal } from '../components/search/GlobalSearchModal'
import { LiveJamModal } from '../components/jam/LiveJamModal'
import { useJamStore } from '../stores/jam.store'
import { MobileBottomBar } from '../components/navigation/MobileBottomBar'
import { MobileActionDrawer } from '../components/navigation/MobileActionDrawer'
import { NotificationBell } from '../components/navigation/NotificationBell'
import { useNotificationsStore } from '../stores/notifications.store'
import { CreatePlaylistModal } from '../components/playlists/CreatePlaylistModal'
import { AddToPlaylistModal } from '../components/playlists/AddToPlaylistModal'
import { trackLastVisitedPath, isAuthRoute } from '../lib/auth-redirect'

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
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createMenuRef = useRef<HTMLDivElement>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const activeJamRoom = useJamStore((s) => s.activeRoom)
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore(
    (s) => s.openModal,
  )

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
      useNotificationsStore.getState().fetchUnreadCount()
      const cleanupSSE = useNotificationsStore.getState().connectSSE()
      return () => {
        cleanupSSE()
      }
    } else {
      useLikesStore.getState().clearLikes()
      useFollowsStore.getState().clearFollows()
      usePreSavesStore.getState().clearPreSaves()
      useEntitlementsStore.getState().clearEntitlements()
      usePlaylistsStore.getState().clearPlaylists()
    }
  }, [isAuthenticated])

  const location = useLocation()
  const { pathname } = location

  // Track last visited non-auth route so login can safely return the user
  useEffect(() => {
    const fullPath =
      pathname + (location.searchStr ? `?${location.searchStr}` : '')
    if (!isAuthRoute(pathname)) {
      trackLastVisitedPath(fullPath)
    }
  }, [pathname, location.searchStr])

  // Close desktop create and user dropdowns on outside click or Escape key
  useEffect(() => {
    if (!createMenuOpen && !userMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        createMenuOpen &&
        createMenuRef.current &&
        !createMenuRef.current.contains(target)
      ) {
        setCreateMenuOpen(false)
      }
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(target)
      ) {
        setUserMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCreateMenuOpen(false)
        setUserMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [createMenuOpen, userMenuOpen])

  // Close menus on route change
  useEffect(() => {
    setCreateMenuOpen(false)
    setUserMenuOpen(false)
  }, [pathname])

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/signup' ||
    pathname === '/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  const currentRedirect = !isAuthPage
    ? pathname + (location.searchStr ? `?${location.searchStr}` : '')
    : undefined

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans flex flex-col transition-colors duration-200">
      {/* ===================== TOP HEADER ===================== */}
      {isAuthPage ? (
        /* Dedicated Auth Header with Back to Home & Theme Toggle */
        <header className="w-full h-14 border-b border-border bg-background/90 backdrop-blur-md px-5 sm:px-8 flex items-center justify-between shrink-0">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-eyebrow text-caption uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span className="transition-transform duration-200 group-hover:-translate-x-1">
              &larr;
            </span>
            <span>Back to home</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="font-serif italic text-lg tracking-tight text-foreground hover:opacity-80 transition-opacity"
            >
              Groovy
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <LightModeSVG /> : <DarkModeSVG />}
            </button>
          </div>
        </header>
      ) : (
        /* ===================== TOP NAVIGATION HEADER ===================== */
        <header className="sticky top-0 z-40 w-full h-14 border-b border-border bg-background/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between shrink-0 transition-colors duration-200">
          {/* ---------------- MOBILE TOP BAR (< md) ---------------- */}
          <div className="md:hidden flex items-center justify-between w-full">
            {/* Left: Profile Icon (Left Sidebar Toggle) */}
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(true)}
              aria-label="Open profile and navigation menu"
              className="w-8 h-8 rounded-full border border-border bg-card hover:border-foreground flex items-center justify-center overflow-hidden cursor-pointer shadow-raised transition-colors shrink-0"
            >
              {isAuthenticated && user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-full h-full object-cover"
                />
              ) : isAuthenticated && user ? (
                <span className="font-serif italic text-caption font-bold text-foreground">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <svg
                  className="w-4 h-4 text-muted-foreground"
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

            {/* Center: Spotify-style dual pill navigation (Home & Following) */}
            <div className="flex items-center gap-2 ml-2 flex-1 min-w-0">
              <Link
                to="/"
                className={`px-3.5 py-2 rounded-full text-caption font-semibold tracking-tight transition-all duration-150 select-none no-underline active:scale-95 shrink-0 ${
                  pathname === '/'
                    ? 'bg-[#1ed760] text-black shadow-xs font-bold'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border/70'
                }`}
              >
                Home
              </Link>
              <Link
                to="/releases"
                className={`px-3.5 py-2 rounded-full text-caption font-semibold tracking-tight transition-all duration-150 select-none no-underline active:scale-95 shrink-0 ${
                  pathname.startsWith('/releases')
                    ? 'bg-[#1ed760] text-black shadow-xs font-bold'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border/70'
                }`}
              >
                Following
              </Link>
            </div>
            {/* Right: Notifications & Plus (+) Icon */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isAuthenticated && <NotificationBell />}
              <button
                type="button"
                onClick={() => setRightActionDrawerOpen(true)}
                aria-label="Create and quick actions"
                className="w-8 h-8 rounded-full hover:border-foreground hover:text-foreground text-muted-foreground flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                <PlusIconSVG className="w-7 h-7" />
              </button>
            </div>
          </div>

          {/* ---------------- DESKTOP TOP BAR (>= md) ---------------- */}
          <div className="hidden md:flex items-center justify-between w-full">
            {/* Left: Brand Monogram Crest & Title */}
            <div className="flex items-center gap-6">
              <Link
                to="/"
                className="flex items-center gap-2.5 text-inherit no-underline group"
              >
                <span className="font-serif italic text-lg tracking-tight text-foreground">
                  Groovy
                </span>
              </Link>

              {/* Top Route Navigation Links */}
              <nav className="flex items-center gap-5 pl-4 border-l border-border font-eyebrow text-eyebrow uppercase tracking-wider">
                <Link
                  to="/"
                  activeProps={{
                    className:
                      'text-foreground font-semibold border-b border-primary pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-muted-foreground hover:text-foreground pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Catalog
                </Link>
                <Link
                  to="/artists"
                  activeProps={{
                    className:
                      'text-foreground font-semibold border-b border-primary pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-muted-foreground hover:text-foreground pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Artists
                </Link>
                <Link
                  to="/playlists"
                  activeProps={{
                    className:
                      'text-foreground font-semibold border-b border-primary pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-muted-foreground hover:text-foreground pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Playlists
                </Link>
                <Link
                  to="/library"
                  activeProps={{
                    className:
                      'text-foreground font-semibold border-b border-primary pb-0.5',
                  }}
                  inactiveProps={{
                    className: 'text-muted-foreground hover:text-foreground pb-0.5',
                  }}
                  className="transition-colors"
                >
                  Library
                </Link>

                {isAuthenticated && (
                  <>
                    <Link
                      to="/feed"
                      activeProps={{
                        className:
                          'text-foreground font-semibold border-b border-primary pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-muted-foreground hover:text-foreground pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Feed
                    </Link>
                    <Link
                      to="/vault"
                      activeProps={{
                        className:
                          'text-foreground font-semibold border-b border-primary pb-0.5',
                      }}
                      inactiveProps={{
                        className: 'text-muted-foreground hover:text-foreground pb-0.5',
                      }}
                      className="transition-colors"
                    >
                      Vault
                    </Link>
                  </>
                )}
              </nav>
            </div>

            {/* Right: Search, Theme Toggle & User Auth Controls */}
            <div className="flex items-center gap-3">
              {/* Global Search Trigger (Desktop & Tablet) */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2.5 bg-card border border-border hover:border-foreground/60 px-3 py-1.5 rounded-full text-caption text-muted-foreground transition-all cursor-pointer shadow-raised hover:text-foreground w-36 md:w-52"
              >
                <svg
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="truncate text-eyebrow font-sans">
                  Search...
                </span>
                <kbd className="ml-auto font-mono text-eyebrow border border-border bg-background px-1.5 py-0.5 rounded-control text-muted-foreground/80">
                  ⌘K
                </kbd>
              </button>

              {/* Quick Actions Dropdown Menu (+) */}
              <div className="relative" ref={createMenuRef}>
                <button
                  type="button"
                  onClick={() => setCreateMenuOpen((prev) => !prev)}
                  aria-label="Create new playlist or live jam"
                  aria-haspopup="menu"
                  aria-expanded={createMenuOpen}
                  title="Create"
                  className={`w-8 h-8 rounded-full border bg-card flex items-center justify-center transition-all cursor-pointer shadow-raised relative group ${
                    createMenuOpen
                      ? 'border-foreground text-foreground bg-muted'
                      : 'border-border hover:border-foreground hover:bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      createMenuOpen ? 'rotate-45 text-foreground' : ''
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="sr-only">Create and quick actions</span>

                  {activeJamRoom && !createMenuOpen && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-card animate-pulse" />
                  )}

                  {!createMenuOpen && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-control shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
                    >
                      Create
                    </span>
                  )}
                </button>

                {createMenuOpen && (
                  <div
                    role="menu"
                    aria-orientation="vertical"
                    className="absolute right-0 top-full mt-4 w-64 bg-card border border-border shadow-2xl rounded-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1"
                  >
                    {/* Creation Header */}
                    <div className="px-2.5 py-2 border-b border-border mb-1">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-serif italic text-caption font-semibold text-foreground truncate">
                              Creation Desk
                            </span>{' '}
                            <span className="px-1.5 py-0.5 rounded-md font-eyebrow text-eyebrow uppercase tracking-wider bg-background border border-border text-muted-foreground">
                              Quick Actions
                            </span>
                          </div>
                          <div className="font-mono text-eyebrow text-muted-foreground truncate">
                            Create &amp; broadcast
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeJamRoom && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-control font-eyebrow text-eyebrow uppercase tracking-wider bg-success-soft text-success border border-success/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            Jam Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Start / Join Live Jam */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenuOpen(false)
                        useJamStore.getState().openModal()
                      }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-control border border-border bg-background flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="2" />
                          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                            Live Jam
                          </span>
                          {activeJamRoom && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-success-soft text-success text-eyebrow font-eyebrow uppercase tracking-wider border border-success/30 rounded-control">
                              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <p className="font-sans text-eyebrow text-muted-foreground truncate">
                          {activeJamRoom
                            ? 'Active room session'
                            : 'Synchronized social session'}
                        </p>
                      </div>
                    </button>

                    {/* Create Playlist */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCreateMenuOpen(false)
                        if (!isAuthenticated) {
                          openAuthModal({
                            title: 'Create Playlists',
                            description:
                              'Sign in to build custom playlists and collaborative mixes on Groovy.',
                          })
                          return
                        }
                        openCreatePlaylistModal()
                      }}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-control border border-border bg-background flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                          Create Playlist
                        </span>
                        <p className="font-sans text-eyebrow text-muted-foreground truncate">
                          Curate track collections &amp; mixes
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Notification Bell */}
              {isAuthenticated && <NotificationBell />}

              {/* Theme Switcher Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme mode"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                className="w-8 h-8 rounded-full border border-border bg-card hover:bg-background hover:border-foreground flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-raised"
              >
                {theme === 'dark' ? <DarkModeSVG /> : <LightModeSVG />}
              </button>

              {/* User Auth Section */}
              {isLoading ? (
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground animate-pulse px-2">
                  Authenticating...
                </span>
              ) : isAuthenticated && user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((prev) => !prev)}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    aria-label="User account menu"
                    className="flex items-center gap-2.5 text-inherit no-underline group cursor-pointer focus:outline-none rounded-full py-0.5 px-1 hover:bg-background transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-border group-hover:border-foreground transition-colors shadow-raised shrink-0">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-card text-foreground flex items-center justify-center font-serif italic text-caption">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </button>

                  {userMenuOpen && (
                    <div
                      role="menu"
                      aria-orientation="vertical"
                      className="absolute right-0 top-full mt-4 w-64 bg-card border border-border shadow-2xl rounded-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1"
                    >
                      {/* User Identity Header */}
                      <div className="px-2.5 py-2 border-b border-border mb-1">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-border shrink-0">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-background text-foreground flex items-center justify-center font-serif italic text-caption">
                                {user.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-serif italic text-caption font-semibold text-foreground truncate">
                              {user.displayName}
                            </div>
                            <div className="font-mono text-eyebrow text-muted-foreground truncate">
                              {user.email}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded-control font-eyebrow text-eyebrow uppercase tracking-wider bg-background border border-border text-muted-foreground">
                            {user.role}
                          </span>
                          {user.isEmailVerified && (
                            <span className="px-1.5 py-0.5 rounded-control font-eyebrow text-eyebrow uppercase tracking-wider bg-success-soft text-success border border-success/20">
                              Verified
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Profile */}
                      <Link
                        to="/profile"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group no-underline"
                      >
                        <div className="w-7 h-7  flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                            Profile
                          </span>
                          <p className="font-sans text-eyebrow text-muted-foreground truncate">
                            Preferences &amp; Settings
                          </p>
                        </div>
                      </Link>
                      {/* Recents */}
                      <Link
                        to="/history"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group no-underline"
                      >
                        <div className="w-7 h-7 rounded-full  flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                            Recents
                          </span>
                          <p className="font-sans text-eyebrow text-muted-foreground truncate">
                            Listening History
                          </p>
                        </div>
                      </Link>

                      {/* Releases / Artist Radar */}
                      <Link
                        to="/releases"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group no-underline"
                      >
                        <div className="w-7 h-7 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
                            <circle cx="12" cy="12" r="2" />
                            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
                            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                            Releases
                          </span>
                          <p className="font-sans text-eyebrow text-muted-foreground truncate">
                            New from followed artists
                          </p>
                        </div>
                      </Link>
                      {/* Studio */}
                      <Link
                        to="/studio"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group no-underline"
                      >
                        <div className="w-7 h-7  flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                            Studio
                          </span>
                          <p className="font-sans text-eyebrow text-muted-foreground truncate">
                            Artist &amp; catalog management
                          </p>
                        </div>
                      </Link>

                      {/* Admin Desk (If Admin) */}
                      {user.role === 'ADMIN' && (
                        <Link
                          to="/admin/verification"
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground transition-colors cursor-pointer group no-underline"
                        >
                          <div className="w-7 h-7  flex items-center justify-center text-primary group-hover:border-primary/50 transition-colors shrink-0">
                            <svg
                              className="w-3.5 h-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-primary block">
                              Admin Desk
                            </span>
                            <p className="font-sans text-eyebrow text-muted-foreground truncate">
                              Manage Platform
                            </p>
                          </div>
                        </Link>
                      )}

                      {/* Divider */}
                      <div className="border-t border-border my-1" />

                      {/* Sign Out */}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false)
                          logout()
                        }}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-control text-left hover:bg-background text-foreground hover:text-destructive transition-colors cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-control border border-border bg-background flex items-center justify-center text-muted-foreground group-hover:text-destructive group-hover:border-destructive transition-colors shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium block">
                            Sign Out
                          </span>
                          <p className="font-sans text-eyebrow text-muted-foreground group-hover:text-destructive truncate">
                            End current session
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/login"
                    search={currentRedirect ? { redirect: currentRedirect } : undefined}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-card hover:bg-muted text-foreground transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    search={currentRedirect ? { redirect: currentRedirect } : undefined}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 bg-foreground text-background border border-foreground hover:bg-background hover:text-foreground font-medium transition-colors"
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
          className="md:hidden fixed inset-0 bg-foreground/40 backdrop-blur-xs z-50 transition-opacity"
        />
      )}

      {!isAuthPage && (
        <aside
          aria-label="Navigation and profile drawer"
          className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-border p-5 flex flex-col justify-between shadow-2xl transition-transform duration-200 ease-in-out ${
            leftSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="space-y-5 overflow-y-auto">
            {/* Drawer Header: Profile / User Info */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              {isAuthenticated && user ? (
                <Link
                  to="/profile"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center gap-3 min-w-0 flex-1 group"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-border group-hover:border-foreground transition-colors shadow-raised shrink-0">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted text-foreground flex items-center justify-center font-serif italic text-body">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-sans text-body font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {user.displayName}
                    </div>
                    <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground truncate">
                      {user.role} • View Profile &rarr;
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="font-sans text-title font-semibold text-foreground">
                    Groovy Guest
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground border border-border hover:border-foreground rounded-control cursor-pointer transition-colors shrink-0 ml-2"
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
              <div className="grid grid-cols-2 gap-2 border-b border-border pb-4">
                <Link
                  to="/login"
                  search={currentRedirect ? { redirect: currentRedirect } : undefined}
                  onClick={() => setLeftSidebarOpen(false)}
                  className="font-eyebrow text-center text-caption uppercase tracking-wider py-2 px-3 border border-border bg-background hover:bg-card text-foreground transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  search={currentRedirect ? { redirect: currentRedirect } : undefined}
                  onClick={() => setLeftSidebarOpen(false)}
                  className="font-eyebrow text-center text-caption uppercase tracking-wider py-2 px-3 bg-foreground text-background hover:bg-background hover:text-foreground border border-foreground font-semibold transition-colors"
                >
                  Join
                </Link>
              </div>
            )}

            {/* Navigation Directory */}
            <div className="space-y-1">
              <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-2">
                Catalog &amp; Discovery
              </div>
              <nav className="flex flex-col gap-1 font-eyebrow text-caption uppercase tracking-wider">
                <Link
                  to="/"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                >
                  <span>Catalog Overview</span>
                  <span className="text-muted-foreground">&rarr;</span>
                </Link>
                <Link
                  to="/search"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                >
                  <span>Search Catalog</span>
                  <span className="text-muted-foreground">&rarr;</span>
                </Link>
                <Link
                  to="/artists"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                >
                  <span>Artists Roster</span>
                  <span className="text-muted-foreground">&rarr;</span>
                </Link>
                <Link
                  to="/playlists"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                >
                  <span>Public Playlists</span>
                  <span className="text-muted-foreground">&rarr;</span>
                </Link>
                <Link
                  to="/library"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                >
                  <span>Your Library</span>
                  <span className="text-muted-foreground">&rarr;</span>
                </Link>

                {isAuthenticated && (
                  <>
                    <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mt-4 mb-2">
                      Your Vault
                    </div>
                    <Link
                      to="/releases"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                    >
                      <span>Artist Radar / Releases</span>
                      <span className="text-muted-foreground">&rarr;</span>
                    </Link>
                    <Link
                      to="/history"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                    >
                      <span>Listening History</span>
                      <span className="text-muted-foreground">&rarr;</span>
                    </Link>
                    <Link
                      to="/feed"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                    >
                      <span>Community Feed</span>
                      <span className="text-muted-foreground">&rarr;</span>
                    </Link>
                    <Link
                      to="/profile"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                    >
                      <span>Profile &amp; Vault</span>
                      <span className="text-muted-foreground">&rarr;</span>
                    </Link>
                    <Link
                      to="/studio"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                    >
                      <span>Artist Studio</span>
                      <span className="text-muted-foreground">&rarr;</span>
                    </Link>
                    <Link
                      to="/vault"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border"
                    >
                      <span>Personal Vault</span>
                      <span className="text-muted-foreground">&rarr;</span>
                    </Link>
                    {user?.role === 'ADMIN' && (
                      <Link
                        to="/admin/verification"
                        onClick={() => setLeftSidebarOpen(false)}
                        className="flex items-center justify-between p-2 text-primary hover:bg-background rounded-control border border-transparent hover:border-primary/30"
                      >
                        <span>Admin Desk</span>
                        <span className="text-primary">&rarr;</span>
                      </Link>
                    )}
                  </>
                )}
              </nav>
            </div>
          </div>

          {/* Drawer Bottom Controls: Theme Switcher & Sign Out */}
          <div className="pt-4 border-t border-border space-y-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center justify-between p-2 font-eyebrow text-caption uppercase tracking-wider text-foreground hover:bg-background rounded-control border border-border cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {theme === 'dark' ? <LightModeSVG /> : <DarkModeSVG />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </span>
              <span className="text-eyebrow text-muted-foreground font-sans">
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
                className="w-full py-2 px-3 font-eyebrow text-caption uppercase tracking-wider text-destructive hover:text-destructive border border-destructive/20 hover:border-destructive bg-destructive-soft hover:bg-destructive/20 rounded-control transition-colors cursor-pointer text-center"
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
          className={`flex-1 flex items-center justify-center p-2 sm:p-8 ${currentTrack ? 'pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-24' : 'pb-16 md:pb-0'}`}
        >
          <Outlet />
        </div>
      ) : (
        <div className="flex-1 flex min-w-0 relative">
          {/* Main App Page Flow */}
          <div
            className={`flex-1 flex flex-col min-w-0 ${currentTrack ? 'pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-24' : 'pb-16 md:pb-0'}`}
          >
            <main
              className={
                pathname === '/feed' || pathname === '/feed/'
                  ? 'flex-1 w-full max-w-6xl mx-auto'
                  : pathname === '/' ||
                      pathname === '/artists' ||
                      pathname === '/artists/' ||
                      pathname === '/playlists' ||
                      pathname === '/playlists/' ||
                      pathname === '/library' ||
                      pathname === '/library/' ||
                      pathname === '/vault' ||
                      pathname.startsWith('/vault/')
                    ? 'flex-1 w-full max-w-6xl mx-auto'
                    : 'flex-1 max-w-5xl w-full mx-auto px-2 sm:px-12 sm:py-10'
              }
            >
              <Outlet />
            </main>
          </div>

          {/* Desktop Right Sidebar (Now Playing & Queue Docked Panel) */}
          <DesktopRightSidebar />
        </div>
      )}

      {/* ===================== GLOBAL AUDIO ENGINE & CONTROLS ===================== */}
      <GlobalAudioEngine key="permanent-audio-engine" />
      <PlayerBar key="permanent-player-bar" />
      <MobileExpandedPlayer key="permanent-mobile-expanded-player" />
      <QueueDrawer key="permanent-queue-drawer" />
      <DeviceSheet key="permanent-device-sheet" />
      <AuthPromptModal key="permanent-auth-modal" />
      <LiveJamModal key="permanent-live-jam-modal" />
      <CreatePlaylistModal key="permanent-create-playlist-modal" />
      <AddToPlaylistModal key="permanent-add-to-playlist-modal" />
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
