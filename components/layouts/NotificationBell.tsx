"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import type { AdminNotification } from "@/lib/types/admin-notifications";
import { timeAgo } from "@/lib/utils/time-ago";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationBell() {
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications<AdminNotification>();

  function handleSelect(notification: AdminNotification) {
    if (!notification.readAt) void markRead(notification.id);
    if (notification.href) router.push(notification.href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"} asChild>
        <Button className="relative" size="icon-sm" variant="outline">
          <Bell />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px]" variant="destructive">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              className="cursor-pointer text-xs font-medium text-primary hover:underline"
              onClick={() => void markAllRead()}
              type="button"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-1.5 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          items.map((notification) => (
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 whitespace-normal"
              key={notification.id}
              onClick={() => handleSelect(notification)}
            >
              <span className="flex w-full items-center gap-1.5">
                {!notification.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className="truncate font-medium text-foreground">{notification.title}</span>
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center text-xs font-medium text-primary">
          <Link href="/admin/notifications">View all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
