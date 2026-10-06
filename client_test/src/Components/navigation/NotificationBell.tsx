import { Link, useLocation } from "@tanstack/react-router";
import { useNotificationsStore } from "../../stores/notifications.store";

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className = "" }: NotificationBellProps) {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const { pathname } = useLocation();
  const isNotificationsActive = pathname.startsWith("/notifications");

  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      title={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
          : "Notifications"
      }
      className={`relative w-8 h-8 rounded-full border border-line bg-panel hover:bg-canvas hover:border-ink flex items-center justify-center text-ink-soft hover:text-ink transition-colors cursor-pointer shadow-2xs ${
        isNotificationsActive ? "border-ink text-ink bg-canvas ring-1 ring-ink/20" : ""
      } ${className}`}
    >
      {/* Bell Icon SVG */}
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>

      {/* Unread Pill Badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-blue text-white font-mono text-[8.5px] leading-tight px-1.5 py-0.5 rounded-full font-bold shadow-xs animate-in zoom-in-75">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
