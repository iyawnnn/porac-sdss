import { Controller, Post, UseGuards } from '@nestjs/common';
import { RecomputeService } from '../domain/recompute.service';
import { WeatherService } from '../domain/weather.service';
import { RateLimitService } from '../domain/ratelimit.service';
import { EscalationService } from '../domain/escalation.service';
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
    private readonly weather: WeatherService,
    private readonly passwordReset: PasswordResetService,
    private readonly notifications: NotificationsService,
    private readonly rateLimit: RateLimitService,
    private readonly escalation: EscalationService,
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

  // Prunes rate_limit_events / password_reset_rate_limit_events rows older
  // than the 30-day retention window — see RateLimitService for why that's
  // safe (both tables' checks only ever look back 24 hours at most).
  @Post('cleanup-rate-limit-events')
  cleanupRateLimitEvents() {
    return this.rateLimit.cleanupOldEvents();
  }

  // Escalates active tickets (Reported/Under Review/In Progress) that have
  // sat for 7+ days with no work order that ever reached in_progress/
  // completed — a ticket_escalation notification to the assigned office,
  // never a status/scoring change. See EscalationService for the full rule
  // and its duplicate-prevention behavior.
  @Post('check-ticket-escalations')
  checkTicketEscalations() {
    return this.escalation.checkTicketEscalations();
  }
}
