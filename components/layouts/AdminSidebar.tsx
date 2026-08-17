"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ClipboardList, FileBarChart2, LayoutDashboard, Map, ShieldAlert, ShieldUser, Ticket, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSession } from "@/lib/auth/session";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar";
import { AdminSearch } from "@/components/layouts/AdminSearch";
import { AdminSidebarTrigger } from "@/components/layouts/AdminSidebarTrigger";

interface NavItem { href: string; label: string; icon: LucideIcon; }

// Admin Management and the Activity Log are System Administrator only —
// backend-enforced via SystemAdminGuard on every /admin/admins and
// /admin/activity-log route, this is just the matching UI hide (never the
// actual gate). See api/src/common/guards/system-admin.guard.ts.
function buildNavSections(systemAdmin: boolean): { heading: string; items: NavItem[] }[] {
  const managementItems: NavItem[] = [
    { href: "/admin/work-orders", label: "Work Orders", icon: Wrench },
    { href: "/admin/flagged", label: "Flagged Reports", icon: ShieldAlert },
    { href: "/admin/reports", label: "Reports & Exports", icon: FileBarChart2 },
    { href: "/admin/notifications", label: "Notifications", icon: Bell },
  ];
  if (systemAdmin) {
    managementItems.push({ href: "/admin/admins", label: "Admin Management", icon: ShieldUser });
    managementItems.push({ href: "/admin/activity-log", label: "Activity Log", icon: ClipboardList });
  }
  return [
    { heading: "Main", items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tickets", label: "Ticket Queue", icon: Ticket },
      { href: "/admin/map", label: "Interactive Map", icon: Map },
      { href: "/admin/barangay-insights", label: "Barangay Insights", icon: Building2 },
    ] },
    { heading: "Management", items: managementItems },
  ];
}

function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = item.icon;
  return (
    <SidebarMenuButton
      asChild
      isActive={active}
      tooltip={item.label}
      className="text-sidebar-foreground/85 hover:bg-accent hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-accent-foreground"
    >
      <Link aria-current={active ? "page" : undefined} href={item.href} onClick={() => { if (isMobile) setOpenMobile(false); }}>
        <Icon />
        <span>{item.label}</span>
        {active && <span aria-hidden="true" className="ml-auto size-1.5 shrink-0 rounded-full bg-ring" />}
      </Link>
    </SidebarMenuButton>
  );
}

export default function AdminSidebar({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  const navSections = buildNavSections(isSystemAdmin(session));
  return (
    <Sidebar className={cn("*:data-[slot=sidebar-inner]:bg-background", "transition-[left,right,top,width]")} collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="h-(--app-header-height,3rem) flex-row items-center justify-between gap-2 border-b border-sidebar-border px-3">
        <Link className="flex min-w-0 items-center gap-2 rounded-md py-1 outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring" href="/admin">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LayoutDashboard className="size-3.5" />
          </span>
          <span className="truncate text-sm font-semibold text-sidebar-foreground">Porac SDSS</span>
        </Link>
        <AdminSidebarTrigger place="sidebar" />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Admin">
        <SidebarGroup><AdminSearch sections={navSections} /></SidebarGroup>
        {navSections.map((section) => (
          <SidebarGroup key={section.heading}>
            <SidebarGroupLabel className="px-2 text-[11px] tracking-wide text-sidebar-foreground/55 group-data-[collapsible=icon]:pointer-events-none">{section.heading}</SidebarGroupLabel>
            <SidebarMenu>{section.items.map((item) => <SidebarMenuItem key={item.href}><NavLink active={isActivePath(pathname, item.href)} item={item} /></SidebarMenuItem>)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-1 border-t border-sidebar-border px-4 py-3">
        <p className="truncate text-xs font-medium text-sidebar-foreground">{isSystemAdmin(session) ? "All Offices" : `My Office: ${session.office}`}</p>
        <p className="truncate text-[11px] text-sidebar-foreground/60">Signed in as {session.adminName} {"\u00b7"} {isSystemAdmin(session) ? "System Administrator" : session.office}</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
