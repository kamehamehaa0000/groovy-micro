import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { playlistsApi } from '../lib/playlists.api'
import type { Playlist, SearchPlaylistsQuery } from '../types/playlist'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../stores/create-playlist-modal.store'
import { MediaTile } from '../components/common/MediaTile'
import { PlaylistCover } from '../components/PlaylistCover'
import {
  SearchIconSVG,
  PlusIconSVG,
  ChevronDownIconSVG,
} from '../components/icons'

interface PlaylistsSearchParams {
  search?: string
  sort?: 'popular' | 'recent' | 'tracks'
  page?: number
}

export const Route = createFileRoute('/playlists/')({
  component: PlaylistsDirectoryComponent,
  validateSearch: (search: Record<string, unknown>): PlaylistsSearchParams => {
    const rawSort = search.sort as string
    const validSorts = ['popular', 'recent', 'tracks']
    return {
      search: typeof search.search === 'string' ? search.search : undefined,
      sort: validSorts.includes(rawSort)
        ? (rawSort as PlaylistsSearchParams['sort'])
        : 'popular',
      page:
        typeof search.page === 'number' && search.page > 0 ? search.page : 1,
    }
  },
})

type SortOption = 'popular' | 'recent' | 'tracks'

const SORT_LABELS: Record<SortOption, string> = {
  popular: 'Most Saved (Popular)',
  recent: 'Recently Created',
  tracks: 'Most Tracks',
}

function PlaylistsDirectoryComponent() {
  const searchParams = Route.useSearch()
  const navigate = useNavigate()

  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore(
    (s) => s.openModal,
  )

  const [search, setSearch] = useState(searchParams.search || '')
  const [sort, setSort] = useState<SortOption>(searchParams.sort || 'popular')
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(searchParams.page || 1)
  const [hasMore, setHasMore] = useState(false)
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false)

  const limit = 24

  // Keep state synced with URL changes
  useEffect(() => {
    if (searchParams.search !== undefined && searchParams.search !== search) {
      setSearch(searchParams.search)
    }
    if (searchParams.sort && searchParams.sort !== sort) {
      setSort(searchParams.sort)
    }
  }, [searchParams.search, searchParams.sort])

  // Debounced search & fetch
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const query: SearchPlaylistsQuery = {
          search: search.trim() || undefined,
          sort,
          page: 1,
          limit,
        }
        const res = await playlistsApi.searchPlaylists(query)
        if (isMounted) {
          setPlaylists(res.data || [])
          setTotalCount(res.total ?? 0)
          setPage(1)
          setHasMore((res.data?.length || 0) < (res.total ?? 0))
        }
      } catch (err) {
        console.error('Failed to load public playlists:', err)
        if (isMounted) {
          setPlaylists([])
          setTotalCount(0)
          setHasMore(false)
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [search, sort])

  // Load more pagination
  const handleLoadMore = async () => {
    if (isLoading || !hasMore) return
    const nextPage = page + 1
    setIsLoading(true)
    try {
      const res = await playlistsApi.searchPlaylists({
        search: search.trim() || undefined,
        sort,
        page: nextPage,
        limit,
      })
      const newItems = res.data || []
      setPlaylists((prev) => [...prev, ...newItems])
      setPage(nextPage)
      setHasMore(playlists.length + newItems.length < (res.total ?? 0))
    } catch (err) {
      console.error('Failed to load additional playlists:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchChange = (val: string) => {
    setSearch(val)
    navigate({
      to: '/playlists',
      search: (prev) => ({
        ...prev,
        search: val.trim() || undefined,
        page: 1,
      }),
      replace: true,
    })
  }

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort)
    setIsSortDropdownOpen(false)
    navigate({
      to: '/playlists',
      search: (prev) => ({
        ...prev,
        sort: newSort,
        page: 1,
      }),
      replace: true,
    })
  }

  const handleCreatePlaylistClick = () => {
    if (!isAuthenticated) {
      openAuthModal({
        title: 'Sign In',
        description: 'Sign in to create, curate, and share public playlists.',
      })
      return
    }
    openCreatePlaylistModal()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 w-full select-none pb-24 md:pb-16">
      {/* Header Banner */}
      <div className="border-b border-border pb-6 sm:pb-8 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 sm:gap-6">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-widest text-primary block mb-2 font-medium">
              Groovy Playlists Index
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground tracking-tight font-semibold">
              Public Playlists
            </h1>
            <p className="font-sans text-xs sm:text-sm text-muted-foreground max-w-xl mt-2 leading-relaxed">
              Explore community-curated tracklists, thematic soundscapes, and
              public mixes crafted by listeners and creators across Groovy.
            </p>
          </div>

          {/* New Playlist CTA */}
          <button
            type="button"
            onClick={handleCreatePlaylistClick}
            className="inline-flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-wider py-2.5 px-4 bg-foreground text-background hover:opacity-90 rounded-md transition-all shadow-xs shrink-0 cursor-pointer font-medium self-start sm:self-end"
          >
            <PlusIconSVG className="w-3.5 h-3.5" />
            <span>New Playlist</span>
          </button>
        </div>

        {/* Search & Sort Controls Row */}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          {/* Search Box */}
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search public playlists..."
              className="w-full font-mono text-xs py-2.5 pl-9 pr-9 border border-border bg-card rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-2xs"
            />
            <SearchIconSVG className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-xs p-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Dropdown Menu & Count */}
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            {/* Custom Dropdown Menu for Sort */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 font-mono text-xs py-2 px-3.5 border border-border bg-card hover:bg-muted text-foreground rounded-xl focus:outline-none focus:border-foreground/60 transition-all cursor-pointer shadow-2xs font-medium"
              >
                <span className="text-muted-foreground text-[11px] uppercase tracking-wider">
                  Sort:
                </span>
                <span>{SORT_LABELS[sort]}</span>
                <ChevronDownIconSVG
                  className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${
                    isSortDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu Popup */}
              {isSortDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsSortDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-48 py-1 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-100">
                    {(Object.keys(SORT_LABELS) as SortOption[]).map(
                      (optionKey) => {
                        const isSelected = sort === optionKey
                        return (
                          <button
                            key={optionKey}
                            type="button"
                            onClick={() => handleSortChange(optionKey)}
                            className={`w-full text-left font-mono text-xs px-3.5 py-2.5 transition-colors cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-muted text-primary font-semibold'
                                : 'text-foreground hover:bg-muted/70'
                            }`}
                          >
                            <span>{SORT_LABELS[optionKey]}</span>
                            {isSelected && (
                              <span className="text-primary text-[11px]">✓</span>
                            )}
                          </button>
                        )
                      },
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Total Results Count */}
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground shrink-0 border-l border-border pl-3">
              {totalCount} {totalCount === 1 ? 'Playlist' : 'Playlists'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Playlists */}
      {isLoading && playlists.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="p-2.5 rounded-xl border border-border/40 bg-card/40 animate-pulse flex flex-col gap-2.5"
            >
              <div className="aspect-square w-full rounded-md bg-secondary/20" />
              <div className="h-3 w-3/4 bg-secondary/20 rounded" />
              <div className="h-2.5 w-1/2 bg-secondary/20 rounded" />
            </div>
          ))}
        </div>
      ) : playlists.length > 0 ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {playlists.map((playlist) => {
              const mosaicCovers =
                (playlist as any).mosaicCoverUrls || playlist.mosaicCovers

              return (
                <MediaTile
                  key={playlist.id}
                  to="/playlists/$id"
                  params={{ id: playlist.id }}
                  title={playlist.title}
                  subtitle={
                    <span className="flex items-center gap-1.5 truncate">
                      <span>{playlist.ownerDisplayName || 'Curator'}</span>
                      <span className="text-border">•</span>
                      <span>{playlist.tracksCount ?? 0} tracks</span>
                    </span>
                  }
                  imageUrl={playlist.coverImageUrl}
                  fallbackInitials="♫"
                  customCover={
                    <PlaylistCover
                      coverImageUrl={playlist.coverImageUrl}
                      mosaicCovers={mosaicCovers}
                      title={playlist.title}
                      className="w-full h-full"
                    />
                  }
                />
              )
            })}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoading}
                className="font-mono text-[11px] uppercase tracking-wider py-2.5 px-6 border border-border bg-card hover:bg-background text-foreground transition-all rounded-full shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Loading Playlists...' : 'Load More Playlists ↓'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-20 border border-border rounded-xl bg-card/40 px-4">
          <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-3 text-muted-foreground">
            <SearchIconSVG className="w-5 h-5 opacity-60" />
          </div>
          <h3 className="font-serif italic text-lg sm:text-xl font-semibold text-foreground">
            No public playlists found
          </h3>
          <p className="font-sans text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
            {search
              ? `We couldn't find any public playlists matching "${search}".`
              : 'Be the first to curate and share a public playlist with the community.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-border bg-card hover:bg-background rounded-full text-foreground transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            )}
            <button
              type="button"
              onClick={handleCreatePlaylistClick}
              className="font-mono text-xs uppercase tracking-wider px-4 py-2 bg-foreground text-background hover:opacity-90 rounded-full transition-opacity cursor-pointer font-medium"
            >
              + Create Playlist
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
