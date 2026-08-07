import { Suspense } from "react";
import { notFound } from "next/navigation";
import { apiGetOptional } from "@/lib/api-client";
import type { PaginatedAdminAudit } from "@/lib/types/admin-audit";
import { ActivityLogWorkspace } from "@/components/features/admin/activity-log/ActivityLogWorkspace";
import { ActivityLogSkeleton } from "@/components/features/admin/activity-log/ActivityLogSkeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

async function ActivityLogData({ query }: { query: Record<string, string | undefined> }) {
  const qs = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  let data: PaginatedAdminAudit | null;
  try {
    // SystemAdminGuard rejects office-scoped admins with 403 — treated the
    // same as a missing page (notFound), matching /admin/admins: there is
    // no partial, office-scoped view of the activity log to fall back to.
    data = await apiGetOptional<PaginatedAdminAudit>(`/admin/activity-log${qs ? `?${qs}` : ""}`, [401, 403]);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The activity log couldn't load live data from the API. Try reloading this page in a moment."
        title="Activity Log Unavailable"
      />
    );
  }
  if (!data) notFound();
  return <ActivityLogWorkspace initialData={data} initialQuery={query} />;
}

export default async function AdminActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<ActivityLogSkeleton />}>
      <ActivityLogData query={query} />
    </Suspense>
  );
}
