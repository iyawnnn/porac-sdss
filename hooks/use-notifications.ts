import * as React from "react";
import { NOTIFICATIONS_UPDATED_EVENT, broadcastNotificationsUpdated } from "@/lib/notifications-events";

const POLL_INTERVAL_MS = 25_000;

interface NotificationListResponse<T> {
  items: T[];
  nextCursor: number | null;
}

interface NotificationLike {
  id: number;
  readAt: string | null;
}

// Shared by the admin bell and the citizen bell. Each shell passes its own
// audience path (/api/notifications or /api/citizens/notifications) so a
// browser holding both session cookies never mixes the two (IAN-27).
export function useNotifications<T extends NotificationLike>(basePath: string) {
  const [items, setItems] = React.useState<T[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        fetch(`${basePath}?limit=10`),
        fetch(`${basePath}/unread-count`),
      ]);
      if (listRes.ok) {
        const data = (await listRes.json()) as NotificationListResponse<T>;
        setItems(data.items);
      }
      if (countRes.ok) {
        const data = (await countRes.json()) as { count: number };
        setUnreadCount(data.count);
      }
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  React.useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL_MS);
    // Any other mounted instance (e.g. the header bell while the
    // Notification Center page marks something read) broadcasts this event
    // so unread counts stay in sync without waiting for the next poll tick.
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  const markRead = React.useCallback(async (id: number) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await fetch(`${basePath}/${id}/read`, { method: "POST" });
    broadcastNotificationsUpdated();
  }, [basePath]);

  const markAllRead = React.useCallback(async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    await fetch(`${basePath}/read-all`, { method: "POST" });
    broadcastNotificationsUpdated();
  }, [basePath]);

  return { items, unreadCount, loading, markRead, markAllRead, refresh };
}
