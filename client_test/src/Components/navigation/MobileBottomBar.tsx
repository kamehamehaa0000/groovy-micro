import { Link, useLocation } from '@tanstack/react-router'

export function MobileBottomBar() {
  const { pathname } = useLocation()

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/signup' ||
    pathname === '/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  if (isAuthPage) return null

  const isCatalogActive = pathname === '/'
  const isSearchActive = pathname.startsWith('/search')
  const isLibraryActive =
    pathname.startsWith('/playlists') ||
    pathname.startsWith('/collection') ||
    pathname.startsWith('/personal-collection')

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-panel/95 backdrop-blur-md border-t border-line z-40 flex items-center justify-around px-2 select-none shadow-lg transition-colors duration-200"
    >
      {/* 1. Catalog / Home */}
      <Link
        to="/"
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          isCatalogActive
            ? 'text-ink font-semibold'
            : 'text-ink-soft hover:text-ink'
        }`}
      >
        <svg
          className="w-5 h-5 mb-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isCatalogActive ? '2.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="font-mono text-[9px] uppercase tracking-wider">
          Catalog
        </span>
      </Link>

      {/* 2. Search */}
      <Link
        to="/search"
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          isSearchActive
            ? 'text-ink font-semibold'
            : 'text-ink-soft hover:text-ink'
        }`}
      >
        <svg
          className="w-5 h-5 mb-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isSearchActive ? '2.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="font-mono text-[9px] uppercase tracking-wider">
          Search
        </span>
      </Link>

      {/* 3. Library / Playlists */}
      <Link
        to="/playlists"
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          isLibraryActive
            ? 'text-ink font-semibold'
            : 'text-ink-soft hover:text-ink'
        }`}
      >
        <svg
          className="w-5 h-5 mb-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isLibraryActive ? '2.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="16" y2="18" />
          <polygon
            points="3 6 3 18 6 12 3 6"
            fill={isLibraryActive ? 'currentColor' : 'none'}
          />
        </svg>
        <span className="font-mono text-[9px] uppercase tracking-wider">
          Library
        </span>
      </Link>
    </nav>
  )
}
