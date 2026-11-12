import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { socialApi, type FollowListItem } from '../../lib/social.api'
import { Modal } from '../ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '../ui/EmptyState'

export interface PeopleListModalProps {
  open: boolean
  onClose: () => void
  /** Whose list this is. */
  userId: string
  /** Whose list it is, for the heading. */
  displayName: string
  /** `followers` or `following`. */
  kind: 'followers' | 'following'
}

/**
 * The followers and following lists.
 *
 * The counts on a profile used to be plain text: you could read them but not
 * act on them. The server already exposes both lists, so they open in a
 * dialog now.
 */
export function PeopleListModal({
  open,
  onClose,
  userId,
  displayName,
  kind,
}: PeopleListModalProps) {
  const query = useQuery({
    queryKey: ['social', kind, userId],
    queryFn: async (): Promise<FollowListItem[]> => {
      if (kind === 'followers') {
        const res = await socialApi.getFollowers(userId)
        return res.followers
      }
      const res = await socialApi.getFollowing(userId)
      return res.following
    },
    enabled: open,
  })

  const people = query.data ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'followers' ? 'Followers' : 'Following'}
      description={`${people.length} ${kind === 'followers' ? 'person follows' : 'person is followed by'} ${displayName}`}
      size="md"
    >
      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Could not load the list"
          description={
            query.error instanceof Error
              ? query.error.message
              : 'The request could not be completed.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : people.length === 0 ? (
        <EmptyState
          title={
            kind === 'followers' ? 'No followers yet' : 'Not following anyone'
          }
          description={
            kind === 'followers'
              ? `When someone follows ${displayName}, they will show up here.`
              : `When ${displayName} follows someone, they will show up here.`
          }
        />
      ) : (
        <ul className="-mx-1 max-h-[60vh] divide-y divide-border/60 overflow-y-auto">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                to="/users/$id"
                params={{ id: person.id }}
                onClick={onClose}
                className="flex items-center gap-3 rounded-control px-1 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-serif text-lg italic text-muted-foreground">
                  {person.avatarUrl ? (
                    <img
                      src={person.avatarUrl}
                      alt={person.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    person.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-foreground">
                    {person.displayName}
                  </span>
                  <span className="block font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                    {kind === 'followers' ? 'Follower' : 'Following'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
