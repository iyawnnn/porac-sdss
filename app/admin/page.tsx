import { Suspense } from "react";
import { apiGet, getAdminSessionFromApi } from "@/lib/api-client";
import type {
  BarangayRiskRow,
  CategoryDistributionRow,
  CountTrendRow,
  DashboardKpis,
  DistributionRow,
  IncidentTrendRow,
  DashboardRange,
  OfficePerformanceSummary,
  NeedsAttention,
} from "@/lib/types/admin-dashboard";
import type { AdminTicketRow, PaginatedTickets } from "@/lib/types/admin-tickets";
import { DashboardClient } from "@/components/features/admin/dashboard/DashboardClient";
import { DashboardError, DashboardSkeleton } from "@/components/features/admin/dashboard/DashboardStates";

interface DashboardResponse {
  kpis: DashboardKpis;
  leaderboard: BarangayRiskRow[];
  categories: CategoryDistributionRow[];
  incidentTrend: IncidentTrendRow[];
  activeTicketTrend: CountTrendRow[];
  pendingWorkOrderTrend: CountTrendRow[];
  statusDistribution: DistributionRow[];
  // null for office-scoped admins — cross-office comparison is System
  // Administrator only, see api/src/admin/dashboard.controller.ts.
  departmentWorkload: DistributionRow[] | null;
  citizenSeverityDistribution: DistributionRow[];
  officePerformanceSummary: OfficePerformanceSummary;
  needsAttention: NeedsAttention;
  range: DashboardRange;
}

async function DashboardData() {
  // The dashboard endpoint's own response has no general ticket-level list
  // suitable for the "Highest Urgency Actions" table (its needsAttention
  // lists are narrowly scoped to work-order status, not general urgency) —
  // so this reuses the exact endpoint/params the Ticket Queue already
  // calls. Settled independently from the dashboard fetch: a failure here
  // degrades just that one table, it must not take down the whole dashboard.
  //
  // limit=10, not 5: TicketsService.parseTicketQuery only accepts
  // PAGE_LIMITS = [10, 15, 25, 50] (tickets.service.ts) and silently falls
  // back to DEFAULT_PAGE_LIMIT (15) for any other value — an earlier
  // version of this fetch asked for limit=5/8 and got 15 back every time
  // without erroring. 10 is the smallest value the API actually honors;
  // the dashboard table itself slices to the 5 it wants to display.
  const [dashboardResult, ticketsResult, session] = await Promise.allSettled([
    apiGet<DashboardResponse>("/admin/dashboard"),
    apiGet<PaginatedTickets>("/admin/tickets?sort=priority_desc&status=active&limit=10"),
    getAdminSessionFromApi(),
  ]);

  if (dashboardResult.status === "rejected") {
    const err = dashboardResult.reason;
    return <DashboardError detail={err instanceof Error ? err.message : undefined} />;
  }

  const topPriorityTickets: AdminTicketRow[] | null = ticketsResult.status === "fulfilled" ? ticketsResult.value.tickets.slice(0, 5) : null;
  const adminName = session.status === "fulfilled" ? (session.value?.adminName ?? null) : null;

  return <DashboardClient adminName={adminName} initialData={dashboardResult.value} topPriorityTickets={topPriorityTickets} />;
}

export default function AdminDashboardPage() {
  return <Suspense fallback={<DashboardSkeleton />}><DashboardData /></Suspense>;
}
