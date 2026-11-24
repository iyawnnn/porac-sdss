"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, LogOut, Menu, Moon, Sun, UserRound, X } from "lucide-react";
import type { CitizenSession } from "@/lib/auth/citizenSession";
import { useCitizenLogout } from "@/components/features/citizen/auth/use-citizen-logout";
import { BrandLogo } from "@/components/layouts/BrandLogo";
import { ThemeToggle, applyTheme } from "@/components/layouts/ThemeToggle";
import { CitizenNotificationBell } from "@/components/features/citizen/notifications/CitizenNotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/map", label: "Map" },
  { href: "/reports", label: "My Reports" },
  { href: "/report", label: "Report Hazard" },
];

// Theme toggle, bell and menu trigger: 44px touch targets below lg, compact 36px on desktop.
const ICON_BUTTON =
  "size-11 cursor-pointer rounded-full border border-border bg-background text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted active:not-aria-[haspopup]:translate-y-0 data-open:bg-muted data-open:text-foreground lg:size-9 dark:bg-background dark:hover:bg-muted";
// Menu items show focus with their background; the global outline is unlayered, hence `!`.
const MENU_ITEM = "outline-none! h-9 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150 focus:bg-muted [&_svg]:text-muted-foreground";
const SIGN_OUT_ITEM = "focus:bg-destructive/8 focus:text-destructive focus:[&_svg]:text-destructive dark:focus:bg-destructive/15";
const MOBILE_ROW = "flex min-h-13 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors duration-150 hover:bg-muted/70 active:bg-muted";

function isActive(href: string, pathname: string) {
  return pathname === href || (href === "/reports" && pathname.startsWith("/dashboard/reports/"));
}

function ariaCurrent(href: string, pathname: string) {
  return isActive(href, pathname) ? (pathname === href ? "page" : "location") : undefined;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

function CitizenAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("after:border-0", className)}>
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function Identity({ session }: { session: CitizenSession }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CitizenAvatar name={session.citizenName} className="size-9" />
      <div className="flex min-w-0 flex-col">
        <Text as="span" variant="label" truncate>{session.citizenName}</Text>
        <Text as="span" variant="caption" color="muted" truncate>{session.email}</Text>
      </div>
    </div>
  );
}

function ProfileMenu({ session, pathname }: { session: CitizenSession; pathname: string }) {
  const logout = useCitizenLogout();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-10 cursor-pointer items-center gap-2.5 rounded-full border border-border bg-background py-1 pr-3 pl-1 text-left transition-colors duration-150 hover:bg-muted/60 active:bg-muted data-open:bg-muted"
        >
          <span className="sr-only">Account menu: </span>
          <CitizenAvatar name={session.citizenName} className="size-8" />
          <span className="flex max-w-36 flex-col">
            <Text as="span" variant="label" truncate className="leading-4">{session.citizenName}</Text>
            <Text as="span" variant="caption" color="muted" className="leading-4">Citizen</Text>
          </span>
          <ChevronDown aria-hidden="true" className="ml-0.5 size-4 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl p-1.5">
        <div className="px-2.5 pt-1.5 pb-2.5"><Identity session={session} /></div>
        <DropdownMenuSeparator className="mx-0 my-1" />
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href="/account" aria-current={pathname === "/account" ? "page" : undefined}>
            <UserRound aria-hidden="true" />Account Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className={cn(MENU_ITEM, SIGN_OUT_ITEM)} onSelect={() => void logout()}>
          <LogOut aria-hidden="true" />Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppearanceSwitch() {
  // Mounted only while the menu is open, so reading the live class here is safe.
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"));
  const options = [
    { value: false, label: "Light", Icon: Sun },
    { value: true, label: "Dark", Icon: Moon },
  ];
  return (
    <div role="group" aria-label="Appearance" className="flex rounded-full bg-muted p-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={label}
          type="button"
          aria-pressed={dark === value}
          onClick={() => { applyTheme(value); setDark(value); }}
          className={cn(
            "flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors duration-200",
            dark === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />{label}
        </button>
      ))}
    </div>
  );
}

function MobileMenu({ session, pathname }: { session: CitizenSession; pathname: string }) {
  const logout = useCitizenLogout();
  const reveal = (index: number) => ({
    className: "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none",
    style: { animationDelay: `${60 + index * 35}ms` },
  });

  return (
    <Sheet>
      <SheetTrigger aria-label="Open navigation" className={cn(ICON_BUTTON, "flex items-center justify-center lg:hidden")}>
        <Menu aria-hidden="true" className="size-4" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        className="h-dvh w-full gap-0 overflow-y-auto overscroll-contain border-0 bg-background shadow-none data-[side=right]:border-l-0 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-[side=right]:w-full data-[side=right]:sm:max-w-none"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex min-h-full flex-col px-4 pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex h-16 shrink-0 items-center justify-between">
            <SheetClose asChild>
              <Link href="/dashboard" aria-label="PORAC-SDSS Home" className="inline-flex min-h-11 items-center rounded-md">
                <BrandLogo variant="lockup" height={26} />
              </Link>
            </SheetClose>
            <SheetClose className={cn(ICON_BUTTON, "flex items-center justify-center")}>
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>

          <nav aria-label="Citizen navigation" className="pt-6 pb-8">
            <ul className="flex flex-col">
              {NAV_LINKS.map((item, i) => {
                const active = isActive(item.href, pathname);
                return (
                  <li key={item.href} {...reveal(i)}>
                    <SheetClose asChild>
                      <Link
                        href={item.href}
                        aria-current={ariaCurrent(item.href, pathname)}
                        className={cn(
                          "group flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl px-3 text-[clamp(1.5rem,6.5vw,1.875rem)] leading-tight font-semibold tracking-tight transition-colors duration-150 active:bg-muted",
                          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          {item.label}
                          {active && <span aria-hidden="true" className="size-2 rounded-full bg-primary" />}
                        </span>
                        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground/70 transition-colors duration-150 group-hover:text-foreground" />
                      </Link>
                    </SheetClose>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label="Account" style={reveal(NAV_LINKS.length).style} className={cn("mt-auto flex flex-col gap-1 border-t border-border pt-5", reveal(NAV_LINKS.length).className)}>
            <div className="px-3 pb-3"><Identity session={session} /></div>
            <SheetClose asChild>
              <Link href="/account" aria-current={pathname === "/account" ? "page" : undefined} className={MOBILE_ROW}>
                <UserRound aria-hidden="true" className="size-5 text-muted-foreground" />
                <span className="flex-1">Account Settings</span>
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground/70" />
              </Link>
            </SheetClose>
            <div className="flex min-h-13 items-center justify-between gap-3 px-3">
              <span className="text-base font-medium">Appearance</span>
              <AppearanceSwitch />
            </div>
            <button type="button" onClick={() => void logout()} className={cn(MOBILE_ROW, "text-destructive hover:bg-destructive/8 active:bg-destructive/12")}>
              <LogOut aria-hidden="true" className="size-5" />
              <span className="flex-1 text-left">Sign Out</span>
            </button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function CitizenHeader({ session }: { session: CitizenSession }) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={300}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:gap-8 lg:px-8">
          <Link href="/dashboard" aria-label="PORAC-SDSS Home" className="inline-flex min-h-11 shrink-0 items-center rounded-md">
            <BrandLogo variant="lockup" height={26} priority />
          </Link>
          <nav aria-label="Citizen navigation" className="hidden items-center gap-0.5 lg:flex">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ariaCurrent(item.href, pathname)}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 select-none",
                  isActive(item.href, pathname)
                    ? "bg-muted text-foreground hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_6%)] active:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_10%)]"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:bg-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <ThemeToggle className={cn(ICON_BUTTON, "hidden lg:inline-flex")} />
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>Switch theme</TooltipContent>
            </Tooltip>
            <CitizenNotificationBell className={ICON_BUTTON} />
            <div className="hidden lg:block"><ProfileMenu session={session} pathname={pathname} /></div>
            <MobileMenu session={session} pathname={pathname} />
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
