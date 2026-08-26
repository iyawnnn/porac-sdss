import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { WeatherService } from '../domain/weather.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { isSystemAdmin, resolveOfficeScope } from '../common/authz/admin-scope';
import {
  DashboardService,
  parseDashboardRange,
} from './dashboard.service';
import { TicketsService } from './tickets.service';
import { BarangaysGeoService } from './barangays-geo.service';
import { ModerationService } from './moderation.service';
import { WorkOrdersService } from './work-orders.service';
import type { OfficePerformanceCounts, OfficePerformanceSummary } from './dashboard.service';

@UseGuards(AdminSessionGuard)
@Controller('admin')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly tickets: TicketsService,
    private readonly recompute: RecomputeService,
    private readonly weather: WeatherService,
    private readonly barangaysGeo: BarangaysGeoService,
    private readonly moderation: ModerationService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  // Combines the office-scoped ticket/work-order/moderation counts that
  // already exist as separate service methods — no new query engine, just
  // one more assembly point over data these services already compute.
  // Never touches work_orders.notes or any other note body.
  private async officeCounts(
    scopedOffice: 'MEO' | 'MDRRMO' | undefined,
  ): Promise<OfficePerformanceCounts> {
    const [workOrderCounts, kpis, moderationStats] = await Promise.all([
      this.workOrders.getOfficePerformanceCounts(scopedOffice),
      this.dashboard.getDashboardKpis(scopedOffice),
      this.moderation.getModerationStats(scopedOffice),
    ]);
    return {
      ...workOrderCounts,
      highUrgencyOpenTickets: kpis.high_urgency_count,
      flaggedReportsPending: moderationStats.pending,
    };
  }

  private async getOfficePerformanceSummary(
    office: 'MEO' | 'MDRRMO' | undefined,
  ): Promise<OfficePerformanceSummary> {
    // office is undefined only for a system admin viewing city-wide
    // (resolveOfficeScope always resolves a concrete office for MEO/MDRRMO
    // admins) — see api/src/common/authz/admin-scope.ts. The MEO/MDRRMO
    // breakdown is the same "only for a system admin, city-wide" rule the
    // existing departmentWorkload card already follows.
    const [scoped, byOffice] = await Promise.all([
      this.officeCounts(office),
      office
        ? Promise.resolve(null)
        : Promise.all([this.officeCounts('MEO'), this.officeCounts('MDRRMO')]).then(
            ([MEO, MDRRMO]) => ({ MEO, MDRRMO }),
          ),
    ]);

    return { scope: office ?? 'ALL', ...scoped, byOffice };
  }

  @Get('dashboard')
  async getDashboard(
    @Query('range') rangeParam: string | undefined,
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const range = parseDashboardRange(rangeParam);
    await this.recompute.recomputeActiveTicketUrgency();

    const requestedOffice =
      officeParam === 'all' || officeParam === 'MEO' || officeParam === 'MDRRMO'
        ? officeParam
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);

    const [
      kpis,
      leaderboard,
      categories,
      incidentTrend,
      activeTicketTrend,
      pendingWorkOrderTrend,
      statusDistribution,
      departmentWorkload,
      citizenSeverityDistribution,
      topUrgencyQueueData,
      rain1hMm,
      officePerformanceSummary,
      needsAttention,
      deltas,
    ] = await Promise.all([
      this.dashboard.getDashboardKpis(office),
      this.dashboard.getBarangayRiskRanking(5, office),
      this.dashboard.getCategoryDistribution(5, office),
      this.dashboard.getIncidentTrend(range, office),
      // Point-in-time histories backing the two KPI sparklines. Same range
      // and office scope as every other series here, so the last point of
      // each agrees with the matching KPI count above.
      this.dashboard.getActiveTicketTrend(range, office),
      this.dashboard.getPendingWorkOrderTrend(range, office),
      this.dashboard.getStatusDistribution(office),
      // Cross-office comparison — only meaningful (and only shown) to a
      // system admin; an office admin's own KPIs above already cover them.
      isSystemAdmin(admin) ? this.dashboard.getDepartmentWorkload() : null,
      this.dashboard.getCitizenSeverityDistribution(office),
      this.tickets.getTicketsForAdmin({
        office,
        status: 'active',
        sort: 'priority_desc',
        limit: 5,
        page: 1,
      }),
      this.weather.getCurrentRain1hMm(),
      this.getOfficePerformanceSummary(office),
      this.workOrders.getNeedsAttention(office),
      // Week-over-week KPI comparison. Fixed 7-day baseline, deliberately
      // independent of `range` — see DashboardService.getKpiDeltas.
      this.dashboard.getKpiDeltas(office),
    ]);

    return {
      kpis,
      leaderboard,
      categories,
      incidentTrend,
      activeTicketTrend,
      pendingWorkOrderTrend,
      statusDistribution,
      departmentWorkload,
      citizenSeverityDistribution,
      // Top active tickets by the existing urgency-derived priority_score.
      topUrgencyQueue: topUrgencyQueueData.tickets,
      range,
      rain1hMm,
      deltas,
      officePerformanceSummary,
      needsAttention,
    };
  }

  @Get('barangays/geo')
  barangaysGeoJson() {
    return this.barangaysGeo.getBarangaysGeoJson();
  }
}
