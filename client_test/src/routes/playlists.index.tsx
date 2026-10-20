import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { playlistsApi } from '../lib/playlists.api'
import type { PlaylistDirectoryItem } from '../types/playlist'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../stores/create-playlist-modal.store'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { Button, IconButton, Input } from '../components/ui'
import { cn } from '../components/ui/cn'
import { PlusIconSVG, SearchIconSVG } from '../components/icons'
import { MediaTile } from '../Components/common/MediaTile'
import { PlaylistCover } from '../Components/PlaylistCover'
import {
  PlaylistEmptyPanel,
  PlaylistGridSkeleton,
} from '../Components/playlists/PlaylistDirectoryStates'

const PAGE_SIZE = 24
const SORTS = ['popular', 'recent', 'tracks'] as const

type PlaylistSort = (typeof SORTS)[number]

interface PlaylistsSearchParams {
  search?: string
  sort?: PlaylistSort
}

const SORT_OPTIONS: Array<{ value: PlaylistSort; label: string }> = [
  { value: 'popular', label: 'Most saved' },
  { value: 'recent', label: 'Newest' },
  { value: 'tracks', label: 'Most tracks' },
]

export const Route = createFileRoute('/playlists/')({
  component: PlaylistsDirectoryComponent,
  validateSearch: (search: Record<string, unknown>): PlaylistsSearchParams => {
    const rawSort = typeof search.sort === 'string' ? search.sort : ''

    return {
      search:
        typeof search.search === 'string' && search.search
          ? search.search
          : undefined,
      sort: SORTS.includes(rawSort as PlaylistSort)
        ? (rawSort as PlaylistSort)
        : 'popular',
    }
  },
})

function PlaylistsDirectoryComponent() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore(
    (s) => s.openModal,
  )
  const searchParams = Route.useSearch()
  const navigate = useNavigate()

  const sort = searchParams.sort ?? 'popular'
  const [query, setQuery] = useState(searchParams.search ?? '')
  const lastWrittenQuery = useRef(searchParams.search ?? '')
  const debouncedSearch = useDebouncedValue(query, 300).trim()

  // Keep the input in sync when the URL changes via history navigation, but
  // avoid overwriting in-flight typing with a value we just wrote ourselves.
  useEffect(() => {
    const urlQuery = searchParams.search ?? ''
    if (urlQuery !== lastWrittenQuery.current) {
      lastWrittenQuery.current = urlQuery
      setQuery(urlQuery)
    }
  }, [searchParams.search])

  const playlistsQuery = useInfiniteQuery({
    queryKey: ['playlists', 'directory', userId, sort, debouncedSearch],
    queryFn: ({ pageParam, signal }) =>
      playlistsApi.searchPlaylists(
        {
          search: debouncedSearch || undefined,
          sort,
          page: pageParam,
          limit: PAGE_SIZE,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total
        ? lastPage.page + 1
        : undefined,
    staleTime: 60_000,
    // Keep the current grid while refining a search. Sort and account changes
    // get a fresh skeleton so stale rows are never implied.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === userId &&
      previousQuery?.queryKey[3] === sort
        ? previousData
        : undefined,
  })

  const playlists = useMemo(() => {
    const seen = new Set<string>()
    const result: PlaylistDirectoryItem[] = []

    for (const page of playlistsQuery.data?.pages ?? []) {
      for (const playlist of page.data) {
        if (seen.has(playlist.id)) continue
        seen.add(playlist.id)
        result.push(playlist)
      }
    }

    return result
  }, [playlistsQuery.data])

  const totalCount = playlistsQuery.data?.pages[0]?.total ?? 0
  const isInitialLoading = playlistsQuery.isPending
  const isRefreshing =
    playlistsQuery.isFetching &&
    !playlistsQuery.isPending &&
    !playlistsQuery.isFetchingNextPage

  const loadMoreRef = useInfiniteScroll({
    enabled:
      playlistsQuery.hasNextPage &&
      !playlistsQuery.isFetching &&
      !playlistsQuery.isError &&
      !playlistsQuery.isPlaceholderData &&
      !playlistsQuery.isFetchNextPageError,
    onLoadMore: () => void playlistsQuery.fetchNextPage(),
  })

  const updateSearch = (
    patch: Partial<PlaylistsSearchParams>,
    replace: boolean,
  ) => {
    navigate({
      to: '/playlists',
      search: (prev) => ({ ...prev, ...patch }),
      replace,
    })
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    lastWrittenQuery.current = value
    updateSearch({ search: value || undefined }, true)
  }

  const clearQuery = () => handleQueryChange('')

  const handleSortChange = (value: string) => {
    updateSearch({ sort: value as PlaylistSort }, false)
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

  let emptyTitle = 'No public playlists yet.'
  let emptyDescription =
    'Public playlists will appear here once the community starts sharing them.'
  let emptyAction: ReactNode = (
    <Button variant="outline" size="sm" onClick={handleCreatePlaylistClick}>
      Create a playlist
    </Button>
  )

  if (debouncedSearch) {
    emptyTitle = `No playlists match “${debouncedSearch}”.`
    emptyDescription = 'Try a different title or description.'
    emptyAction = (
      <Button variant="outline" size="sm" onClick={clearQuery}>
        Clear search
      </Button>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-8 sm:pt-10">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-eyebrow text-eyebrow font-medium uppercase tracking-wider text-primary">
              Directory
            </p>
            <h1 className="mt-1 font-serif text-heading text-foreground sm:text-display">
              Public Playlists
            </h1>
            <p className="mt-1.5 max-w-xl text-caption leading-relaxed text-muted-foreground sm:text-body">
              Browse public playlists curated by the Groovy community.
            </p>
          </div>

          <Button
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            onClick={handleCreatePlaylistClick}
            leftIcon={
              <PlusIconSVG className="h-3.5 w-3.5" aria-hidden="true" />
            }
          >
            New playlist
          </Button>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <SearchIconSVG className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              inputMode="search"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search public playlists"
              aria-label="Search public playlists"
              className="pl-9 pr-10"
            />
            {query && (
              <IconButton
                size="sm"
                aria-label="Clear search"
                onClick={clearQuery}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>

          <div className="relative shrink-0 self-end sm:self-auto">
            <label htmlFor="playlist-sort" className="sr-only">
              Sort playlists by
            </label>
            <select
              id="playlist-sort"
              value={sort}
              onChange={(event) => handleSortChange(event.target.value)}
              className={cn(
                'min-h-9 w-auto max-w-full cursor-pointer appearance-none rounded-full border border-border bg-card py-1.5 pl-3 pr-8 font-eyebrow text-eyebrow font-medium uppercase tracking-wider text-muted-foreground transition-colors',
                'hover:border-foreground/30 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              )}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </div>
      </header>

      <section aria-busy={playlistsQuery.isFetching} className="mt-5">
        <div className="mb-3 flex min-h-5 items-center justify-end">
          <span
            aria-live="polite"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground"
          >
            {isInitialLoading ? (
              <span className="sr-only">Loading playlists</span>
            ) : (
              <>
                {isRefreshing && (
                  <span
                    className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/30 border-t-foreground"
                    aria-hidden="true"
                  />
                )}
                {isRefreshing && (
                  <span className="sr-only">Updating playlists</span>
                )}
                <span className="font-mono tabular-nums">{totalCount}</span>{' '}
                {totalCount === 1 ? 'playlist' : 'playlists'}
              </>
            )}
          </span>
        </div>

        {playlistsQuery.isError && playlists.length > 0 && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-surface border border-destructive/30 bg-destructive-soft px-3 py-2 text-caption text-destructive"
          >
            <span>Couldn’t refresh playlists.</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void playlistsQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {isInitialLoading ? (
          <PlaylistGridSkeleton />
        ) : playlistsQuery.isError && playlists.length === 0 ? (
          <PlaylistEmptyPanel
            role="alert"
            title="Couldn’t load playlists."
            description="Check your connection and try again."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void playlistsQuery.refetch()}
              >
                Try again
              </Button>
            }
          />
        ) : playlists.length === 0 ? (
          <PlaylistEmptyPanel
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          <>
            <div
              className={cn(
                'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
                isRefreshing && 'opacity-60',
              )}
            >
              {playlists.map((playlist) => {
                return (
                  <MediaTile
                    key={playlist.id}
                    to="/playlists/$id"
                    params={{ id: playlist.id }}
                    title={playlist.title}
                    subtitle={
                      <span className="flex items-center gap-1.5 truncate">
                        <span>{playlist.ownerDisplayName || 'Curator'}</span>
                      </span>
                    }
                    imageUrl={playlist.coverImageUrl}
                    fallbackInitials="♫"
                    customCover={
                      <PlaylistCover
                        coverImageUrl={playlist.coverImageUrl}
                        mosaicCovers={playlist.mosaicCoverUrls}
                        title={playlist.title}
                        className="w-full h-full rounded-surface"
                      />
                    }
                  />
                )
              })}
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-5">
              <p
                aria-live="polite"
                className="text-caption text-muted-foreground"
              >
                Showing{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {playlists.length}
                </span>{' '}
                of{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {totalCount}
                </span>{' '}
                {totalCount === 1 ? 'playlist' : 'playlists'}
              </p>

              {playlistsQuery.isFetchingNextPage && (
                <span
                  role="status"
                  className="flex items-center gap-2 text-caption text-muted-foreground"
                >
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground/30 border-t-foreground"
                    aria-hidden="true"
                  />
                  Loading more playlists…
                </span>
              )}

              {playlistsQuery.isFetchNextPageError && (
                <div
                  role="alert"
                  className="flex items-center gap-3 text-caption text-destructive"
                >
                  <span>Couldn’t load more playlists.</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void playlistsQuery.fetchNextPage()}
                  >
                    Try again
                  </Button>
                </div>
              )}

              {playlistsQuery.hasNextPage &&
                !playlistsQuery.isFetchNextPageError && (
                  <div
                    ref={loadMoreRef}
                    aria-hidden="true"
                    className="h-px w-full"
                  />
                )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
