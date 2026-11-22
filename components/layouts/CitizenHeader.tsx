"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, UserRound } from "lucide-react";
import type { CitizenSession } from "@/lib/auth/citizenSession";
import CitizenLogoutButton from "@/components/features/citizen/auth/CitizenLogoutButton";
import { BrandLogo } from "@/components/layouts/BrandLogo";
import { ThemeToggle } from "@/components/layouts/ThemeToggle";
import { CitizenNotificationBell } from "@/components/features/citizen/notifications/CitizenNotificationBell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/reports", label: "My Reports" },
  { href: "/map", label: "Explore Map" },
  { href: "/report", label: "Report a Concern" },
];

function CitizenNavLink({ item, pathname, ...props }: Omit<React.ComponentProps<typeof Link>, "href"> & {
  item: (typeof NAV_LINKS)[number];
  pathname: string;
}) {
  const active = pathname === item.href || (item.href === "/reports" && pathname.startsWith("/dashboard/reports/"));
  return (
    <Link
      {...props}
      href={item.href}
      aria-current={active ? (pathname === item.href ? "page" : "location") : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors hover:text-foreground",
        active ? "bg-accent text-accent-foreground" : item.href === "/report" ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span className="link-underline">{item.label}</span>
    </Link>
  );
}

export default function CitizenHeader({ session }: { session: CitizenSession }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:h-[70px] lg:gap-6 lg:px-8">
        <Link href="/dashboard" aria-label="PORAC-SDSS Home" className="inline-flex min-h-11 shrink-0 items-center rounded-md outline-offset-2">
          <BrandLogo height={30} priority />
        </Link>
        <nav aria-label="Citizen navigation" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((item) => <CitizenNavLink key={item.href} item={item} pathname={pathname} />)}
        </nav>
        <div className="ml-auto flex shrink-0 items-center lg:gap-1 lg:border-l lg:border-border lg:pl-3">
          <ThemeToggle className="size-11" />
          <CitizenNotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 active:not-aria-[haspopup]:translate-y-0" aria-label="Account menu">
                <UserRound aria-hidden="true" className="size-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{session.citizenName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-11">
                <Link href="/account" aria-current={pathname === "/account" ? "page" : undefined}>Account Settings</Link>
              </DropdownMenuItem>
              <CitizenLogoutButton />
            </DropdownMenuContent>
          </DropdownMenu>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="Open navigation">
                <Menu aria-hidden="true" className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined} className="motion-reduce:animate-none">
              <SheetHeader><SheetTitle>Navigation</SheetTitle></SheetHeader>
              <nav aria-label="Citizen navigation" className="flex flex-col gap-1 px-4">
                {NAV_LINKS.map((item) => (
                  <SheetClose key={item.href} asChild>
                    <CitizenNavLink item={item} pathname={pathname} />
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
