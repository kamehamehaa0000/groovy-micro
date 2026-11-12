import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { MediaGrid } from '../Components/media/MediaGrid'
import { FilterBar } from '../Components/ui/FilterBar'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../stores/create-playlist-modal.store'
import {
  useLibraryStore,
  buildUnifiedLibraryItems,
} from '../stores/library.store'
import type {
  LibraryFilterType,
  LibrarySortType,
  UnifiedLibraryItem,
} from '../types/library'
import { LibraryItemCard } from '../Components/library/LibraryItemCard'
import { SortMenu, type SortOption } from '../Components/ui'
import {
  GridIconSVG,
  ListIconSVG,
} from '../Components/Icons'

export const Route = createFileRoute('/library')({
  staticData: { layout: 'wide' },
  component: LibraryPageComponent,
})

function LibraryPageComponent() {
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore(
    (s) => s.openModal,
  )

  // Selected slices only: the whole-store subscription re-rendered the grid on
  // every store write.
  const viewMode = useLibraryStore((s) => s.viewMode)
  const activeSort = useLibraryStore((s) => s.activeSort)
  const sortDir = useLibraryStore((s) => s.sortDir)
  const activeFilter = useLibraryStore((s) => s.activeFilter)
  const searchQuery = useLibraryStore((s) => s.searchQuery)
  const payload = useLibraryStore((s) => s.payload)
  const isLoading = useLibraryStore((s) => s.isLoading)
  const error = useLibraryStore((s) => s.error)
  const setViewMode = useLibraryStore((s) => s.setViewMode)
  const setActiveSort = useLibraryStore((s) => s.setActiveSort)
  const setSortDir = useLibraryStore((s) => s.setSortDir)
  const setActiveFilter = useLibraryStore((s) => s.setActiveFilter)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)
  const fetchLibrary = useLibraryStore((s) => s.fetchLibrary)

  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr))
    }, 2800)
  }

  // Mount-aware SWR revalidation and lifecycle tracking
  useEffect(() => {
    useLibraryStore.getState().setLibraryMounted(true)

    if (isAuthenticated) {
      const { payload, isStale, lastFetchedAt, fetchLibrary } =
        useLibraryStore.getState()
      const isOlderThanStaleTime =
        !lastFetchedAt || Date.now() - lastFetchedAt > 60_000
      if (!payload || isStale || isOlderThanStaleTime) {
        fetchLibrary(true)
      }
    }

    return () => {
      useLibraryStore.getState().setLibraryMounted(false)
    }
  }, [isAuthenticated])

  // Revalidate library on window focus with 60-second throttle
  useEffect(() => {
    const handleFocus = () => {
      if (!isAuthenticated) return
      const { isStale, lastFetchedAt, fetchLibrary } =
        useLibraryStore.getState()
      const isOlderThanThrottle =
        !lastFetchedAt || Date.now() - lastFetchedAt > 60_000
      if (isStale || isOlderThanThrottle) {
        fetchLibrary(true)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated])

  // Transform raw payload into unified items
  const allItems = useMemo(() => {
    return buildUnifiedLibraryItems(payload)
  }, [payload])

  // Apply Filter Pills & In-Library Search
  const filteredAndSortedItems = useMemo(() => {
    let items = [...allItems]

    // 1. Filter Chips
    if (activeFilter !== 'all') {
      items = items.filter((item) => {
        if (activeFilter === 'playlists') {
          return item.kind === 'playlist' || item.kind === 'liked_songs'
        }
        if (activeFilter === 'albums') {
          return item.kind === 'album' && item.releaseType === 'ALBUM'
        }
        if (activeFilter === 'eps') {
          return item.kind === 'album' && item.releaseType === 'EP'
        }
        if (activeFilter === 'lps') {
          return item.kind === 'album' && item.releaseType === 'LP'
        }
        if (activeFilter === 'singles') {
          return item.kind === 'album' && item.releaseType === 'SINGLE'
        }
        if (activeFilter === 'artists') {
          return item.kind === 'artist'
        }
        if (activeFilter === 'collection') {
          return item.kind === 'personal_collection'
        }
        return true
      })
    }

    // 2. In-Library Search
    const trimmedQuery = searchQuery.trim().toLowerCase()
    if (trimmedQuery) {
      items = items.filter((item) => {
        return (
          item.title.toLowerCase().includes(trimmedQuery) ||
          item.subtitle.toLowerCase().includes(trimmedQuery) ||
          item.creatorOrArtistName.toLowerCase().includes(trimmedQuery)
        )
      })
    }

    // 3. Separate Pinned vs Non-Pinned
    const pinnedItems: UnifiedLibraryItem[] = []
    const regularItems: UnifiedLibraryItem[] = []

    for (const item of items) {
      if (item.isPinned) {
        pinnedItems.push(item)
      } else {
        regularItems.push(item)
      }
    }

    // Sort Pinned items by pinnedAt descending (most recently pinned first)
    pinnedItems.sort((a, b) => {
      const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0
      const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0
      return bTime - aTime
    })

    // Sort Regular items based on activeSort & sortDir
    regularItems.sort((a, b) => {
      if (activeSort === 'alphabetical') {
        const cmp = a.title.localeCompare(b.title, undefined, {
          sensitivity: 'base',
        })
        return sortDir === 'desc' ? -cmp : cmp
      }
      if (activeSort === 'creator') {
        const creatorCompare = a.creatorOrArtistName.localeCompare(
          b.creatorOrArtistName,
          undefined,
          { sensitivity: 'base' },
        )
        const cmp =
          creatorCompare !== 0
            ? creatorCompare
            : a.title.localeCompare(b.title, undefined, {
                sensitivity: 'base',
              })
        return sortDir === 'desc' ? -cmp : cmp
      }
      // Default: 'recent' (addedAt descending)
      const aTime = new Date(a.addedAt).getTime()
      const bTime = new Date(b.addedAt).getTime()
      const cmp = bTime - aTime
      return sortDir === 'asc' ? -cmp : cmp
    })

    return [...pinnedItems, ...regularItems]
  }, [allItems, activeFilter, searchQuery, activeSort, sortDir])

  const SORT_OPTIONS: SortOption<LibrarySortType>[] = [
    { value: 'recent', label: 'Recently added', defaultDirection: 'desc' },
    { value: 'alphabetical', label: 'Alphabetical', defaultDirection: 'asc' },
    { value: 'creator', label: 'Creator / Artist', defaultDirection: 'asc' },
  ]

  // Pill definitions
  const filterPills: Array<{ key: LibraryFilterType; label: string }> = [
    { key: 'playlists', label: 'Playlists' },
    { key: 'albums', label: 'Albums' },
    { key: 'eps', label: 'EPs' },
    { key: 'lps', label: 'LPs' },
    { key: 'singles', label: 'Singles' },
    { key: 'artists', label: 'Artists' },
    { key: 'collection', label: 'Personal Vault' },
  ]

  // If user is not authenticated, show Spotify-style guest promo
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl py-16 sm:py-24 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mx-auto mb-6 text-primary shadow-md">
          <svg
            className="w-8 h-8"
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
        <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground font-bold mb-3 tracking-tight">
          Your Library, Amplified
        </h1>
        <p className="text-muted-foreground text-body max-w-md mx-auto mb-8 leading-relaxed">
          Log in or create a free account to pin your favorite playlists, save
          albums, follow artists, and unlock your private Personal Collection
          vault.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className="font-eyebrow text-caption uppercase tracking-widest font-semibold px-8 py-3.5 bg-primary text-background rounded-full shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          Sign in to Groovy
        </button>
      </div>
    )
  }


  return (
    <div className="select-none">
      {/* ===================== STICKY TOOLBAR ===================== */}
      <header className="sticky top-14 z-30 bg-background/95 pt-2.5 pb-2.5 backdrop-blur-xl transition-colors">
        <FilterBar
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            onClear: () => setSearchQuery(''),
            placeholder: 'Find in Your Library...',
            ariaLabel: 'Search in library',
          }}
          options={filterPills.map((pill) => ({ value: pill.key, label: pill.label }))}
          value={activeFilter}
          onOptionChange={(next) =>
            setActiveFilter(next === activeFilter ? 'all' : next)
          }
        />
      </header>

      {/* ===================== CONTROLS BAR (Sort & View Mode) ===================== */}
      <div className="flex items-center justify-between py-3 px-1 text-caption select-none">
        <SortMenu
          options={SORT_OPTIONS}
          value={activeSort}
          onChange={setActiveSort}
          direction={sortDir}
          onDirectionChange={setSortDir}
        />

        {/* View Mode Switcher */}
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          {viewMode === 'list' ? (
            <GridIconSVG className="w-5 h-5" />
          ) : (
            <ListIconSVG className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* ===================== LIBRARY CONTENT STREAM ===================== */}
      {isLoading && !payload ? (
        // Loading Skeleton
        <div className="space-y-2 mt-2">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-2 rounded-xl bg-card/40 animate-pulse border border-border/30"
            >
              <div className="w-14 h-14 bg-border/50 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-border/60 rounded-control w-2/5" />
                <div className="h-3 bg-border/40 rounded-control w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        // Error state
        <div className="p-8 text-center bg-card border border-border rounded-xl my-6">
          <p className="text-destructive font-mono text-caption mb-3">{error}</p>
          <button
            type="button"
            onClick={() => fetchLibrary(true)}
            className="px-4 py-2 bg-primary text-background font-eyebrow text-caption uppercase tracking-wider font-semibold rounded-control hover:opacity-90 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredAndSortedItems.length === 0 ? (
        // Empty State
        <div className="py-16 text-center select-none">
          <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-3 text-muted-foreground">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          {searchQuery ? (
            <>
              <p className="font-semibold text-body text-foreground">
                No results found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-caption text-muted-foreground mt-1">
                Please check the spelling or clear your search query.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-1.5 text-caption border border-border rounded-full text-foreground hover:bg-muted"
              >
                Clear search
              </button>
            </>
          ) : activeFilter !== 'all' ? (
            <>
              <p className="font-semibold text-body text-foreground">
                No items in this category
              </p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="mt-4 px-4 py-1.5 text-caption border border-border rounded-full text-foreground hover:bg-muted"
              >
                Show all items
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold text-body text-foreground">
                Your library is empty
              </p>
              <p className="text-caption text-muted-foreground mt-1">
                Create a playlist, like songs, or follow artists to start
                building your collection.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
                <button
                  type="button"
                  onClick={() => openCreatePlaylistModal()}
                  className="px-5 py-2 rounded-full bg-primary text-background font-mono text-caption font-semibold hover:opacity-90 transition-opacity"
                >
                  Create Playlist
                </button>
                <Link
                  to="/"
                  className="px-5 py-2 rounded-full border border-border text-foreground hover:bg-muted font-mono text-caption transition-colors"
                >
                  Browse Catalog
                </Link>
              </div>
            </>
          )}
        </div>
      ) : viewMode === 'list' ? (
        // List View (Swipe-right to pin/unpin)
        <div className="space-y-1">
          {filteredAndSortedItems.map((item) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              viewMode="list"
              onShowToast={showToast}
            />
          ))}
        </div>
      ) : (
        // Grid View (Tiled cards, no pin/unpin/share options)
        <MediaGrid maxColumns={6}>
          {filteredAndSortedItems.map((item) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              viewMode="grid"
              onShowToast={showToast}
            />
          ))}
        </MediaGrid>
      )}

      {/* ===================== FLOATING TOAST ===================== */}
      {toastMessage && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] sm:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-caption px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
