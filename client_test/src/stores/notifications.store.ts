import { create } from "zustand";
import {
  notificationsApi,
  type NotificationResponseItem,
  type NotificationFilter,
} from "../lib/notifications.api";
import { useAuthStore } from "./auth.store";

interface NotificationsState {
  unreadCount: number;
  notifications: NotificationResponseItem[];
  filter: NotificationFilter;
  nextCursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  sseConnected: boolean;

  // Actions
  setFilter: (filter: NotificationFilter) => void;
  fetchUnreadCount: () => Promise<void>;
  fetchNotifications: (filterOverride?: NotificationFilter, isInitial?: boolean) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  connectSSE: () => () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  unreadCount: 0,
  notifications: [],
  filter: "all",
  nextCursor: null,
  hasMore: false,
  isLoading: false,
  sseConnected: false,

  setFilter: (filter: NotificationFilter) => {
    set({ filter });
    get().fetchNotifications(filter, true);
  },

  fetchUnreadCount: async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      set({ unreadCount: res.count });
    } catch (err) {
      console.warn("[Notifications] Failed to fetch unread count:", err);
    }
  },

  fetchNotifications: async (filterOverride, isInitial = false) => {
    const currentFilter = filterOverride || get().filter;
    const cursor = isInitial ? undefined : get().nextCursor || undefined;

    set({ isLoading: true });
    try {
      const res = await notificationsApi.getNotifications({
        filter: currentFilter,
        cursor,
        limit: 20,
      });

      set({
        notifications: isInitial
          ? res.notifications
          : [...get().notifications, ...res.notifications],
        unreadCount: res.unreadCount,
        nextCursor: res.nextCursor,
        hasMore: res.hasMore,
      });
    } catch (err) {
      console.warn("[Notifications] Failed to load notifications:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  markAsRead: async (id: string) => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));

    try {
      await notificationsApi.markAsRead(id);
    } catch (err) {
      console.error("[Notifications] Failed to mark notification as read:", err);
      // Re-fetch to reconcile state
      get().fetchUnreadCount();
    }
  },

  markAllAsRead: async () => {
    // Optimistic update
    const previousNotifications = get().notifications;
    const previousUnread = get().unreadCount;

    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        isRead: true,
        readAt: new Date().toISOString(),
      })),
      unreadCount: 0,
    }));

    try {
      await notificationsApi.markAllAsRead();
    } catch (err) {
      console.error("[Notifications] Failed to mark all as read:", err);
      set({
        notifications: previousNotifications,
        unreadCount: previousUnread,
      });
    }
  },

  connectSSE: () => {
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated) {
      return () => {};
    }

    const token = auth.accessToken;
    const url = `/api/v1/notifications/stream${
      token ? `?token=${encodeURIComponent(token)}` : ""
    }`;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const setupConnection = () => {
      if (isDisposed) return;

      try {
        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onopen = () => {
          set({ sseConnected: true });
        };

        eventSource.addEventListener("connected", () => {
          set({ sseConnected: true });
          get().fetchUnreadCount();
        });

        eventSource.addEventListener("notification", (event) => {
          try {
            const data = JSON.parse(event.data);
            const incoming: NotificationResponseItem = data.notification;

            set((state) => {
              // Avoid duplicate insertion
              const exists = state.notifications.some((n) => n.id === incoming.id);
              return {
                unreadCount: state.unreadCount + 1,
                notifications: exists ? state.notifications : [incoming, ...state.notifications],
              };
            });
          } catch (err) {
            console.error("[Notifications SSE] Failed to parse event payload:", err);
          }
        });

        eventSource.onerror = () => {
          set({ sseConnected: false });
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          // Reconnect with 5s delay if not unmounted
          if (!isDisposed) {
            reconnectTimeout = setTimeout(setupConnection, 5000);
          }
        };
      } catch (err) {
        console.warn("[Notifications SSE] Connection init error:", err);
      }
    };

    setupConnection();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      set({ sseConnected: false });
    };
  },
}));
