import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth.store'
import { playerApi } from '../lib/player.api'
import {
  socialApi,
  type FeedItem,
  type IncomingFollowRequest,
  type RelationshipStatus,
  type SocialFeedMeta,
  type UserSummary,
} from '../lib/social.api'
import { Button, IconButton, Sheet } from '../Components/ui'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { FeedRow } from '../Components/feed/FeedRow'
import { FollowRequests } from '../Components/feed/FollowRequests'
import { LiveNow } from '../Components/feed/LiveNow'
import { PeoplePanel } from '../Components/feed/PeoplePanel'
import { dayKey, dayLabel } from '../Components/feed/feed.utils'

export const Route = createFileRoute('/feed')({
  component: FeedPage,
})

type FeedFilter = 'all' | 'releases' | 'playlists' | 'friends'

const FILTERS: Array<{ value: FeedFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'releases', label: 'Releases' },
  { value: 'playlists', label: 'Playlists' },
  { value: 'friends', label: 'Following' },
]

const PAGE_SIZE = 20

function RefreshIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function UsersIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function FeedIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.5" />
    </svg>
  )
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function FeedSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading feed</span>
      <div aria-hidden="true" className="divide-y divide-border/60">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex gap-3 py-4">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="min-w-0 flex-1">
              <div className="h-2.5 w-40 animate-pulse rounded-full bg-muted" />
              <div className="mt-3 flex items-center gap-3 rounded-inset border border-border bg-card p-2">
                <div className="h-14 w-14 animate-pulse rounded-control bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-12 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
                  <div className="h-2 w-1/3 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyFeed({
  filter,
  meta,
  onFindPeople,
}: {
  filter: FeedFilter
  meta: SocialFeedMeta
  onFindPeople: () => void
}) {
  const navigate = useNavigate()
  const followsNobody = meta.followingArtists === 0 && meta.followingPeople === 0

  let title: string
  let description: string
  let primary: 'artists' | 'people'

  if (filter === 'releases') {
    primary = 'artists'
    title = meta.followingArtists === 0 ? 'No releases yet' : 'No new releases'
    description =
      meta.followingArtists === 0
        ? 'Follow artists to see their new albums and singles here.'
        : 'New albums and singles from the artists you follow will appear here.'
  } else if (filter === 'playlists') {
    primary = 'people'
    title = meta.followingPeople === 0 ? 'No playlists yet' : 'No new playlists'
    description =
      meta.followingPeople === 0
        ? 'Follow people to see the playlists they create here.'
        : 'Public playlists from the people you follow will appear here.'
  } else if (filter === 'friends') {
    primary = 'people'
    title =
      meta.followingPeople === 0
        ? 'No listening activity yet'
        : 'No new listening activity'
    description =
      meta.followingPeople === 0
        ? 'Follow people to see the tracks and playlists they save.'
        : 'Tracks and playlists from the people you follow will appear here.'
  } else if (followsNobody) {
    primary = 'artists'
    title = 'Your feed is empty'
    description =
      'Follow artists and people to see their releases, playlists and listening here.'
  } else {
    primary = meta.followingArtists === 0 ? 'people' : 'artists'
    title = 'No new activity yet'
    description =
      'New releases from artists and activity from people you follow will show up here.'
  }

  return (
    <div className="rounded-surface border border-dashed border-border px-6 py-12 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <FeedIcon />
      </div>
      <h2 className="mt-4 font-serif text-heading text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-caption leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {primary === 'artists' ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate({ to: '/artists' })}
          >
            Browse artists
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onFindPeople}>
            Find people
          </Button>
        )}
        {filter === 'all' ? (
          primary === 'artists' ? (
            <Button variant="outline" size="sm" onClick={onFindPeople}>
              Find people
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/artists' })}
            >
              Browse artists
            </Button>
          )
        ) : null}
      </div>
    </div>
  )
}

function GuestFeed() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <FeedIcon className="h-6 w-6" />
      </div>
      <h1 className="mt-5 font-serif text-display text-foreground">Your feed</h1>
      <p className="mt-2 text-body leading-relaxed text-muted-foreground">
        Sign in to follow artists and listeners, and see their latest releases,
        playlists and listening in one place.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          variant="primary"
          onClick={() =>
            navigate({ to: '/login', search: { redirect: '/feed' } })
          }
        >
          Sign in
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: '/' })}>
          Explore music
        </Button>
      </div>
    </div>
  )
}

function QuickActions({
  isRefreshing,
  onRefresh,
  onFindPeople,
}: {
  isRefreshing: boolean
  onRefresh: () => void
  onFindPeople: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <IconButton
        size="md"
        aria-label="Find people"
        title="Find people"
        onClick={onFindPeople}
        className="border border-border bg-card xl:hidden"
      >
        <UsersIcon />
      </IconButton>
      <IconButton
        size="md"
        aria-label="Refresh feed"
        title="Refresh feed"
        onClick={onRefresh}
        className="border border-border bg-card"
      >
        <RefreshIcon
          className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
        />
      </IconButton>
    </div>
  )
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: FeedFilter
  onChange: (filter: FeedFilter) => void
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 mt-5 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 xl:mt-0">
      <div
        role="tablist"
        aria-label="Filter feed"
        className="no-scrollbar flex items-center gap-1 overflow-x-auto"
      >
        {FILTERS.map((item) => {
          const isActive = filter === item.value
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.value)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isActive
                  ? 'border-foreground bg-foreground font-semibold text-background'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FeedPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState<FeedFilter>('all')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [followOverrides, setFollowOverrides] = useState<
    Record<string, RelationshipStatus>
  >({})
  const [actingUserId, setActingUserId] = useState<string | null>(null)
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null,
  )
  const [peopleActionError, setPeopleActionError] = useState<string | null>(
    null,
  )
  const [requestActionError, setRequestActionError] = useState<string | null>(
    null,
  )

  const debouncedPeopleQuery = useDebouncedValue(peopleQuery, 250)

  const feedQuery = useInfiniteQuery({
    queryKey: ['social', 'feed', currentUserId, filter],
    queryFn: ({ pageParam }) =>
      socialApi.getFeed({
        filter,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor
        ? lastPage.nextCursor
        : undefined,
    enabled: isAuthenticated,
    staleTime: 30_000,
    // Follows can happen on profile and artist pages, so revalidate whenever
    // the feed is opened instead of trusting a page cached before the follow.
    refetchOnMount: 'always',
  })

  const liveQuery = useQuery({
    queryKey: ['social', 'live', currentUserId],
    queryFn: playerApi.getFriendsActivity,
    enabled: isAuthenticated,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })

  const requestsQuery = useQuery({
    queryKey: ['social', 'requests', currentUserId],
    queryFn: socialApi.getIncomingRequests,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })

  const peopleQueryResult = useQuery({
    queryKey: ['social', 'people', currentUserId, debouncedPeopleQuery.trim()],
    queryFn: () =>
      socialApi.searchUsers(debouncedPeopleQuery.trim() || undefined, 20),
    enabled: isAuthenticated,
    staleTime: 60_000,
    // Keep results while refining a search, but never carry another account's
    // cached people into this one.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === currentUserId ? previousData : undefined,
  })

  const feedItems = useMemo(() => {
    const seen = new Set<string>()
    const items: FeedItem[] = []

    for (const page of feedQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        items.push(item)
      }
    }

    return items
  }, [feedQuery.data])

  const feedMeta: SocialFeedMeta = feedQuery.data?.pages[0]?.meta ?? {
    followingArtists: 0,
    followingPeople: 0,
  }

  const feedGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: FeedItem[] }> = []
    let current: { key: string; label: string; items: FeedItem[] } | null = null

    for (const item of feedItems) {
      const key = dayKey(item.timestamp)
      if (!current || current.key !== key) {
        current = { key, label: dayLabel(key), items: [] }
        groups.push(current)
      }
      current.items.push(item)
    }

    return groups
  }, [feedItems])

  const sentinelRef = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQuery

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const element = sentinelRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage()
      },
      { rootMargin: '400px 0px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const incomingRequests = requestsQuery.data?.requests ?? []
  const liveActivities = liveQuery.data?.activities ?? []
  const people = peopleQueryResult.data?.users ?? []

  const isRefreshing =
    feedQuery.isFetching || liveQuery.isFetching || requestsQuery.isFetching

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['social'] })
  }, [queryClient])

  const handleFilterChange = useCallback(
    (nextFilter: FeedFilter) => {
      if (nextFilter === filter) return
      setFilter(nextFilter)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [filter],
  )

  const handlePeopleQueryChange = useCallback((value: string) => {
    setPeopleQuery(value)
    setPeopleActionError(null)
  }, [])

  const removeRequestFromCache = useCallback(
    (requesterId: string) => {
      queryClient.setQueryData<{ requests: IncomingFollowRequest[] }>(
        ['social', 'requests', currentUserId],
        (previous) =>
          previous
            ? {
                requests: previous.requests.filter(
                  (request) => request.requesterId !== requesterId,
                ),
              }
            : previous,
      )
    },
    [currentUserId, queryClient],
  )

  const handleAcceptRequest = useCallback(
    async (requesterId: string) => {
      setProcessingRequestId(requesterId)
      setRequestActionError(null)
      setPeopleActionError(null)
      try {
        await socialApi.acceptRequest(requesterId)
        removeRequestFromCache(requesterId)
        // They now follow you; your relationship stays NONE until you follow back.
        setFollowOverrides((previous) => ({
          ...previous,
          [requesterId]: 'NONE',
        }))
        queryClient.invalidateQueries({ queryKey: ['social', 'live'] })
        queryClient.invalidateQueries({ queryKey: ['social', 'people'] })
      } catch (error) {
        const message = errorMessage(
          error,
          'Could not accept that request.',
        )
        setRequestActionError(message)
        setPeopleActionError(message)
      } finally {
        setProcessingRequestId(null)
      }
    },
    [queryClient, removeRequestFromCache],
  )

  const handleDeclineRequest = useCallback(
    async (requesterId: string) => {
      setProcessingRequestId(requesterId)
      setRequestActionError(null)
      setPeopleActionError(null)
      try {
        await socialApi.rejectRequest(requesterId)
        removeRequestFromCache(requesterId)
        setFollowOverrides((previous) => ({
          ...previous,
          [requesterId]: 'NONE',
        }))
      } catch (error) {
        const message = errorMessage(
          error,
          'Could not decline that request.',
        )
        setRequestActionError(message)
        setPeopleActionError(message)
      } finally {
        setProcessingRequestId(null)
      }
    },
    [removeRequestFromCache],
  )

  const handleToggleFollow = useCallback(
    async (target: UserSummary) => {
      const relationship = followOverrides[target.id] ?? target.relationship
      setActingUserId(target.id)
      setPeopleActionError(null)

      try {
        if (
          relationship === 'FOLLOWING' ||
          relationship === 'FRIENDS' ||
          relationship === 'PENDING_SENT'
        ) {
          await socialApi.unfollowUser(target.id)
          setFollowOverrides((previous) => ({
            ...previous,
            [target.id]: 'NONE',
          }))
        } else {
          const response = await socialApi.followUser(target.id)
          const nextRelationship: RelationshipStatus =
            response.status === 'PENDING'
              ? 'PENDING_SENT'
              : response.isMutualFriend
                ? 'FRIENDS'
                : 'FOLLOWING'
          setFollowOverrides((previous) => ({
            ...previous,
            [target.id]: nextRelationship,
          }))
        }
        queryClient.invalidateQueries({ queryKey: ['social', 'live'] })
        queryClient.invalidateQueries({ queryKey: ['social', 'feed'] })
      } catch (error) {
        setPeopleActionError(
          errorMessage(error, 'Could not update that follow.'),
        )
      } finally {
        setActingUserId(null)
      }
    },
    [followOverrides, queryClient],
  )

  if (!isAuthenticated) {
    return <GuestFeed />
  }

  const peopleWithOverrides = people.map((user) => ({
    ...user,
    relationship: followOverrides[user.id] ?? user.relationship,
  }))

  const requestSection = requestsQuery.isError ? (
    <p className="text-caption text-muted-foreground">
      Could not load requests.{' '}
      <button
        type="button"
        onClick={() => requestsQuery.refetch()}
        className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
      >
        Try again
      </button>
    </p>
  ) : (
    <FollowRequests
      requests={incomingRequests}
      processingId={processingRequestId}
      onAccept={handleAcceptRequest}
      onDecline={handleDeclineRequest}
      error={requestActionError}
    />
  )

  const peoplePanel = (
    <PeoplePanel
      users={peopleWithOverrides}
      query={peopleQuery}
      onQueryChange={handlePeopleQueryChange}
      isLoading={peopleQueryResult.isLoading}
      isFetching={peopleQueryResult.isFetching}
      actingUserId={actingUserId}
      onToggleFollow={handleToggleFollow}
      onAcceptRequest={handleAcceptRequest}
      limit={6}
      error={
        peopleQueryResult.isError
          ? 'Could not load people. Check your connection and try again.'
          : null
      }
      actionError={peopleActionError}
    />
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-heading text-foreground sm:text-display">
            Feed
          </h1>
          <p className="mt-1 max-w-lg text-body leading-relaxed text-muted-foreground">
            Releases, playlists and listening from artists and people you
            follow.
          </p>
        </div>
        <QuickActions
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          onFindPeople={() => setPeopleOpen(true)}
        />
      </header>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10">
        <div className="min-w-0">
          <div className="space-y-5 xl:hidden">
            {requestSection}
            <LiveNow
              activities={liveActivities}
              isLoading={liveQuery.isLoading}
              layout="strip"
            />
          </div>

          <FilterBar filter={filter} onChange={handleFilterChange} />

          <section aria-label="Activity feed" className="pt-1">
            {feedQuery.isLoading ? (
              <FeedSkeleton />
            ) : feedQuery.isError ? (
              <div className="mt-6 rounded-surface border border-border bg-card px-6 py-10 text-center">
                <h2 className="font-serif text-heading text-foreground">
                  Could not load your feed
                </h2>
                <p className="mx-auto mt-1 max-w-sm text-caption leading-relaxed text-muted-foreground">
                  Check your connection and try again.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => feedQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : feedGroups.length === 0 ? (
              <div className="mt-4">
                <EmptyFeed
                  filter={filter}
                  meta={feedMeta}
                  onFindPeople={() => setPeopleOpen(true)}
                />
              </div>
            ) : (
              <div>
                {feedGroups.map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-3 pb-1 pt-4 first:pt-2">
                      <h2 className="font-eyebrow text-eyebrow font-medium uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </h2>
                      <div className="h-px flex-1 bg-border/60" />
                    </div>
                    <div className="divide-y divide-border/60">
                      {group.items.map((item) => (
                        <FeedRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                ))}

                <div ref={sentinelRef} className="h-px" aria-hidden="true" />

                {isFetchingNextPage ? (
                  <div
                    role="status"
                    className="flex items-center justify-center py-6"
                  >
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
                    <span className="sr-only">Loading more activity</span>
                  </div>
                ) : !hasNextPage ? (
                  <p className="py-8 text-center text-caption text-muted-foreground">
                    You&rsquo;re all caught up.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <aside className="scrollbar-none hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100dvh-6rem)] xl:space-y-6 xl:overflow-y-auto xl:pr-1">
          {requestSection}

          <LiveNow
            activities={liveActivities}
            isLoading={liveQuery.isLoading}
            layout="panel"
          />

          <section aria-label="Find people">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-title font-semibold text-foreground">
                Find people
              </h2>
              <span className="flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                <UsersIcon className="h-3.5 w-3.5" />
                Community
              </span>
            </div>
            <div className="mt-3">{peoplePanel}</div>
          </section>
        </aside>
      </div>

      <Sheet
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        title="Find people"
        description="Follow listeners and artists to shape your feed."
        placement="bottom"
        className="min-h-[70dvh]"
      >
        <div className="px-4 pb-8 pt-4">
          <PeoplePanel
            users={peopleWithOverrides}
            query={peopleQuery}
            onQueryChange={handlePeopleQueryChange}
            isLoading={peopleQueryResult.isLoading}
            isFetching={peopleQueryResult.isFetching}
            actingUserId={actingUserId}
            onToggleFollow={handleToggleFollow}
            onAcceptRequest={handleAcceptRequest}
            limit={20}
            size="md"
            error={
              peopleQueryResult.isError
                ? 'Could not load people. Check your connection and try again.'
                : null
            }
            actionError={peopleActionError}
          />
        </div>
      </Sheet>
    </div>
  )
}
