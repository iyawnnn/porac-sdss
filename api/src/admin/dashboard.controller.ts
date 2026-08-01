import { Controller, Get, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { WeatherService } from '../domain/weather.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { DashboardService } from './dashboard.service';
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

  // Shape matches app/admin/page.tsx's current SSR composition exactly, so
  // Phase 8's SSR cutover is a drop-in fetch swap.
  @Get('dashboard')
  async getDashboard() {
    await this.recompute.recomputeActiveTicketUrgency();

    const [kpis, leaderboard, categories, topUrgencyQueueData, rain1hMm] =
      await Promise.all([
        this.dashboard.getDashboardKpis(),
        this.dashboard.getBarangayRiskRanking(5),
        this.dashboard.getCategoryDistribution(),
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
      // Top 5 active tickets by urgency-derived priority_score, not a
      // threshold-filtered "critical" set — name reflects sort order, not
      // any urgency_band/urgency_level filter.
      topUrgencyQueue: topUrgencyQueueData.tickets,
      rain1hMm,
    };
  }

  @Get('barangays/geo')
  barangaysGeoJson() {
    return this.barangaysGeo.getBarangaysGeoJson();
  }
}
