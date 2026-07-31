// Query functions (getDashboardKpis, getBarangayRiskRanking,
// getCategoryDistribution) were ported to api/src/admin/dashboard.service.ts
// (NestJS) — see PLAN blueprint Phase 4/8. This file now only carries the
// row shapes that client components still `import type`.
export interface DashboardKpis {
  active_count: number;
  critical_count: number;
  avg_resolution_hours_30d: number | null;
  resolved_24h_count: number;
}

export interface BarangayRiskRow {
  barangay_id: number;
  barangay_name: string;
  active_count: number;
  avg_priority: number | null;
}

export interface CategoryDistributionRow {
  category: string;
  active_count: number;
}
