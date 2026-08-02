"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";

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
      className="group flex w-full items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      {isAll ? `View my office (${myOffice})` : "View full city"}
      <Globe aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
