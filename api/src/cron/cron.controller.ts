import { Controller, Post, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { OperationalPriorityService } from '../domain/operational-priority.service';
import { WeatherService } from '../domain/weather.service';
import { RateLimitService } from '../domain/ratelimit.service';
import { PasswordResetService } from '../citizens/password-reset.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CronSecretGuard } from '../common/guards/cron-secret.guard';

// Manual/testing trigger, not a Vercel cron schedule — Hobby plan only
// allows once-daily cron, which would defeat the "live re-ranking as a
// storm moves in" behavior (see app/api/cron/recompute/route.ts, the
// single-endpoint predecessor this splits into two explicit triggers).
// All five routes are now also called daily by .github/workflows/cron.yml
// as a safety net — see that file for the schedule and required secrets.
@UseGuards(CronSecretGuard)
@Controller('cron')
export class CronController {
  constructor(
    private readonly recompute: RecomputeService,
    private readonly operationalPriority: OperationalPriorityService,
    private readonly weather: WeatherService,
    private readonly passwordReset: PasswordResetService,
    private readonly notifications: NotificationsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // Still one route for both scores so .github/workflows/cron.yml keeps
  // working unchanged. Response keeps { updated, rain1hMm } (Hazard
  // Urgency) and adds operationalPriorityUpdated. Run one after the other,
  // not in parallel, so the two UPDATEs never race on the same rows.
  @Post('recompute-urgency')
  async recomputeUrgency() {
    const urgency = await this.recompute.recomputeActiveTicketUrgency();
    const priority = await this.operationalPriority.recalculateActiveTickets();
    return { ...urgency, operationalPriorityUpdated: priority.updated };
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

  // Prunes expired/long-used password_reset_tokens rows so the table stays
  // small — nothing schedules this yet, same as the two triggers above.
  @Post('cleanup-password-reset-tokens')
  async cleanupPasswordResetTokens() {
    await this.passwordReset.cleanupExpiredTokens();
    return { ok: true };
  }

  // Prunes read notifications older than 30 days — unread ones are kept
  // regardless of age until actually read, same shape as the job above.
  @Post('cleanup-notifications')
  async cleanupNotifications() {
    await this.notifications.cleanupOldNotifications();
    return { ok: true };
  }

  // Prunes rate_limit_events / password_reset_rate_limit_events /
  // admin_login_rate_limit_events rows older than the 30-day retention
  // window — see RateLimitService for why that's safe (every table's checks
  // only ever look back 24 hours at most).
  @Post('cleanup-rate-limit-events')
  cleanupRateLimitEvents() {
    return this.rateLimit.cleanupOldEvents();
  }

  // POST /cron/check-ticket-escalations (the 7-day escalation job) was
  // removed in manuscript revision Phase 1, step 2 — the manuscript keeps
  // 7 days only as Operational Priority's age cap, never as an escalation
  // rule (p. 74). Existing ticket_escalation notifications are kept and
  // still render as history; nothing creates new ones.
}
