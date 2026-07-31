import { Controller, Post, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { WeatherService } from '../domain/weather.service';
import { CronSecretGuard } from './cron-secret.guard';

// Manual/testing trigger, not a Vercel cron schedule — Hobby plan only
// allows once-daily cron, which would defeat the "live re-ranking as a
// storm moves in" behavior (see app/api/cron/recompute/route.ts, the
// single-endpoint predecessor this splits into two explicit triggers).
@UseGuards(CronSecretGuard)
@Controller('cron')
export class CronController {
  constructor(
    private readonly recompute: RecomputeService,
    private readonly weather: WeatherService,
  ) {}

  @Post('recompute-urgency')
  recomputeUrgency() {
    return this.recompute.recomputeActiveTicketUrgency();
  }

  // getCurrentRain1hMm() already does the "poll + cache" work itself (10min
  // TTL in the `config` table, see domain/weather.service.ts) — calling it
  // here just forces that refresh on demand instead of waiting for the next
  // reader to trigger it.
  @Post('recompute-weather')
  async recomputeWeather() {
    const rain1hMm = await this.weather.getCurrentRain1hMm();
    return { rain1hMm };
  }
}
