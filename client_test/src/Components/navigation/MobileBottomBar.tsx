import { Link, useLocation } from '@tanstack/react-router'
import { Disc3Icon, LibraryIcon, SearchIcon } from 'lucide-react'

export function MobileBottomBar() {
  const { pathname } = useLocation()

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  if (isAuthPage) return null

  const isCatalogActive = pathname === '/'
  const isSearchActive = pathname.startsWith('/search')
  const isLibraryActive =
    pathname.startsWith('/library') ||
    pathname.startsWith('/playlists') ||
    pathname.startsWith('/vault')

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-safe bg-card/95 backdrop-blur-md border-t border-border z-40 flex items-center justify-around px-2 select-none shadow-lg transition-colors duration-200"
    >
      {/* 1. Catalog / Home */}
      <Link
        to="/"
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          isCatalogActive
            ? 'text-foreground font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Disc3Icon className="w-5 h-5 mb-0.5" strokeWidth="2.5" />

        <span className="font-eyebrow text-eyebrow uppercase tracking-wider">
          Catalog
        </span>
      </Link>

      {/* 2. Search */}
      <Link
        to="/search"
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          isSearchActive
            ? 'text-foreground font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <SearchIcon className="w-5 h-5 mb-0.5" strokeWidth="2.5" />
        <span className="font-eyebrow text-eyebrow uppercase tracking-wider">
          Search
        </span>
      </Link>

      {/* 4. Library / Playlists */}
      <Link
        to="/library"
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          isLibraryActive
            ? 'text-foreground font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <LibraryIcon className="w-5 h-5 mb-0.5" strokeWidth="2.5" />
        <span className="font-eyebrow text-eyebrow uppercase tracking-wider">
          Library
        </span>
      </Link>
    </nav>
  )
}
