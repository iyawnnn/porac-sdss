import Link from "next/link";
import type { AdminSession } from "@/lib/auth/session";
import OfficeScopeToggle from "./OfficeScopeToggle";
import SignOutButton from "./SignOutButton";

const NAV_LINKS = [
  { href: "/admin/tickets", label: "Tickets" },
  { href: "/admin/map", label: "Map" },
  { href: "/admin/flagged", label: "Flagged" },
];

// Persistent nav across /admin/* — none existed before (DESIGN.md §6.1),
// so moving between admin pages meant editing the URL by hand.
export default function AdminShell({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line-200 bg-surface">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-mono text-sm font-semibold tracking-tight text-ink-900">
              porac-sdss-nextjs
            </span>
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 rounded-md text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <OfficeScopeToggle myOffice={session.office} />
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-line-100 text-ink-500">
              {session.office}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
