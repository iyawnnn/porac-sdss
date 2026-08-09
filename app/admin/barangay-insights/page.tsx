import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type { BarangayInsightsResponse } from "@/lib/types/admin-barangay-insights";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import { BarangayInsightsWorkspace } from "@/components/features/admin/barangay-insights/BarangayInsightsWorkspace";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { Skeleton } from "@/components/ui/skeleton";

async function BarangayInsightsData({ query }: { query: Record<string, string | undefined> }) {
  const session = await getAdminSessionFromApi();
  const office = query.office === "MEO" || query.office === "MDRRMO" ? query.office : undefined;
  const qs = office ? `?office=${office}` : "";

  let initialData: BarangayInsightsResponse;
  try {
    initialData = await apiGet<BarangayInsightsResponse>(`/admin/barangay-insights${qs}`);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="Barangay Insights couldn't load live data from the API. The Dashboard and Ticket Queue are unaffected — try reloading this page in a moment."
        title="Barangay Insights Unavailable"
      />
    );
  }

  return (
    <BarangayInsightsWorkspace
      initialData={initialData}
      isSystemAdmin={session ? isSystemAdmin(session) : false}
      sessionOffice={session?.office ?? undefined}
    />
  );
}

function BarangayInsightsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default async function AdminBarangayInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <Suspense fallback={<BarangayInsightsSkeleton />}>
      <BarangayInsightsData query={query} />
    </Suspense>
  );
}
