import { apiGet } from "@/lib/api-client";
import type { FocalDashboardCounts, FocalDashboardReports } from "@/lib/types/admin-focal-dashboard";
import { FocalDashboard } from "@/components/features/admin/focal/FocalDashboard";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

export default async function FocalDashboardPage({ searchParams }: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.page) params.set("page", query.page);
  if (query.pageSize) params.set("pageSize", query.pageSize);
  let counts: FocalDashboardCounts;
  let reports: FocalDashboardReports;
  try {
    [counts, reports] = await Promise.all([
      apiGet<FocalDashboardCounts>("/admin/focal-dashboard"),
      apiGet<FocalDashboardReports>(`/admin/focal-dashboard/reports?${params}`),
    ]);
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="The Focal Dashboard couldn't load live data from the API. Try reloading this page in a moment."
        title="Focal Dashboard Unavailable"
      />
    );
  }

  return <FocalDashboard counts={counts} reportsPage={reports} />;
}
