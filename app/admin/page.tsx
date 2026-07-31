import { apiGet } from "@/lib/api-client";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import type { DashboardKpis, BarangayRiskRow, CategoryDistributionRow } from "@/lib/types/admin-dashboard";
import { DashboardClient } from "@/components/features/admin/dashboard/DashboardClient";

interface DashboardResponse {
  kpis: DashboardKpis;
  leaderboard: BarangayRiskRow[];
  categories: CategoryDistributionRow[];
  criticalQueue: AdminTicketRow[];
  rain1hMm: number;
}

export default async function AdminDashboardPage() {
  const { kpis, leaderboard, categories, criticalQueue, rain1hMm } = await apiGet<DashboardResponse>("/admin/dashboard");

  return (
    <DashboardClient
      kpis={kpis}
      leaderboard={leaderboard}
      categories={categories}
      criticalQueue={criticalQueue}
      rain1hMm={rain1hMm}
    />
  );
}
