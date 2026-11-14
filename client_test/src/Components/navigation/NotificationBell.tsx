import { Link, useLocation } from '@tanstack/react-router'
import { useNotificationsStore } from '../../stores/notifications.store'
import { BellIcon } from 'lucide-react'

interface NotificationBellProps {
  className?: string
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const { pathname } = useLocation()
  const isNotificationsActive = pathname.startsWith('/notifications')

  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      title={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
          : 'Notifications'
      }
      className={`relative w-8 h-8 rounded-full  bg-card hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-raised ${
        isNotificationsActive ? ' border border-border  ' : ''
      } ${className}`}
    >
      {/* Bell Icon SVG */}
      <BellIcon className="w-4 h-4" />

      {/* Unread Pill Badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground font-mono text-eyebrow leading-tight px-1.5 py-0.5 rounded-full font-bold shadow-xs animate-in zoom-in-75">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  )
}
