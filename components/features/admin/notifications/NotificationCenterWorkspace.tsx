"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck } from "lucide-react";
import {
  ADMIN_NOTIFICATION_TYPES,
  ADMIN_NOTIFICATION_TYPE_LABELS,
  type AdminNotification,
  type NotificationListResponse,
} from "@/lib/types/admin-notifications";
import { broadcastNotificationsUpdated } from "@/lib/notifications-events";
import { timeAgo } from "@/lib/utils/time-ago";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminErrorCard } from "../shared/AdminErrorCard";

const PAGE_LIMIT = 20;

type StatusFilter = "all" | "unread" | "read";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function typeLabel(type: string): string {
  return (ADMIN_NOTIFICATION_TYPE_LABELS as Record<string, string>)[type] ?? type;
}

function buildParams(status: StatusFilter, type: string, before?: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_LIMIT));
  if (status !== "all") params.set("status", status);
  if (type) params.set("type", type);
  if (before) params.set("before", String(before));
  return params;
}

export function NotificationCenterWorkspace({
  initialData,
  initialStatus,
  initialType,
}: {
  initialData: NotificationListResponse;
  initialStatus: StatusFilter;
  initialType: string;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [type, setType] = useState(initialType);
  const [items, setItems] = useState<AdminNotification[]>(initialData.items);
  const [nextCursor, setNextCursor] = useState<number | null>(initialData.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);
  const skipFetchRef = useRef(true);

  useEffect(() => {
    const urlParams = new URLSearchParams();
    if (status !== "all") urlParams.set("status", status);
    if (type) urlParams.set("type", type);
    router.replace(`/admin/notifications${urlParams.toString() ? `?${urlParams.toString()}` : ""}`, { scroll: false });
  }, [status, type, router]);

  // Filter changes re-fetch page 1; "Load more" appends instead (handled in
  // loadMore below), so this effect only ever runs on status/type/retry.
  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    const params = buildParams(status, type);
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/notifications?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json: NotificationListResponse) => {
        if (cancelled) return;
        setItems(json.items);
        setNextCursor(json.nextCursor);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load notifications.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, type, refetchNonce]);

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const params = buildParams(status, type, nextCursor);
      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json: NotificationListResponse = await res.json();
      setItems((prev) => [...prev, ...json.items]);
      setNextCursor(json.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    broadcastNotificationsUpdated();
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    await fetch("/api/notifications/read-all", { method: "POST" });
    broadcastNotificationsUpdated();
  }

  function handleOpen(notification: AdminNotification) {
    if (!notification.readAt) void markRead(notification.id);
  }

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="font-heading text-base font-semibold">Notifications</h1>
          <p className="text-xs text-muted-foreground">Your full notification history — the bell only shows the most recent.</p>
        </div>
        <Button disabled={!hasUnread} onClick={() => void markAllRead()} size="sm" variant="outline">
          <CheckCheck />
          Mark all read
        </Button>
      </div>

      <Card className="gap-0">
        <CardContent className="flex flex-wrap items-center gap-3 border-b p-3">
          <Select onValueChange={(v) => setStatus(v as StatusFilter)} value={status}>
            <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => setType(v === "all" ? "" : v)} value={type || "all"}>
            <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ADMIN_NOTIFICATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>

        <CardContent className="p-0">
          {error ? (
            <div className="p-4">
              <AdminErrorCard message={error} onRetry={retry} title="Couldn't load notifications" />
            </div>
          ) : loading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton className="h-16 w-full" key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <BellOff aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">No notifications match this filter.</p>
              <p className="text-sm text-muted-foreground">Try a different status or type filter.</p>
            </div>
          ) : (
            <ul aria-label="Notification history" className="divide-y">
              {items.map((notification) => (
                <li className="flex items-start gap-3 p-4" key={notification.id}>
                  <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {notification.href ? (
                        <Link className="font-medium hover:underline" href={notification.href} onClick={() => handleOpen(notification)}>
                          {notification.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{notification.title}</span>
                      )}
                      <Badge variant="outline">{typeLabel(notification.type)}</Badge>
                      {!notification.readAt && <Badge variant="secondary">Unread</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(notification.createdAt)} {"·"} {timeAgo(notification.createdAt)}</p>
                  </div>
                  {!notification.readAt && (
                    <Button onClick={() => void markRead(notification.id)} size="sm" variant="ghost">
                      Mark as read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {nextCursor !== null && !loading && !error && (
        <Button className="self-center" disabled={loadingMore} onClick={() => void loadMore()} variant="outline">
          {loadingMore ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
