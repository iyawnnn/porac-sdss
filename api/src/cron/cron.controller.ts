import { Controller, Post, UseGuards } from '@nestjs/common';
import { OperationalPriorityService } from '../domain/operational-priority.service';
import { RateLimitService } from '../domain/ratelimit.service';
import { PasswordResetService } from '../citizens/password-reset.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CronSecretGuard } from '../common/guards/cron-secret.guard';

// Manual/testing trigger, not a Vercel cron schedule — Hobby plan only
// allows once-daily cron (see app/api/cron/recompute/route.ts, the
// single-endpoint predecessor of these routes). All four routes are also
// called daily by .github/workflows/cron.yml as a safety net — see that
// file for the schedule and required secrets.
// POST /cron/recompute-urgency and POST /cron/recompute-weather (Hazard
// Urgency and its live rain reading) were retired in manuscript revision
// Phase 1, step 7a; recompute-priority replaces them.
@UseGuards(CronSecretGuard)
@Controller('cron')
export class CronController {
  constructor(
    private readonly operationalPriority: OperationalPriorityService,
    private readonly passwordReset: PasswordResetService,
    private readonly notifications: NotificationsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // Recalculates Operational Priority (priority_index) for active tickets —
  // the same pass the admin list/detail/dashboard reads run on demand.
  @Post('recompute-priority')
  async recomputePriority() {
    const priority = await this.operationalPriority.recalculateActiveTickets();
    return { operationalPriorityUpdated: priority.updated };
  }

  // Prunes expired/long-used password_reset_tokens rows so the table stays
  // small — also called daily by .github/workflows/cron.yml.
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
