"use client";

import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import type { AdminSession } from "@/lib/auth/session";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AdminSidebarTrigger } from "@/components/layouts/AdminSidebarTrigger";
import { AdminUserMenu } from "@/components/layouts/AdminUserMenu";
import { NotificationBell } from "@/components/layouts/NotificationBell";

function pageLabel(pathname: string): string {
  if (pathname.startsWith("/admin/tickets")) return "Ticket Queue";
  if (pathname.startsWith("/admin/map")) return "Interactive Map";
  if (pathname.startsWith("/admin/flagged")) return "Flagged Reports";
  return "Dashboard";
}

export function AdminHeader({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 flex h-(--app-header-height) w-full shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-3"><AdminSidebarTrigger place="navbar" /></div>
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbPage>{pageLabel(pathname)}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="flex items-center gap-3">
        <Button aria-label="Help is not yet available" disabled size="icon-sm" variant="outline"><CircleHelp /></Button>
        <NotificationBell />
        <Separator className="h-4 data-[orientation=vertical]:self-center" orientation="vertical" />
        <AdminUserMenu session={session} />
      </div>
    </header>
  );
}
