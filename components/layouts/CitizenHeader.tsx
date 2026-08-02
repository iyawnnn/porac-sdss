import Link from "next/link";
import type { CitizenSession } from "@/lib/auth/citizenSession";
import CitizenLogoutButton from "@/components/features/citizen/auth/CitizenLogoutButton";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/map", label: "Map" },
  { href: "/reports", label: "My Reports" },
  { href: "/report", label: "Report Hazard" },
  { href: "/account", label: "Account" },
];

export default function CitizenHeader({ session }: { session: CitizenSession }) {
  return (
    <header className="border-b border-line-200 bg-surface">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <Link href="/dashboard" className="font-mono text-sm font-semibold tracking-tight text-ink-900">
            Porac SDSS
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="max-w-[18rem] truncate rounded-full bg-line-100 px-2 py-1 text-xs font-medium text-ink-500">
            {session.email}
          </span>
          <CitizenLogoutButton />
        </div>
      </div>
    </header>
  );
}
