import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { artistsApi } from '../lib/artists.api'
import type { ArtistSummary } from '../types/artist'
import { SearchIconSVG } from '../components/icons'
import { useAuthStore } from '../stores/auth.store'
import { useFollowsStore } from '../stores/follows.store'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { Button, IconButton, Input } from '../Components/ui'
import { ArtistTile } from '../Components/artists/ArtistTile'
import {
  ArtistEmptyPanel,
  ArtistGridSkeleton,
} from '../Components/artists/ArtistDirectoryStates'
import { cn } from '../Components/ui/cn'

const PAGE_SIZE = 24
const SCOPES = ['ALL', 'GLOBAL', 'PERSONAL'] as const
const SORTS = ['listeners', 'followers', 'name', 'recent'] as const

type ArtistScope = (typeof SCOPES)[number]
type ArtistSort = (typeof SORTS)[number]

interface ArtistsSearchParams {
  q?: string
  scope?: ArtistScope
  /** `order` avoids colliding with the playlists directory's `sort` param. */
  order?: ArtistSort
}

const SCOPE_OPTIONS: Array<{ value: ArtistScope; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'GLOBAL', label: 'Groovy' },
  { value: 'PERSONAL', label: 'Personal' },
]

export const Route = createFileRoute('/artists/')({
  component: ArtistsDirectoryComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): ArtistsSearchParams => {
    const rawScope = typeof search.scope === 'string' ? search.scope : ''
    const rawSort = typeof search.order === 'string' ? search.order : ''

    return {
      q: typeof search.q === 'string' ? search.q : undefined,
      scope: SCOPES.includes(rawScope as ArtistScope)
        ? (rawScope as ArtistScope)
        : 'ALL',
      order: SORTS.includes(rawSort as ArtistSort)
        ? (rawSort as ArtistSort)
        : 'listeners',
    }
  },
})

function ArtistsDirectoryComponent() {
  const user = useAuthStore((s) => s.user)
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds)
  const hydrateArtists = useFollowsStore((s) => s.hydrateArtists)
  const searchParams = Route.useSearch()
  const navigate = useNavigate()

  const scope = searchParams.scope ?? 'ALL'
  const sort = searchParams.order ?? 'listeners'
  const [query, setQuery] = useState(searchParams.q ?? '')
  const lastWrittenQuery = useRef(searchParams.q ?? '')
  const debouncedQuery = useDebouncedValue(query, 300).trim()

  // Keep the input in sync when the URL changes via history navigation, but
  // avoid overwriting in-flight typing with a value we just wrote ourselves.
  useEffect(() => {
    const urlQuery = searchParams.q ?? ''
    if (urlQuery !== lastWrittenQuery.current) {
      lastWrittenQuery.current = urlQuery
      setQuery(urlQuery)
    }
  }, [searchParams.q])

  const artistsQuery = useInfiniteQuery({
    queryKey: [
      'artists',
      'directory',
      user?.id ?? null,
      scope,
      sort,
      debouncedQuery,
    ],
    queryFn: ({ pageParam, signal }) =>
      artistsApi.searchArtists(
        {
          search: debouncedQuery || undefined,
          scope,
          sort,
          page: pageParam,
          limit: PAGE_SIZE,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: 60_000,
    // Keep the previous grid while refining a search. Scope/sort changes and
    // account switches get a fresh skeleton so stale rows are never implied.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === (user?.id ?? null) &&
      previousQuery?.queryKey[3] === scope &&
      previousQuery?.queryKey[4] === sort
        ? previousData
        : undefined,
  })

  const artists = useMemo(() => {
    const seen = new Set<string>()
    const result: ArtistSummary[] = []

    for (const page of artistsQuery.data?.pages ?? []) {
      for (const artist of page.data) {
        if (seen.has(artist.id)) continue
        seen.add(artist.id)
        result.push(artist)
      }
    }

    return result
  }, [artistsQuery.data])

  useEffect(() => {
    if (artists.length > 0) hydrateArtists(artists)
  }, [artists, hydrateArtists])

  const totalCount = artistsQuery.data?.pages[0]?.pagination.total ?? 0
  const isInitialLoading = artistsQuery.isPending
  const isRefreshing =
    artistsQuery.isFetching &&
    !artistsQuery.isPending &&
    !artistsQuery.isFetchingNextPage

  const loadMoreRef = useInfiniteScroll({
    enabled:
      artistsQuery.hasNextPage &&
      !artistsQuery.isFetching &&
      !artistsQuery.isError &&
      !artistsQuery.isPlaceholderData &&
      !artistsQuery.isFetchNextPageError,
    onLoadMore: () => void artistsQuery.fetchNextPage(),
  })

  const updateSearch = (
    patch: Partial<ArtistsSearchParams>,
    replace: boolean,
  ) => {
    navigate({
      to: '/artists',
      search: (prev) => ({ ...prev, ...patch }),
      replace,
    })
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    lastWrittenQuery.current = value
    updateSearch({ q: value || undefined }, true)
  }

  const clearQuery = () => handleQueryChange('')

  const showArtistCta = user?.role === 'LISTENER' && !user?.artistProfile

  let emptyTitle = 'No artists available yet.'
  let emptyDescription: string | undefined
  let emptyAction: ReactNode

  if (scope === 'PERSONAL' && !user) {
    emptyTitle = 'Sign in to see your personal artists.'
    emptyDescription = 'Your personal collection is private to your account.'
    emptyAction = (
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          navigate({
            to: '/login',
            search: { redirect: '/artists?scope=PERSONAL' },
          })
        }
      >
        Sign in
      </Button>
    )
  } else if (debouncedQuery) {
    emptyTitle = `No artists match “${debouncedQuery}”.`
    emptyDescription = 'Try a different name or handle.'
    emptyAction = (
      <Button variant="outline" size="sm" onClick={clearQuery}>
        Clear search
      </Button>
    )
  } else if (scope === 'PERSONAL') {
    emptyTitle = 'No personal artists yet.'
    emptyDescription =
      'Artists you add to your personal collection will appear here.'
    emptyAction = (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate({ to: '/vault' })}
      >
        Open Personal Collection
      </Button>
    )
  }

  return (
    <div>
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-eyebrow text-eyebrow font-medium uppercase tracking-wider text-primary">
              Directory
            </p>
            <h1 className="mt-1 font-serif text-heading text-foreground sm:text-display">
              Artists
            </h1>
            <p className="mt-1.5 max-w-xl text-caption leading-relaxed text-muted-foreground sm:text-body">
              Browse artists on Groovy and in your personal collection.
            </p>
          </div>

          {showArtistCta && (
            <Button
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => navigate({ to: '/studio' })}
            >
              Become an artist
            </Button>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="relative w-full sm:max-w-sm">
            <SearchIconSVG className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              inputMode="search"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search artists"
              aria-label="Search artists"
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

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={scope === option.value}
                  onClick={() => updateSearch({ scope: option.value }, false)}
                  className={cn(
                    'inline-flex min-h-9 items-center justify-center rounded-full border px-2.5 py-1.5 font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors sm:px-3',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    scope === option.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative ml-auto shrink-0">
              <label htmlFor="artist-sort" className="sr-only">
                Sort artists by
              </label>
              <select
                id="artist-sort"
                value={sort}
                onChange={(event) =>
                  updateSearch(
                    { order: event.target.value as ArtistSort },
                    false,
                  )
                }
                className={cn(
                  'min-h-9 w-auto max-w-full cursor-pointer appearance-none rounded-full border border-border bg-card py-1.5 pl-2.5 pr-7 font-eyebrow text-eyebrow font-medium uppercase tracking-wider text-muted-foreground transition-colors sm:pl-3 sm:pr-8',
                  'hover:border-foreground/30 hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                )}
              >
                <option value="listeners">Listeners</option>
                <option value="followers">Followers</option>
                <option value="name">A–Z</option>
                <option value="recent">Recent</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </header>

      <section aria-busy={artistsQuery.isFetching} className="mt-5">
        <div className="mb-3 flex min-h-5 items-center justify-end">
          <span
            aria-live="polite"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground"
          >
            {isInitialLoading ? (
              <span className="sr-only">Loading artists</span>
            ) : (
              <>
                {isRefreshing && (
                  <span
                    className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/30 border-t-foreground"
                    aria-hidden="true"
                  />
                )}
                {isRefreshing && (
                  <span className="sr-only">Updating artists</span>
                )}
                <span className="font-mono tabular-nums">{totalCount}</span>{' '}
                {totalCount === 1 ? 'artist' : 'artists'}
              </>
            )}
          </span>
        </div>

        {artistsQuery.isError && artists.length > 0 && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-surface border border-destructive/30 bg-destructive-soft px-3 py-2 text-caption text-destructive"
          >
            <span>Couldn’t refresh artists.</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void artistsQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {isInitialLoading ? (
          <ArtistGridSkeleton />
        ) : artistsQuery.isError && artists.length === 0 ? (
          <ArtistEmptyPanel
            role="alert"
            title="Couldn’t load artists."
            description="Check your connection and try again."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void artistsQuery.refetch()}
              >
                Try again
              </Button>
            }
          />
        ) : artists.length === 0 ? (
          <ArtistEmptyPanel
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
              {artists.map((artist) => (
                <ArtistTile
                  key={artist.id}
                  artist={artist}
                  isFollowing={followedArtistIds.has(artist.id)}
                />
              ))}
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-5">
              <p
                aria-live="polite"
                className="text-caption text-muted-foreground"
              >
                Showing{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {artists.length}
                </span>{' '}
                of{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {totalCount}
                </span>{' '}
                {totalCount === 1 ? 'artist' : 'artists'}
              </p>

              {artistsQuery.isFetchingNextPage && (
                <span
                  role="status"
                  className="flex items-center gap-2 text-caption text-muted-foreground"
                >
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground/30 border-t-foreground"
                    aria-hidden="true"
                  />
                  Loading more artists…
                </span>
              )}

              {artistsQuery.isFetchNextPageError && (
                <p role="alert" className="text-caption text-destructive">
                  Couldn’t load more artists.{' '}
                  <button
                    type="button"
                    onClick={() => void artistsQuery.fetchNextPage()}
                    className="font-medium underline underline-offset-2 hover:text-foreground"
                  >
                    Try again
                  </button>
                </p>
              )}

              {artistsQuery.hasNextPage &&
                !artistsQuery.isFetchNextPageError && (
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
