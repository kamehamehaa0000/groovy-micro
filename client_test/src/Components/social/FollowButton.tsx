import { cn } from '../ui/cn'
import { Button } from '../ui/Button'
import type { RelationshipStatus } from '../../lib/social.api'

export type { RelationshipStatus }

export interface FollowButtonProps {
  relationship: RelationshipStatus
  isPrivateAccount?: boolean
  isActing?: boolean
  onFollow: () => void
  onAccept?: () => void
  onDecline?: () => void
  className?: string
  /** The label for the plain follow action. */
  followLabel?: string
}

/**
 * The follow action, in every state it can be in.
 *
 * The page used to spell out the button in five places — the header, the
 * locked library, the follow requests — and each copy drifted: one showed
 * "Unfollow" only on hover (unreachable on a phone), another said "Follow to
 * Unlock", another said "Request Follow".
 *
 * Now the state decides the label, the style and the action. The destructive
 * action is always visible on a pointer device, and on a touch device the
 * button says what it will do instead of hiding it behind a hover.
 */
export function FollowButton({
  relationship,
  isPrivateAccount = false,
  isActing = false,
  onFollow,
  onAccept,
  onDecline,
  className,
  followLabel,
}: FollowButtonProps) {
  if (relationship === 'PENDING_RECEIVED') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Button
          variant="primary"
          size="md"
          disabled={isActing}
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={isActing}
          onClick={onDecline}
        >
          Decline
        </Button>
      </div>
    )
  }

  if (relationship === 'PENDING_SENT') {
    return (
      <Button
        variant="outline"
        size="md"
        disabled={isActing}
        onClick={onFollow}
        className={cn('hover:border-destructive hover:text-destructive', className)}
        title="Cancel the follow request"
      >
        <span className="sm:hidden">Requested</span>
        <span className="hidden sm:inline">Cancel Request</span>
      </Button>
    )
  }

  if (relationship === 'FOLLOWING' || relationship === 'FRIENDS') {
    return (
      <Button
        variant="outline"
        size="md"
        disabled={isActing}
        onClick={onFollow}
        className={cn('hover:border-destructive hover:text-destructive', className)}
        title="Unfollow"
      >
        <span className="sm:hidden">
          {relationship === 'FRIENDS' ? 'Friends' : 'Following'}
        </span>
        <span className="hidden sm:inline">
          {relationship === 'FRIENDS' ? 'Friends' : 'Following'} · Unfollow
        </span>
      </Button>
    )
  }

  return (
    <Button
      variant="primary"
      size="md"
      disabled={isActing}
      onClick={onFollow}
      className={className}
    >
      {followLabel ?? (isPrivateAccount ? 'Request Follow' : 'Follow')}
    </Button>
  )
}
