import { Link } from '@tanstack/react-router'
import { Avatar, Button } from '../../Components/ui'
import { formatRelativeTime } from './feed.utils'
import type { IncomingFollowRequest } from '../../lib/social.api'

interface FollowRequestsProps {
  requests: IncomingFollowRequest[]
  processingId: string | null
  onAccept: (requesterId: string) => void
  onDecline: (requesterId: string) => void
  error?: string | null
}

export function FollowRequests({
  requests,
  processingId,
  onAccept,
  onDecline,
  error,
}: FollowRequestsProps) {
  if (requests.length === 0) return null

  return (
    <section aria-label="Follow requests">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-semibold text-foreground">
          Follow requests
        </h2>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-eyebrow text-eyebrow font-semibold text-primary">
          {requests.length}
        </span>
      </div>

      <div className="mt-3 divide-y divide-border/60 overflow-hidden rounded-surface border border-border bg-card">
        {requests.map((request) => {
          const isProcessing = processingId === request.requesterId

          return (
            <div
              key={request.requesterId}
              className="flex items-center gap-2.5 p-3"
            >
              <Link
                to="/users/$id"
                params={{ id: request.requesterId }}
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Avatar
                  src={request.avatarUrl}
                  name={request.displayName}
                  size="sm"
                />
              </Link>

              <div className="min-w-0 flex-1">
                <Link
                  to="/users/$id"
                  params={{ id: request.requesterId }}
                  className="block truncate text-caption font-semibold text-foreground hover:underline"
                >
                  {request.displayName}
                </Link>
                <p className="font-mono text-eyebrow text-muted-foreground">
                  {formatRelativeTime(request.createdAt)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="md"
                  variant="primary"
                  disabled={isProcessing}
                  onClick={() => onAccept(request.requesterId)}
                  aria-label={`Accept follow request from ${request.displayName}`}
                >
                  Accept
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={isProcessing}
                  onClick={() => onDecline(request.requesterId)}
                  aria-label={`Decline follow request from ${request.displayName}`}
                >
                  Decline
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
