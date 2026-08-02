import { Suspense } from "react";
import { apiGet } from "@/lib/api-client";
import type {
  BarangayRiskRow,
  CategoryDistributionRow,
  DashboardKpis,
  DistributionRow,
  IncidentTrendRow,
  DashboardRange,
} from "@/lib/types/admin-dashboard";
import { DashboardClient } from "@/components/features/admin/dashboard/DashboardClient";
import { DashboardError, DashboardSkeleton } from "@/components/features/admin/dashboard/DashboardStates";

interface DashboardResponse {
  kpis: DashboardKpis;
  leaderboard: BarangayRiskRow[];
  categories: CategoryDistributionRow[];
  incidentTrend: IncidentTrendRow[];
  statusDistribution: DistributionRow[];
  departmentWorkload: DistributionRow[];
  citizenSeverityDistribution: DistributionRow[];
  range: DashboardRange;
}

async function DashboardData() {
  let data: DashboardResponse;
  try {
    data = await apiGet<DashboardResponse>("/admin/dashboard");
  } catch (err) {
    return <DashboardError detail={err instanceof Error ? err.message : undefined} />;
  }
  return <DashboardClient initialData={data} />;
}

export default function AdminDashboardPage() {
  return <Suspense fallback={<DashboardSkeleton />}><DashboardData /></Suspense>;
}
