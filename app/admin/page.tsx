import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import { isSystemAdmin } from "@/lib/utils/adminScope";
import type {
  BarangayRiskRow,
  CategoryDistributionRow,
  DashboardKpis,
  DistributionRow,
  IncidentTrendRow,
  DashboardRange,
  OfficePerformanceSummary,
} from "@/lib/types/admin-dashboard";
import { DashboardClient } from "@/components/features/admin/dashboard/DashboardClient";
import { DashboardError, DashboardSkeleton } from "@/components/features/admin/dashboard/DashboardStates";

interface DashboardResponse {
  kpis: DashboardKpis;
  leaderboard: BarangayRiskRow[];
  categories: CategoryDistributionRow[];
  incidentTrend: IncidentTrendRow[];
  statusDistribution: DistributionRow[];
  // null for office-scoped admins — cross-office comparison is System
  // Administrator only, see api/src/admin/dashboard.controller.ts.
  departmentWorkload: DistributionRow[] | null;
  citizenSeverityDistribution: DistributionRow[];
  officePerformanceSummary: OfficePerformanceSummary;
  range: DashboardRange;
}

async function DashboardData() {
  const session = await getAdminSessionFromApi();
  let data: DashboardResponse;
  try {
    data = await apiGet<DashboardResponse>("/admin/dashboard");
  } catch (err) {
    return <DashboardError detail={err instanceof Error ? err.message : undefined} />;
  }
  return <DashboardClient initialData={data} isSystemAdmin={session ? isSystemAdmin(session) : false} />;
}

export default function AdminDashboardPage() {
  return <Suspense fallback={<DashboardSkeleton />}><DashboardData /></Suspense>;
}
