"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, Map, ShieldAlert, ShieldUser, Ticket, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSession } from "@/lib/auth/session";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { Button } from "@/components/ui/button";
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
    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
      <Link aria-current={active ? "page" : undefined} href={item.href} onClick={() => { if (isMobile) setOpenMobile(false); }}>
        <Icon /><span>{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export default function AdminSidebar({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  const navSections = buildNavSections(isSystemAdmin(session));
  return (
    <Sidebar className={cn("*:data-[slot=sidebar-inner]:bg-background", "transition-[left,right,top,width]")} collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="h-(--app-header-height,3rem) flex-row items-center justify-between">
        <Button asChild variant="ghost"><Link href="/admin"><LayoutDashboard /><span className="font-medium">Porac SDSS</span></Link></Button>
        <AdminSidebarTrigger place="sidebar" />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Admin">
        <SidebarGroup><AdminSearch sections={navSections} /></SidebarGroup>
        {navSections.map((section) => (
          <SidebarGroup key={section.heading}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">{section.heading}</SidebarGroupLabel>
            <SidebarMenu>{section.items.map((item) => <SidebarMenuItem key={item.href}><NavLink active={isActivePath(pathname, item.href)} item={item} /></SidebarMenuItem>)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="px-4">
        <div className="rounded-lg border bg-background px-3 pt-4 pb-3">
          <p className="font-medium text-xs">{isSystemAdmin(session) ? "All Offices" : `My Office: ${session.office}`}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Signed in as {session.adminName} {"\u00b7"} {isSystemAdmin(session) ? "System Administrator" : session.office}</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
