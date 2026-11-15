import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import { useEffect, useState, useRef, lazy, Suspense } from 'react'
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
import { useAddToPlaylistModalStore } from '../stores/add-to-playlist-modal.store'
import { useGoogleFedCM } from '../hooks/useGoogleFedCM'
import { usePageLayout } from '../hooks/usePageLayout'
import { Container } from '../Components/layout/Container'
import { RouteError } from '../Components/ui/RouteError'
import { DarkModeSVG, LightModeSVG } from '../Components/Icons'
import { GlobalAudioEngine } from '../Components/player/GlobalAudioEngine'
import { PlayerBar } from '../Components/player/PlayerBar'
import { useJamStore } from '../stores/jam.store'
import { TopNavbar } from '../Components/navigation/TopNavbar'
import { MobileBottomBar } from '../Components/navigation/MobileBottomBar'
import { useNotificationsStore } from '../stores/notifications.store'
import { AppToaster } from '../Components/common/AppToaster'
import { trackLastVisitedPath, isAuthRoute } from '../lib/auth-redirect'
import { H1 } from '../Components/ui/typography'

const DesktopRightSidebar = lazy(() =>
  import('../Components/player/DesktopRightSidebar').then((m) => ({
    default: m.DesktopRightSidebar,
  })),
)
const QueueDrawer = lazy(() =>
  import('../Components/player/QueueDrawer').then((m) => ({
    default: m.QueueDrawer,
  })),
)
const DeviceSheet = lazy(() =>
  import('../Components/player/DevicePanel').then((m) => ({
    default: m.DeviceSheet,
  })),
)
const MobileExpandedPlayer = lazy(() =>
  import('../Components/player/MobileExpandedPlayer').then((m) => ({
    default: m.MobileExpandedPlayer,
  })),
)
const AuthPromptModal = lazy(() =>
  import('../Components/auth/AuthPromptModal').then((m) => ({
    default: m.AuthPromptModal,
  })),
)
const LiveJamModal = lazy(() =>
  import('../Components/jam/LiveJamModal').then((m) => ({
    default: m.LiveJamModal,
  })),
)
const CreatePlaylistModal = lazy(() =>
  import('../Components/playlists/CreatePlaylistModal').then((m) => ({
    default: m.CreatePlaylistModal,
  })),
)
const AddToPlaylistModal = lazy(() =>
  import('../Components/playlists/AddToPlaylistModal').then((m) => ({
    default: m.AddToPlaylistModal,
  })),
)
const GlobalSearchModal = lazy(() =>
  import('../Components/search/GlobalSearchModal').then((m) => ({
    default: m.GlobalSearchModal,
  })),
)
const MobileActionDrawer = lazy(() =>
  import('../Components/navigation/MobileActionDrawer').then((m) => ({
    default: m.MobileActionDrawer,
  })),
)

export interface RouterContext {
  auth: ReturnType<typeof useAuthStore.getState>
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  // A failed route used to blank the whole app.
  errorComponent: RouteError,
  notFoundComponent: () => (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
      <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
        404 · Nothing here
      </span>
      <H1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mt-3">
        That page is not in the catalogue
      </H1>
      <p className="mt-2 max-w-md text-caption leading-relaxed text-muted-foreground">
        The link may be old, or the release may have been pulled.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center rounded-control bg-foreground px-5 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-background transition-opacity hover:opacity-90 no-underline"
      >
        Back to catalog
      </Link>
    </div>
  ),
})

function RootComponent() {
  const { user, isAuthenticated, checkAuth, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [rightActionDrawerOpen, setRightActionDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  // Track modal open states to enable on-demand code splitting without breaking exit transitions
  const isAuthModalOpen = useAuthModalStore((s) => s.isOpen)
  const isCreatePlaylistOpen = useCreatePlaylistModalStore((s) => s.isOpen)
  const isAddToPlaylistOpen = useAddToPlaylistModalStore((s) => s.isOpen)
  const isJamModalOpen = useJamStore((s) => s.isModalOpen)
  const isDevicesOpen = usePlayerStore((s) => s.isDevicesOpen)
  const isNowPlayingExpanded = usePlayerStore((s) => s.isNowPlayingExpanded)

  const hasOpenedSearch = useRef(false)
  if (searchOpen) hasOpenedSearch.current = true

  const hasOpenedRightDrawer = useRef(false)
  if (rightActionDrawerOpen) hasOpenedRightDrawer.current = true

  const hasOpenedAuthModal = useRef(false)
  if (isAuthModalOpen) hasOpenedAuthModal.current = true

  const hasOpenedJamModal = useRef(false)
  if (isJamModalOpen) hasOpenedJamModal.current = true

  const hasOpenedCreatePlaylist = useRef(false)
  if (isCreatePlaylistOpen) hasOpenedCreatePlaylist.current = true

  const hasOpenedAddToPlaylist = useRef(false)
  if (isAddToPlaylistOpen) hasOpenedAddToPlaylist.current = true

  const hasOpenedDevices = useRef(false)
  if (isDevicesOpen) hasOpenedDevices.current = true

  const hasOpenedMobilePlayer = useRef(false)
  if (isNowPlayingExpanded) hasOpenedMobilePlayer.current = true

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

  // The auth shell owns its own chrome, so the full app chrome is hidden on
  // every auth route — including /oauth/callback, which the previous inline
  // list forgot.
  const isAuthPage = isAuthRoute(pathname)

  // Pages declare how wide they want to be; the shell applies it.
  const pageLayout = usePageLayout()

  const currentRedirect = !isAuthPage
    ? pathname + (location.searchStr ? `?${location.searchStr}` : '')
    : undefined

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <TopNavbar
        onOpenLeftSidebar={() => setLeftSidebarOpen(true)}
        onOpenRightActionDrawer={() => setRightActionDrawerOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        isAuthPage={isAuthPage}
      />

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
                className="flex h-10 w-10 shrink-0 ml-2 items-center justify-center rounded-control border border-border text-muted-foreground transition-colors cursor-pointer hover:border-foreground hover:text-foreground"
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
                  search={
                    currentRedirect ? { redirect: currentRedirect } : undefined
                  }
                  onClick={() => setLeftSidebarOpen(false)}
                  className="font-eyebrow text-center text-caption uppercase tracking-wider py-2 px-3 border border-border bg-background hover:bg-card text-foreground transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  search={
                    currentRedirect ? { redirect: currentRedirect } : undefined
                  }
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
          className={`flex-1 flex items-center justify-center p-2 sm:p-8 ${currentTrack ? 'pb-[calc(var(--player-chrome-mobile)+0.75rem)] md:pb-[calc(var(--player-chrome-desktop)+1rem)]' : 'pb-[calc(var(--player-chrome-mobile-idle)+0.75rem)] md:pb-0'}`}
        >
          <Outlet />
        </div>
      ) : (
        <div className="flex-1 flex min-w-0 relative">
          {/* Main App Page Flow */}
          <div
            className={`flex-1 flex flex-col min-w-0 ${currentTrack ? 'pb-[calc(var(--player-chrome-mobile)+0.75rem)] md:pb-[calc(var(--player-chrome-desktop)+1rem)]' : 'pb-[calc(var(--player-chrome-mobile-idle)+0.75rem)] md:pb-0'}`}
          >
            <main className="flex-1 w-full min-w-0 pb-20 pt-6 sm:pt-10">
              <Container width={pageLayout}>
                <Outlet />
              </Container>
            </main>
          </div>

          {/* Desktop Right Sidebar (Now Playing & Queue) — an overlay, so
              opening it never reflows the page behind it. */}
          <Suspense fallback={null}>
            <DesktopRightSidebar />
          </Suspense>
        </div>
      )}

      {/* ===================== GLOBAL AUDIO ENGINE & CONTROLS ===================== */}
      <GlobalAudioEngine key="permanent-audio-engine" />
      <PlayerBar key="permanent-player-bar" />
      {(isNowPlayingExpanded || hasOpenedMobilePlayer.current) && (
        <Suspense fallback={null}>
          <MobileExpandedPlayer key="permanent-mobile-expanded-player" />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <QueueDrawer key="permanent-queue-drawer" />
      </Suspense>
      {(isDevicesOpen || hasOpenedDevices.current) && (
        <Suspense fallback={null}>
          <DeviceSheet key="permanent-device-sheet" />
        </Suspense>
      )}
      {(isAuthModalOpen || hasOpenedAuthModal.current) && (
        <Suspense fallback={null}>
          <AuthPromptModal key="permanent-auth-modal" />
        </Suspense>
      )}
      {(isJamModalOpen || hasOpenedJamModal.current) && (
        <Suspense fallback={null}>
          <LiveJamModal key="permanent-live-jam-modal" />
        </Suspense>
      )}
      {(isCreatePlaylistOpen || hasOpenedCreatePlaylist.current) && (
        <Suspense fallback={null}>
          <CreatePlaylistModal key="permanent-create-playlist-modal" />
        </Suspense>
      )}
      {(isAddToPlaylistOpen || hasOpenedAddToPlaylist.current) && (
        <Suspense fallback={null}>
          <AddToPlaylistModal key="permanent-add-to-playlist-modal" />
        </Suspense>
      )}
      {(searchOpen || hasOpenedSearch.current) && (
        <Suspense fallback={null}>
          <GlobalSearchModal
            isOpen={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
        </Suspense>
      )}
      {(rightActionDrawerOpen || hasOpenedRightDrawer.current) && (
        <Suspense fallback={null}>
          <MobileActionDrawer
            isOpen={rightActionDrawerOpen}
            onClose={() => setRightActionDrawerOpen(false)}
          />
        </Suspense>
      )}
      <AppToaster key="global-toaster" />
      <MobileBottomBar />
    </div>
  )
}
