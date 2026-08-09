import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { DashboardKpis, DistributionRow, OfficePerformanceSummary } from "@/lib/types/admin-dashboard";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { ReportsWorkspace } from "@/components/features/admin/reports/ReportsWorkspace";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardSummary {
  kpis: DashboardKpis;
  statusDistribution: DistributionRow[];
  officePerformanceSummary: OfficePerformanceSummary;
}

async function ReportsData({ query }: { query: Record<string, string | undefined> }) {
  const session = await getAdminSessionFromApi();

  const office = query.office === "MEO" || query.office === "MDRRMO" ? query.office : session?.office ?? undefined;
  const qs = office ? `?office=${office}` : "";

  let initialSummary: DashboardSummary;
  try {
    initialSummary = await apiGet<DashboardSummary>(`/admin/dashboard${qs}`);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="Reports & Exports couldn't load live summary data from the API. Ticket and Work Order exports below are unaffected — try reloading this page in a moment."
        title="Reports Summary Unavailable"
      />
    );
  }

  return (
    <ReportsWorkspace
      initialQuery={query}
      initialSummary={initialSummary}
      isSystemAdmin={session ? isSystemAdmin(session) : false}
      sessionOffice={session?.office ?? undefined}
    />
  );
}

function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<ReportsSkeleton />}>
      <ReportsData query={query} />
    </Suspense>
  );
}
