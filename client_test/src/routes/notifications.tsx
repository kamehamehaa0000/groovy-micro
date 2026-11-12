import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useNotificationsStore } from '../stores/notifications.store'
import { socialApi } from '../lib/social.api'
import { EmptyState } from '../Components/ui/EmptyState'
import { Tabs } from '../Components/ui/Tabs'
import type {
  NotificationResponseItem,
  NotificationFilter,
} from '../lib/notifications.api'

export const Route = createFileRoute('/notifications')({
  component: NotificationsPageComponent,
})

function formatRelativeTime(dateStr: string): string {
  const timestamp = new Date(dateStr).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000))

  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function NotificationsPageComponent() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const notifications = useNotificationsStore((s) => s.notifications)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const filter = useNotificationsStore((s) => s.filter)
  const setFilter = useNotificationsStore((s) => s.setFilter)
  const isLoading = useNotificationsStore((s) => s.isLoading)
  const hasMore = useNotificationsStore((s) => s.hasMore)
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications)
  const markAsRead = useNotificationsStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead)

  const [actingNotificationId, setActingNotificationId] = useState<
    string | null
  >(null)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const [justMarkedAll, setJustMarkedAll] = useState(false)

  const hasUnread = unreadCount > 0 || notifications.some((n) => !n.isRead)

  const handleMarkAll = async () => {
    if (isMarkingAll) return
    setIsMarkingAll(true)
    try {
      await markAllAsRead()
      setJustMarkedAll(true)
      setTimeout(() => setJustMarkedAll(false), 2500)
      if (filter === 'unread') {
        fetchNotifications('unread', true)
      }
    } catch (err) {
      console.error('[NotificationsPage] Mark all read failed:', err)
    } finally {
      setIsMarkingAll(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications(filter, true)
    }
  }, [isAuthenticated, filter, fetchNotifications])

  const handleAcceptRequest = async (item: NotificationResponseItem) => {
    if (!item.actor?.id) return
    setActingNotificationId(item.id)
    try {
      await socialApi.acceptRequest(item.actor.id)
      await markAsRead(item.id)
    } catch (err) {
      console.error('[NotificationsPage] Accept request failed:', err)
    } finally {
      setActingNotificationId(null)
    }
  }

  const handleDeclineRequest = async (item: NotificationResponseItem) => {
    if (!item.actor?.id) return
    setActingNotificationId(item.id)
    try {
      await socialApi.rejectRequest(item.actor.id)
      await markAsRead(item.id)
    } catch (err) {
      console.error('[NotificationsPage] Decline request failed:', err)
    } finally {
      setActingNotificationId(null)
    }
  }

  const handleItemClick = (item: NotificationResponseItem) => {
    if (!item.isRead) {
      markAsRead(item.id)
    }

    if (item.type === 'ARTIST_RELEASE' && item.metadata?.slug) {
      navigate({
        to: '/albums/$idOrSlug',
        params: { idOrSlug: item.metadata.slug },
      })
    } else if (item.type === 'PLAYLIST_COMMENT' && item.entityId) {
      navigate({ to: '/playlists/$id', params: { id: item.entityId } })
    } else if (
      (item.type === 'FOLLOW_ACCEPTED' || item.type === 'NEW_FOLLOWER') &&
      item.actor?.id
    ) {
      navigate({ to: '/users/$id', params: { id: item.actor.id } })
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center select-none">
        <div className="border border-border bg-card p-8 sm:p-12 shadow-xs space-y-5 rounded-2xl">
          <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
            Inbox &nbsp;·&nbsp; Activity Pulse
          </div>
          <h2 className="font-serif italic text-3xl sm:text-4xl text-foreground font-normal">
            Sign In for Notifications
          </h2>
          <p className="font-sans text-caption sm:text-body text-muted-foreground leading-relaxed max-w-md mx-auto">
            Stay tuned into your social circle, live listening sessions, new
            releases from artists you follow, and comment replies.
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              search={{ redirect: '/notifications' }}
              className="inline-block bg-foreground text-background font-eyebrow text-caption uppercase tracking-wider px-6 py-3 border border-foreground hover:bg-background hover:text-foreground transition-colors rounded-xl font-semibold shadow-xs"
            >
              Sign In &rarr;
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const filterTabs: Array<{ id: NotificationFilter; label: string }> = [
    { id: 'all', label: 'All Activity' },
    { id: 'unread', label: 'Unread' },
    { id: 'social', label: 'Social' },
    { id: 'comments', label: 'Comments' },
    { id: 'releases', label: 'Releases' },
    { id: 'system', label: 'System' },
  ]

  return (
    <div className="select-none space-y-6">
      {/* ===================== PAGE HEADER ===================== */}
      <section className=" shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-1.5">
              Inbox &nbsp;·&nbsp; Activity Pulse
            </div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground font-normal leading-tight">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="bg-primary/15 text-primary text-caption font-mono px-2.5 py-0.5 rounded-full font-bold">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="font-sans text-caption sm:text-body text-muted-foreground mt-1 max-w-xl leading-relaxed">
              Real-time activity alerts, follow requests, discussion replies,
              and catalog drops.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={(!hasUnread && !justMarkedAll) || isMarkingAll}
              className={`font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border rounded-xl shadow-raised transition-all cursor-pointer flex items-center gap-2 ${
                justMarkedAll
                  ? 'border-success/40 bg-success-soft text-success font-semibold'
                  : hasUnread
                    ? 'border-foreground bg-foreground text-background hover:bg-background hover:text-foreground font-semibold'
                    : 'border-border bg-background text-muted-foreground opacity-50 cursor-not-allowed'
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>
                {isMarkingAll
                  ? 'Marking read...'
                  : justMarkedAll
                    ? 'All Marked Read ✓'
                    : 'Mark all as read'}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ===================== FILTER TABS & ACTION BAR ===================== */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <Tabs
          variant="pill"
          ariaLabel="Notification filters"
          value={filter}
          onChange={(next) => setFilter(next as NotificationFilter)}
          items={filterTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        />

        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isMarkingAll}
            className="flex shrink-0 items-center gap-1.5 rounded-control border border-border bg-card px-3 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <svg
              className="w-3 h-3 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{isMarkingAll ? 'Marking...' : 'Mark all read'}</span>
          </button>
        )}
      </div>

      {/* ===================== NOTIFICATIONS LIST ===================== */}
      {isLoading && notifications.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-5 border border-border bg-card rounded-2xl animate-pulse space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary/20" />
                <div className="h-3.5 bg-secondary/20 rounded-control w-1/4" />
              </div>
              <div className="h-4 bg-secondary/10 rounded-control w-3/4" />
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Nothing new"
          description="Follow artists and join the conversation — activity shows up here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const isActing = actingNotificationId === item.id

            return (
              <article
                key={item.id}
                className={`p-4 sm:p-5 border rounded-2xl transition-all space-y-3 shadow-raised ${
                  item.isRead
                    ? 'border-border bg-card hover:border-foreground/40'
                    : 'border-primary/40 bg-primary/5 hover:border-primary/60'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Unread Indicator */}
                    {!item.isRead && (
                      <span
                        aria-label="Unread"
                        className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 motion-safe:animate-pulse"
                      />
                    )}

                    {/* Actor Avatar */}
                    {item.actor ? (
                      <div className="w-8 h-8 rounded-full bg-secondary/20 border border-border flex items-center justify-center font-eyebrow text-caption font-semibold uppercase text-foreground overflow-hidden shrink-0">
                        {item.actor.avatarUrl ? (
                          <img
                            src={item.actor.avatarUrl}
                            alt={item.actor.displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          item.actor.displayName[0] || 'U'
                        )}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-secondary/20 border border-border flex items-center justify-center font-serif italic text-foreground text-body shrink-0">
                        ♪
                      </div>
                    )}

                    <div className="min-w-0">
                      {/* The title is the action: a real button, so the row is
                          reachable with the keyboard and announced properly. */}
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className="block w-full truncate text-left font-sans font-semibold text-body text-foreground transition-colors hover:text-primary"
                      >
                        {item.title}
                      </button>
                      {item.actor && (
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                          {item.actor.displayName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-eyebrow text-muted-foreground">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          markAsRead(item.id)
                        }}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded-md hover:bg-background transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        Read
                      </button>
                    )}
                  </div>
                </div>

                {/* Message Body */}
                <p className="font-sans text-caption sm:text-body text-muted-foreground leading-relaxed pl-5 sm:pl-6 border-l border-border/60">
                  {item.body}
                </p>

                {/* Interactive Action Buttons */}
                {item.type === 'FOLLOW_REQUEST' && !item.isRead && (
                  <div
                    className="flex items-center gap-2 pt-1 pl-5 sm:pl-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleAcceptRequest(item)}
                      className="bg-foreground text-background hover:bg-primary px-3.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold transition-colors disabled:opacity-50 cursor-pointer rounded-lg shadow-raised"
                    >
                      Accept Request
                    </button>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleDeclineRequest(item)}
                      className="border border-border hover:bg-muted text-muted-foreground hover:text-foreground px-3.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer rounded-lg"
                    >
                      Decline
                    </button>
                  </div>
                )}

                {item.type === 'ARTIST_RELEASE' && item.metadata?.slug && (
                  <div className="pt-1 pl-5 sm:pl-6">
                    <Link
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: item.metadata.slug }}
                      onClick={() => markAsRead(item.id)}
                      className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline"
                    >
                      <span>View Album Details</span>
                      <span>&rarr;</span>
                    </Link>
                  </div>
                )}

                {item.type === 'JAM_INVITE' && (
                  <div className="pt-1 pl-5 sm:pl-6">
                    <span className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-success motion-safe:animate-ping" />
                      <span>Live Session Ready</span>
                    </span>
                  </div>
                )}
              </article>
            )
          })}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => fetchNotifications(filter, false)}
                disabled={isLoading}
                className="font-eyebrow text-eyebrow uppercase tracking-wider px-6 py-3 border border-border bg-card hover:bg-muted text-foreground transition-colors rounded-xl cursor-pointer disabled:opacity-50 shadow-raised"
              >
                {isLoading
                  ? 'Loading older activity...'
                  : 'Load Older Notifications'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
