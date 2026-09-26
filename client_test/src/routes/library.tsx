import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
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
import { LibraryItemCard } from '../components/library/LibraryItemCard'
import { LibrarySortSheet } from '../components/library/LibrarySortSheet'
import { GridIconSVG, ListIconSVG, SortIconSVG } from '../components/icons'

export const Route = createFileRoute('/library')({
  component: LibraryPageComponent,
})

function LibraryPageComponent() {
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore(
    (s) => s.openModal,
  )

  const {
    viewMode,
    activeSort,
    activeFilter,
    searchQuery,
    payload,
    isLoading,
    error,
    setViewMode,
    setActiveSort,
    setActiveFilter,
    setSearchQuery,
    fetchLibrary,
  } = useLibraryStore()

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr))
    }, 2800)
  }

  // Fetch library data on mount or authentication change
  useEffect(() => {
    if (isAuthenticated) {
      fetchLibrary()
    }
  }, [isAuthenticated, fetchLibrary])

  // Focus search input when toggled open
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

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

    // Sort Regular items based on activeSort
    regularItems.sort((a, b) => {
      if (activeSort === 'alphabetical') {
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: 'base',
        })
      }
      if (activeSort === 'creator') {
        const creatorCompare = a.creatorOrArtistName.localeCompare(
          b.creatorOrArtistName,
          undefined,
          { sensitivity: 'base' },
        )
        if (creatorCompare !== 0) return creatorCompare
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: 'base',
        })
      }
      // Default: 'recent' (addedAt descending)
      const aTime = new Date(a.addedAt).getTime()
      const bTime = new Date(b.addedAt).getTime()
      return bTime - aTime
    })

    return [...pinnedItems, ...regularItems]
  }, [allItems, activeFilter, searchQuery, activeSort])

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

  const sortLabelMap: Record<LibrarySortType, string> = {
    recent: 'Recently added',
    alphabetical: 'Alphabetical',
    creator: 'Creator / Artist',
  }

  // If user is not authenticated, show Spotify-style guest promo
  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 sm:py-24 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-panel border border-line flex items-center justify-center mx-auto mb-6 text-blue shadow-md">
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
        <h1 className="font-serif italic text-3xl sm:text-4xl text-ink font-bold mb-3 tracking-tight">
          Your Library, Amplified
        </h1>
        <p className="text-ink-soft text-sm max-w-md mx-auto mb-8 leading-relaxed">
          Log in or create a free account to pin your favorite playlists, save
          albums, follow artists, and unlock your private Personal Collection
          vault.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal()}
          className="font-mono text-xs uppercase tracking-widest font-semibold px-8 py-3.5 bg-blue text-canvas rounded-full shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          Sign in to Groovy
        </button>
      </div>
    )
  }

  const isSearchActive = isSearchOpen || searchQuery.trim().length > 0

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-6 pt-2 pb-24 md:pb-16 select-none">
      {/* ===================== STICKY APP HEADER WITH PILLS ===================== */}
      <header className="sticky top-12 z-30 bg-canvas backdrop:backdrop-blur-2xl pt-2.5 pb-2.5 transition-colors">
        {/* Horizontal Scrollable Filter Pills + Search Button */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-0.5 select-none -mx-1">
          {/* Quick Search Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => !prev)
              if (isSearchOpen && searchQuery) {
                setSearchQuery('')
              }
            }}
            aria-label="Search in library"
            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 ${
              isSearchActive
                ? 'bg-ink text-canvas shadow-xs'
                : 'bg-panel border border-line text-ink-soft hover:text-ink hover:bg-canvas-soft'
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* Active Filter Clear Chip (✕) */}
          {activeFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              aria-label="Clear active filter"
              className="shrink-0 w-7 h-7 rounded-full bg-canvas border border-line flex items-center justify-center text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors text-xs font-bold"
            >
              ✕
            </button>
          )}

          {/* Category Filter Pills */}
          {filterPills.map((pill) => {
            const isSelected = activeFilter === pill.key
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setActiveFilter(isSelected ? 'all' : pill.key)}
                className={`shrink-0 px-3.5 py-1 rounded-full text-xs transition-all duration-150 font-medium ${
                  isSelected
                    ? 'bg-ink text-canvas shadow-xs font-semibold'
                    : 'bg-panel border border-line text-ink hover:bg-canvas-soft'
                }`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {/* Expandable Search Input */}
        {isSearchOpen && (
          <div className="mt-2.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in Your Library"
                className="w-full bg-canvas border border-line rounded-lg pl-8 pr-8 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:outline-none focus:border-blue transition-colors shadow-xs"
              />
              <svg
                className="w-3.5 h-3.5 text-ink-soft absolute left-2.5 top-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-ink-soft hover:text-ink text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false)
                setSearchQuery('')
              }}
              className="text-xs text-ink-soft hover:text-ink px-1.5 py-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </header>

      {/* ===================== CONTROLS BAR (Sort & View Mode) ===================== */}
      <div className="flex items-center justify-between py-3 px-1 text-xs select-none">
        {/* Sort trigger button */}
        <button
          type="button"
          onClick={() => setIsSortSheetOpen(true)}
          className="flex items-center gap-1.5 text-ink font-medium hover:text-blue transition-colors group"
        >
          <SortIconSVG className="w-3.5 h-3.5 text-ink-soft group-hover:text-blue" />
          <span>{sortLabelMap[activeSort]}</span>
        </button>

        {/* View Mode Switcher */}
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
          className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors"
        >
          {viewMode === 'list' ? (
            <GridIconSVG className="w-4 h-4" />
          ) : (
            <ListIconSVG className="w-4 h-4" />
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
              className="flex items-center gap-3 p-2 rounded-xl bg-panel/40 animate-pulse border border-line/30"
            >
              <div className="w-14 h-14 bg-line/50 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-line/60 rounded w-2/5" />
                <div className="h-3 bg-line/40 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        // Error state
        <div className="p-8 text-center bg-panel border border-line rounded-xl my-6">
          <p className="text-red-500 font-mono text-xs mb-3">{error}</p>
          <button
            type="button"
            onClick={() => fetchLibrary(true)}
            className="px-4 py-2 bg-blue text-canvas font-mono text-xs uppercase tracking-wider font-semibold rounded hover:opacity-90 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredAndSortedItems.length === 0 ? (
        // Empty State
        <div className="py-16 text-center select-none">
          <div className="w-12 h-12 rounded-full bg-canvas-soft border border-line flex items-center justify-center mx-auto mb-3 text-ink-soft">
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
              <p className="font-semibold text-sm text-ink">
                No results found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-xs text-ink-soft mt-1">
                Please check the spelling or clear your search query.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-1.5 text-xs border border-line rounded-full text-ink hover:bg-canvas-soft"
              >
                Clear search
              </button>
            </>
          ) : activeFilter !== 'all' ? (
            <>
              <p className="font-semibold text-sm text-ink">
                No items in this category
              </p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="mt-4 px-4 py-1.5 text-xs border border-line rounded-full text-ink hover:bg-canvas-soft"
              >
                Show all items
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold text-sm text-ink">
                Your library is empty
              </p>
              <p className="text-xs text-ink-soft mt-1">
                Create a playlist, like songs, or follow artists to start
                building your collection.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
                <button
                  type="button"
                  onClick={() => openCreatePlaylistModal()}
                  className="px-5 py-2 rounded-full bg-blue text-canvas font-mono text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Create Playlist
                </button>
                <Link
                  to="/"
                  className="px-5 py-2 rounded-full border border-line text-ink hover:bg-canvas-soft font-mono text-xs transition-colors"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
          {filteredAndSortedItems.map((item) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              viewMode="grid"
              onShowToast={showToast}
            />
          ))}
        </div>
      )}

      {/* ===================== SORT SHEET MODAL ===================== */}
      <LibrarySortSheet
        isOpen={isSortSheetOpen}
        activeSort={activeSort}
        onSelectSort={(sort) => setActiveSort(sort)}
        onClose={() => setIsSortSheetOpen(false)}
      />

      {/* ===================== FLOATING TOAST ===================== */}
      {toastMessage && (
        <div className="fixed bottom-20 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-ink text-canvas text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
