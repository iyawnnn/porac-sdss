"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Ticket, Map, ShieldAlert, UserCheck, Menu, X, type LucideIcon } from "lucide-react";
import type { AdminSession } from "@/lib/auth/session";
import OfficeScopeToggle from "./OfficeScopeToggle";
import SignOutButton from "./SignOutButton";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "MAIN WORKSPACE",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tickets", label: "Ticket Queue", icon: Ticket },
      { href: "/admin/map", label: "Interactive Map", icon: Map },
    ],
  },
  {
    heading: "MODERATION",
    items: [{ href: "/admin/flagged", label: "Flagged Reports", icon: ShieldAlert }],
  },
];

const SECTION_HEADING_CLASS = "px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500";

// "/admin" only matches its own exact path — every other link also matches
// its nested routes (e.g. /admin/tickets/42) so the parent nav item stays
// highlighted on detail pages.
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
        active
          ? "rounded-r-md border-l-2 border-indigo-500 bg-slate-800/80 font-medium text-white"
          : "rounded-md text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
      }`}
    >
      <Icon size={18} strokeWidth={1.75} className="flex-shrink-0" />
      {item.label}
    </Link>
  );
}

export default function AdminSidebar({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line-200 bg-surface px-4 py-3 md:hidden">
        <span className="text-sm font-bold tracking-tight text-ink-900">PORAC-SDSS</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          className="rounded-md border border-line-200 p-1.5 text-ink-700"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800/80 bg-slate-950 p-4 text-slate-100 transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-1">
          <p className="text-base font-bold tracking-tight text-slate-100">PORAC-SDSS</p>
        </div>

        <nav className="mt-8 flex-1 space-y-6 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.heading}>
              <p className={SECTION_HEADING_CLASS}>{section.heading}</p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-800/80 px-2 pt-4">
          <div className="flex items-center gap-2 rounded-md border border-slate-700/50 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-300">
            <UserCheck size={16} strokeWidth={1.75} className="flex-shrink-0 text-slate-400" />
            {session.office} Administrator
          </div>
          <div className="mt-1.5">
            <OfficeScopeToggle myOffice={session.office} />
          </div>

          <div className="mt-3 space-y-1">
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
