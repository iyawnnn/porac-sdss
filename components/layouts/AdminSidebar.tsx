"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Ticket, Map, ShieldAlert, type LucideIcon } from "lucide-react";
import type { AdminSession } from "@/lib/auth/session";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import OfficeScopeToggle from "@/components/features/admin/shared/OfficeScopeToggle";
import SignOutButton from "@/components/features/admin/auth/SignOutButton";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Main workspace",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tickets", label: "Ticket Queue", icon: Ticket },
      { href: "/admin/map", label: "Interactive Map", icon: Map },
    ],
  },
  {
    heading: "Moderation",
    items: [{ href: "/admin/flagged", label: "Flagged Reports", icon: ShieldAlert }],
  },
];

// "/admin" only matches its own exact path — every other link also matches
// its nested routes (e.g. /admin/tickets/42) so the parent nav item stays
// highlighted on detail pages.
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = item.icon;
  return (
    <SidebarMenuButton asChild isActive={active}>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (isMobile) setOpenMobile(false);
        }}
      >
        <Icon size={18} strokeWidth={1.75} />
        <span>{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export default function AdminSidebar({ session }: { session: AdminSession }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 py-3">
        <span className="px-1 text-sm font-semibold tracking-tight text-sidebar-foreground">
          PORAC-SDSS
        </span>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Admin">
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.heading}>
            <SidebarGroupLabel>{section.heading}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <NavLink item={item} active={isActivePath(pathname, item.href)} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="gap-2 px-2 pb-3">
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5">
          <Avatar size="sm">
            <AvatarFallback>{initials(session.adminName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-sidebar-foreground">{session.adminName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{session.office} · {session.role}</p>
          </div>
        </div>

        <OfficeScopeToggle myOffice={session.office} />
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
