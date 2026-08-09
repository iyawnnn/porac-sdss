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

// Shared by the admin bell and the citizen bell — both just hit
// /api/notifications* with their own session cookie, so the only thing
// that differs per shell is how the result is styled/rendered.
export function useNotifications<T extends NotificationLike>() {
  const [items, setItems] = React.useState<T[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        fetch("/api/notifications?limit=10"),
        fetch("/api/notifications/unread-count"),
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
  }, []);

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
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    broadcastNotificationsUpdated();
  }, []);

  const markAllRead = React.useCallback(async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
    broadcastNotificationsUpdated();
  }, []);

  return { items, unreadCount, loading, markRead, markAllRead, refresh };
}
