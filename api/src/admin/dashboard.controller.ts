import {
  ForbiddenException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OperationalPriorityService } from '../domain/operational-priority.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { OperationalStaffGuard } from '../common/guards/operational-staff.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { resolveOfficeScope } from '../common/authz/admin-scope';
import { DashboardService, parseDashboardRange } from './dashboard.service';
import { TicketsService } from './tickets.service';
import { BarangaysGeoService } from './barangays-geo.service';
import { ModerationService } from './moderation.service';
import { WorkOrdersService } from './work-orders.service';
import type {
  OfficePerformanceCounts,
  OfficePerformanceSummary,
} from './dashboard.service';

@UseGuards(AdminSessionGuard, OperationalStaffGuard)
@Controller('admin')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly tickets: TicketsService,
    private readonly operationalPriority: OperationalPriorityService,
    private readonly barangaysGeo: BarangaysGeoService,
    private readonly moderation: ModerationService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  // Combines the office-scoped work-order/moderation counts that already
  // exist as separate service methods — no new query engine, just one more
  // assembly point over data these services already compute. Never touches
  // work_orders.notes or any other note body. The Hazard Urgency count (and
  // the getDashboardKpis call that supplied it) was removed in manuscript
  // revision Phase 1, step 6a.
  private async officeCounts(
    scopedOffice: 'MEO' | 'MDRRMO',
  ): Promise<OfficePerformanceCounts> {
    const [workOrderCounts, moderationStats] = await Promise.all([
      this.workOrders.getOfficePerformanceCounts(scopedOffice),
      this.moderation.getModerationStats(scopedOffice),
    ]);
    return {
      ...workOrderCounts,
      flaggedReportsPending: moderationStats.pending,
    };
  }

  private async getOfficePerformanceSummary(
    office: 'MEO' | 'MDRRMO',
  ): Promise<OfficePerformanceSummary> {
    if (!office) throw new ForbiddenException('Office scope required.');
    return { scope: office, ...(await this.officeCounts(office)) };
  }

  @Get('dashboard')
  async getDashboard(
    @Query('range') rangeParam: string | undefined,
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const range = parseDashboardRange(rangeParam);
    // The Hazard Urgency recompute (and the live rain reading it returned as
    // rain1hMm) stopped running here in manuscript revision Phase 1, step 7a.
    await this.operationalPriority.recalculateActiveTickets();

    const requestedOffice =
      officeParam === 'all' || officeParam === 'MEO' || officeParam === 'MDRRMO'
        ? officeParam
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);

    const [
      kpis,
      categories,
      incidentTrend,
      activeTicketTrend,
      pendingWorkOrderTrend,
      statusDistribution,
      citizenSeverityDistribution,
      topPriorityQueueData,
      officePerformanceSummary,
      needsAttention,
      deltas,
      operationalMetrics,
    ] = await Promise.all([
      this.dashboard.getDashboardKpis(office),
      this.dashboard.getCategoryDistribution(5, office),
      this.dashboard.getIncidentTrend(range, office),
      // Point-in-time histories backing the two KPI sparklines. Same range
      // and office scope as every other series here, so the last point of
      // each agrees with the matching KPI count above.
      this.dashboard.getActiveTicketTrend(range, office),
      this.dashboard.getPendingWorkOrderTrend(range, office),
      this.dashboard.getStatusDistribution(office),
      this.dashboard.getCitizenSeverityDistribution(office),
      this.tickets.getTicketsForAdmin({
        office,
        status: 'active',
        sort: 'op_priority_desc',
        limit: 5,
        page: 1,
      }),
      this.getOfficePerformanceSummary(office),
      this.workOrders.getNeedsAttention(office),
      // Week-over-week KPI comparison. Fixed 7-day baseline, deliberately
      // independent of `range` — see DashboardService.getKpiDeltas.
      this.dashboard.getKpiDeltas(office),
      this.dashboard.getOperationalMetrics(office),
    ]);

    return {
      kpis,
      categories,
      incidentTrend,
      activeTicketTrend,
      pendingWorkOrderTrend,
      statusDistribution,
      citizenSeverityDistribution,
      operationalMetrics,
      // Top active tickets by Operational Priority (priority_index). Was
      // topUrgencyQueue, ranked by Hazard Urgency, until manuscript revision
      // Phase 1, step 4.
      topPriorityQueue: topPriorityQueueData.tickets,
      range,
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
