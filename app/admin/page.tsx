import { apiGet } from "@/lib/api-client";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import type { DashboardKpis, BarangayRiskRow, CategoryDistributionRow } from "@/lib/types/admin-dashboard";
import { DashboardClient } from "@/components/features/admin/dashboard/DashboardClient";

interface DashboardResponse {
  kpis: DashboardKpis;
  leaderboard: BarangayRiskRow[];
  categories: CategoryDistributionRow[];
  topUrgencyQueue: AdminTicketRow[];
  rain1hMm: number;
}

export default async function AdminDashboardPage() {
  const { kpis, leaderboard, categories, topUrgencyQueue, rain1hMm } = await apiGet<DashboardResponse>("/admin/dashboard");

  return (
    <DashboardClient
      kpis={kpis}
      leaderboard={leaderboard}
      categories={categories}
      topUrgencyQueue={topUrgencyQueue}
      rain1hMm={rain1hMm}
    />
  );
}
