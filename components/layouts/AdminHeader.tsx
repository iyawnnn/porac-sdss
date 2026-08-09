"use client";

import { usePathname } from "next/navigation";
import type { AdminSession } from "@/lib/auth/session";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { AdminSidebarTrigger } from "@/components/layouts/AdminSidebarTrigger";
import { AdminUserMenu } from "@/components/layouts/AdminUserMenu";
import { NotificationBell } from "@/components/layouts/NotificationBell";

function pageLabel(pathname: string): string {
  if (pathname.startsWith("/admin/tickets")) return "Ticket Queue";
  if (pathname.startsWith("/admin/map")) return "Interactive Map";
  if (pathname.startsWith("/admin/barangay-insights")) return "Barangay Insights";
  if (pathname.startsWith("/admin/notifications")) return "Notifications";
  if (pathname.startsWith("/admin/flagged")) return "Flagged Reports";
  if (pathname.startsWith("/admin/admins")) return "Admin Management";
  if (pathname.startsWith("/admin/activity-log")) return "Activity Log";
  if (pathname.startsWith("/admin/account")) return "Account & Security";
  return "Dashboard";
}

export function AdminHeader({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 flex h-(--app-header-height) w-full shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-3"><AdminSidebarTrigger place="navbar" /></div>
      <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbPage>{pageLabel(pathname)}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <Separator className="h-4 data-[orientation=vertical]:self-center" orientation="vertical" />
        <AdminUserMenu session={session} />
      </div>
    </header>
  );
}
