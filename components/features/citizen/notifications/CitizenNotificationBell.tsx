"use client";

import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/use-notifications";
import type { CitizenNotification } from "@/lib/types/citizens-notifications";
import { timeAgo } from "@/lib/utils/time-ago";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function BellIcon() {
  return (
    <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  );
}

export function CitizenNotificationBell() {
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications<CitizenNotification>();

  function handleSelect(notification: CitizenNotification) {
    if (!notification.readAt) void markRead(notification.id);
    if (notification.href) router.push(notification.href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-line-200 text-ink-700 hover:bg-line-100"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 border border-line-200 bg-surface text-ink-900 shadow-md ring-0">
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="px-0 py-0 text-xs font-medium text-ink-500">Notifications</span>
          {unreadCount > 0 && (
            <button
              className="cursor-pointer text-xs font-medium text-brand-700 hover:underline"
              onClick={() => void markAllRead()}
              type="button"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="bg-line-200" />
        {loading ? (
          <div className="space-y-2 p-2">
            <div className="h-10 w-full animate-pulse rounded-md bg-line-100" />
            <div className="h-10 w-full animate-pulse rounded-md bg-line-100" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-1.5 py-4 text-center text-sm text-ink-500">No notifications yet.</p>
        ) : (
          items.map((notification) => (
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 whitespace-normal focus:bg-brand-50 focus:text-ink-900"
              key={notification.id}
              onClick={() => handleSelect(notification)}
            >
              <span className="flex w-full items-center gap-1.5">
                {!notification.readAt && <span className="size-1.5 shrink-0 rounded-full bg-brand-600" />}
                <span className="truncate font-medium text-ink-900">{notification.title}</span>
              </span>
              <span className="line-clamp-2 text-xs text-ink-500">{notification.message}</span>
              <span className="text-xs text-ink-400">{timeAgo(notification.createdAt)}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
