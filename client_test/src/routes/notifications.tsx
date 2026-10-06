import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useNotificationsStore } from '../stores/notifications.store'
import { socialApi } from '../lib/social.api'
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
      <div className="max-w-xl mx-auto px-4 py-16 text-center select-none">
        <div className="border border-line bg-panel p-8 sm:p-12 shadow-xs space-y-5 rounded-2xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue">
            Inbox &nbsp;·&nbsp; Activity Pulse
          </div>
          <h2 className="font-serif italic text-3xl sm:text-4xl text-ink font-normal">
            Sign In for Notifications
          </h2>
          <p className="font-sans text-xs sm:text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
            Stay tuned into your social circle, live listening sessions, new
            releases from artists you follow, and comment replies.
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-block bg-ink text-canvas font-mono text-xs uppercase tracking-[0.14em] px-6 py-3 border border-ink hover:bg-canvas hover:text-ink transition-colors rounded-xl font-semibold shadow-xs"
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 select-none space-y-6">
      {/* ===================== PAGE HEADER ===================== */}
      <section className=" shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue mb-1.5">
              Inbox &nbsp;·&nbsp; Activity Pulse
            </div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif italic text-3xl sm:text-4xl text-ink font-normal leading-tight">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="bg-blue/15 text-blue text-xs font-mono px-2.5 py-0.5 rounded-full font-bold">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="font-sans text-xs sm:text-sm text-ink-soft mt-1 max-w-xl leading-relaxed">
              Real-time activity alerts, follow requests, discussion replies,
              and catalog drops.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={(!hasUnread && !justMarkedAll) || isMarkingAll}
              className={`font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-2 ${
                justMarkedAll
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                  : hasUnread
                    ? 'border-ink bg-ink text-canvas hover:bg-canvas hover:text-ink font-semibold'
                    : 'border-line bg-canvas text-ink-soft opacity-50 cursor-not-allowed'
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

      {/* ===================== FILTER PILLS & ACTION BAR ===================== */}
      <div className="flex items-center justify-between border-b border-line pb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`font-mono text-[10.5px] rounded-md uppercase tracking-[0.14em] px-3.5 py-1.5 transition-all cursor-pointer shrink-0 ${
                filter === tab.id
                  ? 'bg-ink text-canvas font-semibold shadow-xs'
                  : 'bg-panel text-ink-soft hover:text-ink border border-line'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isMarkingAll}
            className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-panel hover:bg-canvas-deep text-ink-soft hover:text-ink transition-colors cursor-pointer rounded-lg flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            <svg
              className="w-3 h-3 text-blue"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
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
              className="p-5 border border-line bg-panel rounded-2xl animate-pulse space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-stone/20" />
                <div className="h-3.5 bg-stone/20 rounded w-1/4" />
              </div>
              <div className="h-4 bg-stone/10 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="border border-dashed border-line p-12 text-center rounded-2xl space-y-3">
          <div className="font-serif italic text-2xl text-ink"></div>
          <p className="font-sans text-xs sm:text-sm text-ink-soft max-w-md mx-auto leading-relaxed">
            No notifications at the moment.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const isActing = actingNotificationId === item.id

            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`p-4 sm:p-5 border rounded-2xl transition-all cursor-pointer space-y-3 shadow-2xs ${
                  item.isRead
                    ? 'border-line bg-panel hover:border-ink/40'
                    : 'border-blue/40 bg-blue/5 hover:border-blue/60'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Unread Indicator */}
                    {!item.isRead && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue shrink-0 animate-pulse" />
                    )}

                    {/* Actor Avatar */}
                    {item.actor ? (
                      <div className="w-8 h-8 rounded-full bg-stone/20 border border-line flex items-center justify-center font-mono text-xs font-semibold uppercase text-ink overflow-hidden shrink-0">
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
                      <div className="w-8 h-8 rounded-full bg-stone/20 border border-line flex items-center justify-center font-serif italic text-ink text-sm shrink-0">
                        ♪
                      </div>
                    )}

                    <div className="min-w-0">
                      <span className="font-serif italic text-base text-ink font-medium block truncate">
                        {item.title}
                      </span>
                      {item.actor && (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                          {item.actor.displayName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[10px] text-ink-soft">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          markAsRead(item.id)
                        }}
                        className="font-mono text-[9px] uppercase tracking-wider text-ink-soft hover:text-ink px-2 py-1 border border-line rounded-md hover:bg-canvas transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        Read
                      </button>
                    )}
                  </div>
                </div>

                {/* Message Body */}
                <p className="font-sans text-xs sm:text-sm text-ink-soft leading-relaxed pl-5 sm:pl-6 border-l border-line/60">
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
                      className="bg-ink text-canvas hover:bg-blue px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider font-semibold transition-colors disabled:opacity-50 cursor-pointer rounded-lg shadow-2xs"
                    >
                      Accept Request
                    </button>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleDeclineRequest(item)}
                      className="border border-line hover:bg-canvas-deep text-ink-soft hover:text-ink px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer rounded-lg"
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
                      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-blue hover:underline"
                    >
                      <span>View Album Details</span>
                      <span>&rarr;</span>
                    </Link>
                  </div>
                )}

                {item.type === 'JAM_INVITE' && (
                  <div className="pt-1 pl-5 sm:pl-6">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span>Live Session Ready</span>
                    </span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => fetchNotifications(filter, false)}
                disabled={isLoading}
                className="font-mono text-[11px] uppercase tracking-wider px-6 py-3 border border-line bg-panel hover:bg-canvas-deep text-ink transition-colors rounded-xl cursor-pointer disabled:opacity-50 shadow-2xs"
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
