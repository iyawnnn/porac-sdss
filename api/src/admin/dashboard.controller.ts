import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { WeatherService } from '../domain/weather.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
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
  async getDashboard(@Query('range') rangeParam?: string) {
    const range = parseDashboardRange(rangeParam);
    await this.recompute.recomputeActiveTicketUrgency();

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
      this.dashboard.getDashboardKpis(),
      this.dashboard.getBarangayRiskRanking(5),
      this.dashboard.getCategoryDistribution(5),
      this.dashboard.getIncidentTrend(range),
      this.dashboard.getStatusDistribution(),
      this.dashboard.getDepartmentWorkload(),
      this.dashboard.getCitizenSeverityDistribution(),
      this.tickets.getTicketsForAdmin({
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
