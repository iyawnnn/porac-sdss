"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Same toggle on every admin page (was duplicated inline on
// admin/tickets/page.tsx and admin/map/MapClient.tsx — DESIGN.md §6.1).
// Driven by the raw `office` param rather than session-resolved office:
// "View full city" shows unless already viewing all (default view and an
// explicit ?office=MEO/MDRRMO override both count as "not all yet").
export default function OfficeScopeToggle({ myOffice }: { myOffice: "MEO" | "MDRRMO" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAll = searchParams.get("office") === "all";

  return (
    <Link
      href={isAll ? pathname : `${pathname}?office=all`}
      className="text-sm text-brand-600 hover:text-brand-700 underline underline-offset-2"
    >
      {isAll ? `View my office (${myOffice})` : "View full city"}
    </Link>
  );
}
