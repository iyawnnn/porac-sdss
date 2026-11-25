"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Bell,
  BellOff,
  CheckCheck,
  CircleCheck,
  CircleX,
  Copy,
  Forward,
  Hammer,
  Inbox,
  Layers,
  MessageSquare,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/use-notifications";
import { CITIZEN_NOTIFICATION_TYPES, type CitizenNotification } from "@/lib/types/citizens-notifications";
import { timeAgo } from "@/lib/utils/time-ago";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type NotificationType = keyof typeof CITIZEN_NOTIFICATION_TYPES;

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  report_received: Inbox,
  report_merged: Layers,
  report_acknowledged: CheckCheck,
  report_quarantined: ShieldAlert,
  report_flagged_duplicate: Copy,
  ticket_under_review: ScanSearch,
  ticket_in_progress: Hammer,
  ticket_resolved: CircleCheck,
  ticket_rejected: CircleX,
  ticket_reassigned: ArrowRightLeft,
  ticket_referred: Forward,
  ticket_returned_to_review: RotateCcw,
  ticket_acknowledged: CheckCheck,
  resolution_feedback_received: MessageSquare,
};

const ROW = "flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors duration-150 outline-none";
const TEXT_ACTION =
  "outline-none! focus-visible:ring-2 focus-visible:ring-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground";

function NotificationRowContent({ notification }: { notification: CitizenNotification }) {
  const type = notification.type as NotificationType;
  const Icon = TYPE_ICONS[type] ?? Bell;
  const unread = !notification.readAt;
  return (
    <>
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm/5", unread ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>
          {notification.title || CITIZEN_NOTIFICATION_TYPES[type] || "Report update"}
        </span>
        <span className="line-clamp-2 text-sm/5 text-muted-foreground">{notification.message}</span>
        <time dateTime={notification.createdAt} className="mt-1 text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</time>
      </span>
      {unread && (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
          <span className="sr-only">Unread</span>
        </span>
      )}
    </>
  );
}

function PanelState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
      <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

function LoadingRows() {
  return (
    <div aria-busy="true" aria-label="Loading notifications" className="divide-y divide-border/60">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BellGlyph({ unreadCount }: { unreadCount: number }) {
  return (
    <>
      <Bell aria-hidden="true" className="size-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums ring-2 ring-background">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </>
  );
}

export function CitizenNotificationBell({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const router = useRouter();
  const { items, unreadCount, loading, error, markRead, markAllRead, refresh } = useNotifications<CitizenNotification>("/api/citizens/notifications");

  function handleSelect(notification: CitizenNotification) {
    if (!notification.readAt) void markRead(notification.id);
    if (notification.href) router.push(notification.href);
  }
  const label = unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications";
  const triggerClass = cn("relative flex items-center justify-center", className);

  const heading = (
    <span className="flex items-baseline gap-2">
      <span className="text-base font-semibold text-foreground">Notifications</span>
      {unreadCount > 0 && <span className="text-xs text-muted-foreground tabular-nums">{unreadCount} unread</span>}
    </span>
  );
  // A failed poll keeps showing the last good list; the error state only replaces an empty one.
  const body = (retry: React.ReactNode, list: React.ReactNode) =>
    loading ? <LoadingRows />
    : items.length > 0 ? list
    : error ? <PanelState icon={TriangleAlert} title="Notifications couldn't be loaded">{retry}</PanelState>
    : (
      <PanelState icon={BellOff} title="You're all caught up">
        <p className="text-sm text-muted-foreground">Updates about your reports will appear here.</p>
      </PanelState>
    );

  if (isMobile) {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger aria-label={label} className={triggerClass}>
          <BellGlyph unreadCount={unreadCount} />
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          aria-describedby={undefined}
          className="h-dvh w-full gap-0 border-0 bg-background shadow-none data-[side=right]:border-l-0 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-[side=right]:w-full data-[side=right]:sm:max-w-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <SheetTitle asChild>{heading}</SheetTitle>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button type="button" className={TEXT_ACTION} onClick={() => void markAllRead()}>
                  <CheckCheck aria-hidden="true" className="size-4" />Mark all read
                </button>
              )}
              <SheetClose className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground">
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {body(
              <button type="button" className={cn(TEXT_ACTION, "mt-2 text-foreground")} onClick={() => void refresh()}>Try again</button>,
              <ul className="divide-y divide-border/60 pb-[env(safe-area-inset-bottom)]">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={cn(ROW, "min-h-16 hover:bg-muted/60 focus-visible:bg-muted/60 active:bg-muted")}
                      onClick={() => { handleSelect(notification); if (notification.href) setSheetOpen(false); }}
                    >
                      <NotificationRowContent notification={notification} />
                    </button>
                  </li>
                ))}
              </ul>,
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger aria-label={label} className={triggerClass}>
            <BellGlyph unreadCount={unreadCount} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>Notifications</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="flex w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-4">
          {heading}
          {/* Menu items, not plain buttons: Radix menus only move focus between items. */}
          {unreadCount > 0 && (
            <DropdownMenuItem className={TEXT_ACTION} onSelect={(event) => { event.preventDefault(); void markAllRead(); }}>
              <CheckCheck aria-hidden="true" />Mark all read
            </DropdownMenuItem>
          )}
        </div>
        <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[min(30rem,calc(100dvh-10rem))]">
          {body(
            <DropdownMenuItem className={cn(TEXT_ACTION, "mt-2 text-foreground")} onSelect={(event) => { event.preventDefault(); void refresh(); }}>
              Try again
            </DropdownMenuItem>,
            <div className="divide-y divide-border/60">
              {items.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className={cn(ROW, "rounded-none whitespace-normal outline-none! focus:bg-muted/60 focus:text-foreground")}
                  onClick={() => handleSelect(notification)}
                >
                  <NotificationRowContent notification={notification} />
                </DropdownMenuItem>
              ))}
            </div>,
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
