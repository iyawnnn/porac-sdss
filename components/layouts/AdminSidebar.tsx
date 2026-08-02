"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, ShieldAlert, Ticket, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar";
import OfficeScopeToggle from "@/components/features/admin/shared/OfficeScopeToggle";
import { AdminSearch } from "@/components/layouts/AdminSearch";
import { AdminSidebarTrigger } from "@/components/layouts/AdminSidebarTrigger";

interface NavItem { href: string; label: string; icon: LucideIcon; }
const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  { heading: "Main", items: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/tickets", label: "Ticket Queue", icon: Ticket },
    { href: "/admin/map", label: "Interactive Map", icon: Map },
  ] },
  { heading: "Management", items: [{ href: "/admin/flagged", label: "Flagged Reports", icon: ShieldAlert }] },
];

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
  return (
    <Sidebar className={cn("*:data-[slot=sidebar-inner]:bg-background", "transition-[left,right,top,width]")} collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="h-(--app-header-height,3rem) flex-row items-center justify-between">
        <Button asChild variant="ghost"><Link href="/admin"><LayoutDashboard /><span className="font-medium">Porac SDSS</span></Link></Button>
        <AdminSidebarTrigger place="sidebar" />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Admin">
        <SidebarGroup><AdminSearch sections={NAV_SECTIONS} /></SidebarGroup>
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.heading}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">{section.heading}</SidebarGroupLabel>
            <SidebarMenu>{section.items.map((item) => <SidebarMenuItem key={item.href}><NavLink active={isActivePath(pathname, item.href)} item={item} /></SidebarMenuItem>)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="px-4">
        <div className="rounded-lg border bg-background px-3 pt-4 pb-3">
          <p className="font-medium text-xs">Current office scope</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Signed in as {session.adminName} {"\u00b7"} {session.office}</p>
          <div className="mt-3"><OfficeScopeToggle myOffice={session.office} /></div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
