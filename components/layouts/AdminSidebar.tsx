"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Building2, ClipboardList, FileBarChart2, Inbox, LayoutDashboard, Map, ShieldAlert, ShieldUser, Ticket, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSession } from "@/lib/auth/session";
import { isFocal, isSystemAdmin } from "@/lib/utils/adminScope";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar";
import { AdminSearch } from "@/components/layouts/AdminSearch";
import { AdminSidebarTrigger } from "@/components/layouts/AdminSidebarTrigger";

interface NavItem { href: string; label: string; icon: LucideIcon; }

// Batch 1 (five-role RBAC): navigation is now role-partitioned, not just
// "operational plus two extra System Administrator items" — system_admin no
// longer has routine operational access at all (backend-enforced via
// OperationalStaffGuard on every operational controller; see
// api/src/common/guards/operational-staff.guard.ts), so it must not see
// Dashboard/Ticket Queue/Work Orders/etc. in the sidebar either.
//
// Batch 2 (Focal intake): focal gets its real workspace — Dashboard, Intake
// Queue, and Notifications (the generic /notifications endpoint is already
// principal/role-aware and safe for focal as-is, see
// NotificationsService.scopeFilter). Interactive Map and Flagged Reports
// are deliberately NOT included yet: both are backed by
// OperationalStaffGuard-protected endpoints, and building a Focal-safe
// equivalent from the intake API alone is out of scope for this batch (see
// the Batch 2 report's "intentionally deferred" section). This is UI
// convenience only; the backend guards are what actually enforce these
// boundaries.
function buildNavSections(session: Pick<AdminSession, "role">): { heading: string; items: NavItem[] }[] {
  if (isSystemAdmin(session)) {
    return [
      { heading: "System Administration", items: [
        { href: "/admin/admins", label: "Admin Management", icon: ShieldUser },
        { href: "/admin/activity-log", label: "Activity Log", icon: ClipboardList },
      ] },
    ];
  }
  if (isFocal(session)) {
    return [
      { heading: "Main", items: [
        { href: "/admin/focal", label: "Dashboard", icon: LayoutDashboard },
        { href: "/admin/focal/intake", label: "Intake Queue", icon: Inbox },
        { href: "/admin/focal/map", label: "Interactive Map", icon: Map },
        { href: "/admin/focal/intake?flagged=true", label: "Flagged Reports", icon: ShieldAlert },
      ] },
      { heading: "Management", items: [
        { href: "/admin/notifications", label: "Notifications", icon: Bell },
      ] },
      { heading: "Account", items: [
        { href: "/admin/account", label: "Account & Security", icon: ShieldUser },
      ] },
    ];
  }
  return [
    { heading: "Main", items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tickets", label: "Ticket Queue", icon: Ticket },
      { href: "/admin/map", label: "Interactive Map", icon: Map },
      { href: "/admin/barangay-insights", label: "Barangay Insights", icon: Building2 },
    ] },
    { heading: "Management", items: [
      { href: "/admin/work-orders", label: "Work Orders", icon: Wrench },
      { href: "/admin/flagged", label: "Flagged Reports", icon: ShieldAlert },
      { href: "/admin/reports", label: "Reports & Exports", icon: FileBarChart2 },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
    ] },
  ];
}

// Avatar fallback — the admin session carries no photo, so the footer block
// mirrors the reference composition with initials rather than inventing an
// image field that does not exist on AdminSession.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// Never "All Offices" for system_admin — that phrasing implies operational
// authority it no longer has (Batch 1). Focal also gets its own wording
// rather than "My Office: MDRRMO", since that would read as operational
// office membership rather than the organizational-only relationship it
// actually has to MDRRMO.
function footerSubtitle(session: Pick<AdminSession, "role" | "office">): string {
  if (isSystemAdmin(session)) return "System Administrator / MIS";
  if (isFocal(session)) return "Central Monitoring / Focal Personnel";
  return `My Office: ${session.office}`;
}

// "/admin" and "/admin/focal" are both dashboard-root hrefs whose own path
// is a strict prefix of a sibling nav item's path ("/admin/focal/intake"),
// so both need exact-match only — otherwise Dashboard would show active
// while viewing Intake Queue.
const EXACT_MATCH_ONLY_HREFS = new Set(["/admin", "/admin/focal"]);

// Flagged Reports (Batch 4) lives at the same path as Intake Queue,
// distinguished only by ?flagged=true — usePathname() never carries the
// query string, so both hrefs need their own comparison: a query-bearing
// href requires an exact search-string match, and the plain Intake Queue
// href must NOT also light up while viewing the flagged variant.
function isActivePath(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefQuery] = href.split("?");
  if (hrefQuery !== undefined) {
    return pathname === hrefPath && search === hrefQuery;
  }
  if (hrefPath === "/admin/focal/intake" && search === "flagged=true") {
    return false;
  }
  return EXACT_MATCH_ONLY_HREFS.has(hrefPath) ? pathname === hrefPath : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
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
  const search = useSearchParams().toString();
  const navSections = buildNavSections(session);
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
            <SidebarMenu>{section.items.map((item) => <SidebarMenuItem key={item.href}><NavLink active={isActivePath(pathname, search, item.href)} item={item} /></SidebarMenuItem>)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-muted/40 px-2.5 py-2 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{initialsOf(session.adminName)}</span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-medium text-sidebar-foreground">{session.adminName}</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">{footerSubtitle(session)}</p>
          </div>
        </div>
        <p className="sr-only">Signed in as {session.adminName} {"\u00b7"} {footerSubtitle(session)}</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
