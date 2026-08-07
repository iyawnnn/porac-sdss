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

@UseGuards(AdminSessionGuard)
@Controller('admin')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly tickets: TicketsService,
    private readonly recompute: RecomputeService,
    private readonly weather: WeatherService,
    private readonly barangaysGeo: BarangaysGeoService,
  ) {}

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
      statusDistribution,
      departmentWorkload,
      citizenSeverityDistribution,
      topUrgencyQueueData,
      rain1hMm,
    ] = await Promise.all([
      this.dashboard.getDashboardKpis(office),
      this.dashboard.getBarangayRiskRanking(5, office),
      this.dashboard.getCategoryDistribution(5, office),
      this.dashboard.getIncidentTrend(range, office),
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
    ]);

    return {
      kpis,
      leaderboard,
      categories,
      incidentTrend,
      statusDistribution,
      departmentWorkload,
      citizenSeverityDistribution,
      // Top active tickets by the existing urgency-derived priority_score.
      topUrgencyQueue: topUrgencyQueueData.tickets,
      range,
      rain1hMm,
    };
  }

  @Get('barangays/geo')
  barangaysGeoJson() {
    return this.barangaysGeo.getBarangaysGeoJson();
  }
}
