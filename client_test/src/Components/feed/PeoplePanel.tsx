import { Link } from '@tanstack/react-router'
import { Avatar, Button, Input } from '../../Components/ui'
import { SearchIconSVG } from '../Icons'
import type { RelationshipStatus, UserSummary } from '../../lib/social.api'

interface PeoplePanelProps {
  users: UserSummary[]
  query: string
  onQueryChange: (value: string) => void
  isLoading: boolean
  isFetching: boolean
  actingUserId: string | null
  onToggleFollow: (user: UserSummary) => void
  onAcceptRequest?: (userId: string) => void
  limit?: number
  size?: 'sm' | 'md'
  error?: string | null
  actionError?: string | null
}

function relationLabel(relationship: RelationshipStatus): string {
  switch (relationship) {
    case 'FRIENDS':
      return 'Mutual friend'
    case 'FOLLOWING':
      return 'Following'
    case 'PENDING_SENT':
      return 'Request sent'
    case 'PENDING_RECEIVED':
      return 'Requested you'
    default:
      return ''
  }
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function PersonRow({
  user,
  isActing,
  size,
  onToggleFollow,
  onAcceptRequest,
}: {
  user: UserSummary
  isActing: boolean
  size: 'sm' | 'md'
  onToggleFollow: (user: UserSummary) => void
  onAcceptRequest?: (userId: string) => void
}) {
  const isFollowed =
    user.relationship === 'FRIENDS' || user.relationship === 'FOLLOWING'
  const isPending = user.relationship === 'PENDING_SENT'
  const isRequested = user.relationship === 'PENDING_RECEIVED'

  const label = isRequested
    ? 'Accept'
    : isFollowed
      ? 'Following'
      : isPending
        ? 'Requested'
        : user.isPrivateAccount
          ? 'Request'
          : 'Follow'

  const handleClick = () => {
    if (isRequested) {
      onAcceptRequest?.(user.id)
      return
    }
    onToggleFollow(user)
  }

  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <Link
        to="/users/$id"
        params={{ id: user.id }}
        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
      </Link>

      <Link
        to="/users/$id"
        params={{ id: user.id }}
        className="min-w-0 flex-1 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="block truncate text-caption font-semibold text-foreground">
          {user.displayName}
        </span>
        <span className="block truncate font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
          {relationLabel(user.relationship) ||
            (user.isPrivateAccount ? 'Private account' : 'Groovy member')}
        </span>
      </Link>

      {user.relationship === 'SELF' ? null : (
        <Button
          size={size}
          variant={
            isRequested
              ? 'primary'
              : isFollowed || isPending
                ? 'outline'
                : 'primary'
          }
          disabled={isActing}
          onClick={handleClick}
          aria-label={
            isRequested
              ? `Accept follow request from ${user.displayName}`
              : isFollowed
                ? `Unfollow ${user.displayName}`
                : isPending
                  ? `Cancel follow request to ${user.displayName}`
                  : `Follow ${user.displayName}`
          }
          title={
            isFollowed
              ? 'Unfollow'
              : isPending
                ? 'Cancel request'
                : undefined
          }
        >
          {label}
        </Button>
      )}
    </div>
  )
}

export function PeoplePanel({
  users,
  query,
  onQueryChange,
  isLoading,
  isFetching,
  actingUserId,
  onToggleFollow,
  onAcceptRequest,
  limit = 8,
  size = 'sm',
  error,
  actionError,
}: PeoplePanelProps) {
  const visibleUsers = users.slice(0, limit)

  return (
    <div>
      <div className="relative">
        <SearchIconSVG className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          autoComplete="off"
          className="pl-9 pr-9"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            title="Clear search"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-caption text-muted-foreground">
          {error}
        </p>
      ) : isLoading ? (
        <div className="mt-2 divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2.5 py-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-28 animate-pulse rounded-full bg-muted" />
                <div className="h-2 w-20 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleUsers.length === 0 ? (
        <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
          {query
            ? `No people found for “${query}”.`
            : 'No people to suggest right now.'}
        </p>
      ) : (
        <div
          className={`mt-1 divide-y divide-border/60 transition-opacity ${
            isFetching ? 'opacity-60' : 'opacity-100'
          }`}
        >
          {visibleUsers.map((user) => (
            <PersonRow
              key={user.id}
              user={user}
              isActing={actingUserId === user.id}
              size={size}
              onToggleFollow={onToggleFollow}
              onAcceptRequest={onAcceptRequest}
            />
          ))}
        </div>
      )}

      {actionError ? (
        <p role="alert" className="mt-2 text-caption text-destructive">
          {actionError}
        </p>
      ) : null}
    </div>
  )
}
