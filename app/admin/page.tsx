import { getDashboardKpis, getBarangayRiskRanking, getCategoryDistribution } from "@/lib/admin/dashboard";
import { getTicketsForAdmin } from "@/lib/admin/tickets";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";
import { getCurrentRain1hMm } from "@/lib/weather/openweather";
import { DashboardClient } from "./DashboardClient";

export default async function AdminDashboardPage() {
  await recomputeActiveTicketUrgency();

  const [kpis, leaderboard, categories, criticalQueueData, rain1hMm] = await Promise.all([
    getDashboardKpis(),
    getBarangayRiskRanking(5),
    getCategoryDistribution(),
    getTicketsForAdmin({ status: "active", sort: "priority_desc", limit: 5, page: 1 }),
    getCurrentRain1hMm(),
  ]);

  return (
    <DashboardClient
      kpis={kpis}
      leaderboard={leaderboard}
      categories={categories}
      criticalQueue={criticalQueueData.tickets}
      rain1hMm={rain1hMm}
    />
  );
}
