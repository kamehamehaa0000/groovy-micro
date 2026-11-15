import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/auth.store'
import { useThemeStore } from '../../stores/theme.store'
import { useJamStore } from '../../stores/jam.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'
import { DarkModeSVG, LightModeSVG, PlusIconSVG } from '../Icons'
import { NotificationBell } from './NotificationBell'
import { isAuthRoute } from '../../lib/auth-redirect'
import {
  BadgeCheckIcon,
  HeadphonesIcon,
  LogOutIcon,
  Mic2Icon,
  PlusIcon,
  RadioIcon,
  RotateCcwClockIcon,
  SearchIcon,
  User,
  UserRoundShieldIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react'

export interface TopNavbarProps {
  onOpenLeftSidebar: () => void
  onOpenRightActionDrawer: () => void
  onOpenSearch: () => void
  isAuthPage?: boolean
}

export function TopNavbar({
  onOpenLeftSidebar,
  onOpenRightActionDrawer,
  onOpenSearch,
  isAuthPage: isAuthPageProp,
}: TopNavbarProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const activeJamRoom = useJamStore((s) => s.activeRoom)
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore(
    (s) => s.openModal,
  )

  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createMenuRef = useRef<HTMLDivElement>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const location = useLocation()
  const { pathname } = location
  const isAuthPage = isAuthPageProp ?? isAuthRoute(pathname)

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

  const currentRedirect = !isAuthPage
    ? pathname + (location.searchStr ? `?${location.searchStr}` : '')
    : undefined

  if (isAuthPage) {
    return (
      /* Dedicated Auth Header with Back to Home & Theme Toggle */
      <header className="w-full h-14 border-b border-border bg-background/90 backdrop-blur-md px-5 sm:px-8 flex items-center justify-between shrink-0">
        <Link
          to="/"
          className="flex items-center gap-2.5 no-underline font-semibold group text-lg tracking-tight text-foreground hover:text-muted-foreground transition-colors"
        >
          GROOVY
        </Link>

        <div className="flex items-center gap-4">
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
    )
  }

  return (
    /* ===================== TOP NAVIGATION HEADER ===================== */
    <header className="sticky top-0 z-40 w-full h-14 border-b border-border bg-background px-4 sm:px-8 flex items-center justify-between shrink-0 transition-colors duration-200">
      {/* ---------------- MOBILE TOP BAR (< md) ---------------- */}
      <div className="md:hidden flex items-center justify-between w-full">
        {/* Left: Profile Icon (Left Sidebar Toggle) */}
        <button
          type="button"
          onClick={onOpenLeftSidebar}
          aria-label="Open profile and navigation menu"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-card cursor-pointer shadow-raised transition-colors shrink-0 hover:border-foreground sm:h-8 sm:w-8"
        >
          {isAuthenticated && user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-full h-full object-cover"
            />
          ) : isAuthenticated && user ? (
            <span className="text-caption font-bold text-foreground">
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
            onClick={onOpenRightActionDrawer}
            aria-label="Create and quick actions"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors cursor-pointer shrink-0 hover:border-foreground hover:text-foreground sm:h-8 sm:w-8"
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
            className="flex items-center gap-2.5 no-underline font-semibold group text-lg tracking-tight text-foreground hover:text-muted-foreground transition-colors"
          >
            GROOVY
          </Link>

          {/* Top Route Navigation Links */}
          <nav className="flex items-center gap-2 font-semibold text-eyebrow uppercase tracking-wider">
            <NavBarLink to="/" label="Catalog" />
            <NavBarLink to="/artists" label="Artists" />
            {/* <NavBarLink to="/releases" label="Releases" /> */}
            <NavBarLink to="/playlists" label="Playlists" />
            <NavBarLink to="/library" label="Library" />

            {isAuthenticated && (
              <>
                <NavBarLink to="/feed" label="Feed" />
                <NavBarLink to="/vault" label="Vault" />
              </>
            )}
          </nav>
        </div>

        {/* Right: Search, Theme Toggle & User Auth Controls */}
        <div className="flex items-center gap-3">
          {/* Global Search Trigger (Desktop & Tablet) */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center gap-2.5 bg-card hover:border-foreground/60 px-3 py-1.5 rounded-full text-caption text-muted-foreground transition-all cursor-pointer shadow-raised hover:text-foreground w-36 md:w-52"
          >
            <SearchIcon className="w-4 h-4" />
            <span className="truncate text-eyebrow font-sans">Search...</span>
            <kbd className="ml-auto font-mono text-eyebrow px-1.5 py-0.5 rounded-control text-muted-foreground/80">
              ⌘ + K
            </kbd>
          </button>

          {isAuthenticated && ( // Quick Actions Dropdown Menu (+) */}
            <div className="relative" ref={createMenuRef}>
              <button
                type="button"
                onClick={() => setCreateMenuOpen((prev) => !prev)}
                aria-label="Create new playlist or live jam"
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
                title="Create"
                className={`w-8 h-8 rounded-full  bg-card flex items-center justify-center transition-all cursor-pointer shadow-raised relative group ${
                  createMenuOpen
                    ? 'border-foreground text-foreground bg-muted'
                    : 'border-border hover:border-foreground hover:bg-background  text-muted-foreground hover:text-foreground'
                }`}
              >
                {createMenuOpen ? (
                  <XIcon className="w-4 h-4 transition-all duration-200" />
                ) : (
                  <XIcon className="w-4 h-4 rotate-45 transition-all duration-200" />
                )}
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
                  <div className="px-2 py-1 border-b border-border mb-1">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-foreground truncate">
                          Creation Desk
                        </span>{' '}
                        <div className="font-mono text-eyebrow text-muted-foreground truncate">
                          Create &amp; broadcast
                        </div>
                      </div>
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
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-control text-left hover:bg-muted text-foreground transition-colors cursor-pointer group"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                      <RadioIcon className="w-4 h-4" />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                        Live Jam
                      </span>
                      {activeJamRoom && (
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      )}
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
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-control text-left hover:bg-muted text-foreground transition-colors cursor-pointer group"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                      <PlusIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                        Create Playlist
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Notification Bell */}
          {isAuthenticated && <NotificationBell />}

          {/* Theme Switcher Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme mode"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="w-8 h-8 rounded-full  bg-card hover:bg-background hover:border-foreground flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-raised"
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
                <div className="w-7 h-7 rounded-full overflow-hidden hover:border hover:border-border  shadow-raised shrink-0">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-card text-foreground flex items-center justify-center font-serif  text-caption">
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
                  <div className="px-2.5 py-1.5 border-b border-border mb-1">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-caption font-semibold text-foreground flex gap-1 items-center">
                          <span className="truncate">{user.displayName}</span>
                          {user.isEmailVerified && (
                            <span aria-label="Email verified">
                              <BadgeCheckIcon className="w-4 h-4 text-success" />
                            </span>
                          )}
                          {user.role && (
                            <span className="gap-1 flex items-center text-xs font-mono uppercase tracking-wider">
                              {user.role === 'ADMIN' && (
                                <UserRoundShieldIcon className="w-4 h-4" />
                              )}
                              {user.role === 'LISTENER' && (
                                <HeadphonesIcon className="w-4 h-4" />
                              )}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-eyebrow text-muted-foreground truncate">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Profile */}
                  <Link
                    to="/profile"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-control text-left  hover:bg-muted text-foreground transition-colors cursor-pointer group no-underline"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                        Profile
                      </span>
                    </div>
                  </Link>

                  {/* Recents */}
                  <Link
                    to="/history"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-control text-left  hover:bg-muted text-foreground transition-colors cursor-pointer group no-underline"
                  >
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                      <RotateCcwClockIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                        Recents
                      </span>
                    </div>
                  </Link>

                  {/* Releases / Artist Radar */}
                  <Link
                    to="/releases"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-control text-left  hover:bg-muted text-foreground transition-colors cursor-pointer group no-underline"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                      <ZapIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                        Latest Releases
                      </span>
                    </div>
                  </Link>

                  {/* Studio */}
                  <Link
                    to="/studio"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-control text-left  hover:bg-muted text-foreground transition-colors cursor-pointer group no-underline"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                      <Mic2Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-foreground block">
                        Studio
                      </span>
                    </div>
                  </Link>

                  {/* Admin Desk (If Admin) */}
                  {user.role === 'ADMIN' && (
                    <Link
                      to="/admin/verification"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-control text-left  hover:bg-muted text-foreground transition-colors cursor-pointer group no-underline"
                    >
                      <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/50 transition-colors shrink-0">
                        <UserRoundShieldIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium text-primary block">
                          Admin Desk
                        </span>
                      </div>
                    </Link>
                  )}

                  {/* Sign Out */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false)
                      logout()
                    }}
                    className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-control text-left  hover:bg-muted text-foreground hover:text-destructive transition-colors cursor-pointer group"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-muted-foreground group-hover:text-destructive group-hover:border-destructive transition-colors shrink-0">
                      <LogOutIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider font-medium block">
                        Sign Out
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                search={
                  currentRedirect ? { redirect: currentRedirect } : undefined
                }
                className="active:text-primary active:bg-primary/10  text-sm text-muted-foreground hover:text-foreground bg-card rounded-full transition-colors duration-200 px-3 py-1.5"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                search={
                  currentRedirect ? { redirect: currentRedirect } : undefined
                }
                className="font-eyebrow rounded-full text-eyebrow uppercase tracking-wider py-1.5 px-3 bg-foreground text-background border border-foreground  hover:bg-muted hover:text-foreground font-medium transition-colors"
              >
                Join
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

const NavBarLink = ({ to, label }: { to: string; label: string }) => {
  return (
    <Link
      to={to}
      activeProps={{
        className: 'text-pimary bg-primary/10 font-medium ',
      }}
      inactiveProps={{
        className:
          'text-muted-foreground hover:text-foreground hover:bg-muted ',
      }}
      className="transition-colors duration-200 px-3 py-1.5 rounded-full "
    >
      {label}
    </Link>
  )
}
