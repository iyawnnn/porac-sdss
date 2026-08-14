import { Inject, Injectable } from '@nestjs/common';
import type postgres from 'postgres';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

// Postgres-backed (not in-memory, not Upstash Redis): this app already has
// a persistent Postgres connection, so a rate_limit_events table survives
// serverless cold starts / Render sleep-restarts for free — no new service,
// no new account, no new env vars. Upstash would be the better call at
// higher request volume where per-request DB round trips start to matter;
// this app's volume (a thesis prototype) doesn't get there.
//
// PLAN.md §9's original spec, now that citizen accounts exist: 5/hour and
// 3-within-25m/24h per account are the PRIMARY controls (account identity
// can't be evaded by switching networks the way an IP can). The looser
// 20/hour-per-IP limit stays on as a secondary backstop — it still catches
// a single IP spinning up many accounts to route around the account limit.
const ACCOUNT_HOURLY_LIMIT = 5;
const ACCOUNT_SPATIAL_LIMIT = 3;
const SPATIAL_RADIUS_M = 25;
const IP_HOURLY_BACKSTOP = 20;

// Forgot-password (POST /citizens/forgot-password): email is the primary
// control here (closer to "account identity" than an IP is, same reasoning
// as ACCOUNT_HOURLY_LIMIT above), IP is the secondary backstop against a
// single network probing many addresses. Tighter than the report limits
// since this is a pre-authentication, security-sensitive endpoint.
const PASSWORD_RESET_EMAIL_HOURLY_LIMIT = 3;
const PASSWORD_RESET_IP_HOURLY_LIMIT = 10;

// Admin login (R1): keyed on normalized email, never IP — an IP-based total-
// login limit would break the E2E suite, which authenticates from one IP
// nearly 200 times per run. Only failed attempts are recorded, so a
// legitimate admin who logs in successfully never contributes to this
// count. Suggested by the R1 hardening-plan writeup: enough headroom for a
// few mistyped passwords, tight enough to make online guessing impractical.
// 15-minute window is a fixed SQL-literal interval in the query below (see
// checkAdminLoginRateLimit) rather than a bound parameter, matching every
// other check method in this file — keep the two in sync if either changes.
const ADMIN_LOGIN_FAILURE_LIMIT = 10;

// The longest active window either table's checks ever query is 24 hours
// (checkRateLimit's spatial check, above) — 30 days is a wide safety
// margin, same convention as NotificationsService's RETENTION_DAYS.
// Anything this old can never affect a live rate-limit decision.
const RATE_LIMIT_EVENT_RETENTION_DAYS = 30;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

export interface RateLimitCleanupResult {
  rateLimitEventsDeleted: number;
  passwordResetRateLimitEventsDeleted: number;
  adminLoginRateLimitEventsDeleted: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  async checkRateLimit(
    citizenId: number,
    ip: string,
    lat: number,
    lng: number,
  ): Promise<RateLimitResult> {
    const sql = this.pg;

    const [{ count: accountHourlyCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM rate_limit_events
      WHERE citizen_id = ${citizenId} AND created_at > now() - interval '1 hour'
    `;
    if (accountHourlyCount >= ACCOUNT_HOURLY_LIMIT) {
      return {
        allowed: false,
        reason: `Too many reports from your account this hour. Try again later.`,
      };
    }

    const [{ count: accountSpatialCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM rate_limit_events
      WHERE citizen_id = ${citizenId}
        AND created_at > now() - interval '24 hours'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${SPATIAL_RADIUS_M}
        )
    `;
    if (accountSpatialCount >= ACCOUNT_SPATIAL_LIMIT) {
      return {
        allowed: false,
        reason: `Too many reports from your account near this location in the last 24 hours.`,
      };
    }

    const [{ count: ipHourlyCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM rate_limit_events
      WHERE ip = ${ip} AND created_at > now() - interval '1 hour'
    `;
    if (ipHourlyCount >= IP_HOURLY_BACKSTOP) {
      return {
        allowed: false,
        reason: `Too many reports from this network. Try again later.`,
      };
    }

    return { allowed: true };
  }

  // Called inside the same transaction as the ticket/report insert, so only
  // submissions that actually succeed count against the limit.
  async recordRateLimitEvent(
    tx: postgres.TransactionSql,
    citizenId: number,
    ip: string,
    lat: number,
    lng: number,
  ) {
    await tx`
      INSERT INTO rate_limit_events (citizen_id, ip, geom)
      VALUES (${citizenId}, ${ip}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    `;
  }

  // Independent IP + email checks (both must pass) against the dedicated
  // password_reset_rate_limit_events table — kept separate from
  // rate_limit_events because that table's geom column is NOT NULL and
  // this is a non-geo, pre-authentication event.
  async checkPasswordResetRateLimit(
    ip: string,
    normalizedEmail: string,
  ): Promise<RateLimitResult> {
    const sql = this.pg;

    const [{ count: emailHourlyCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM password_reset_rate_limit_events
      WHERE email_normalized = ${normalizedEmail} AND created_at > now() - interval '1 hour'
    `;
    if (emailHourlyCount >= PASSWORD_RESET_EMAIL_HOURLY_LIMIT) {
      return {
        allowed: false,
        reason:
          'Too many password reset requests for this email. Try again later.',
      };
    }

    const [{ count: ipHourlyCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM password_reset_rate_limit_events
      WHERE ip = ${ip} AND created_at > now() - interval '1 hour'
    `;
    if (ipHourlyCount >= PASSWORD_RESET_IP_HOURLY_LIMIT) {
      return {
        allowed: false,
        reason:
          'Too many password reset requests from this network. Try again later.',
      };
    }

    return { allowed: true };
  }

  // Records one row per *request attempt* — including attempts for emails
  // that don't exist — so probing many addresses can't dodge the email
  // limit just because the enumeration-resistant response looks identical.
  async recordPasswordResetAttempt(
    ip: string,
    normalizedEmail: string,
  ): Promise<void> {
    await this.pg`
      INSERT INTO password_reset_rate_limit_events (ip, email_normalized)
      VALUES (${ip}, ${normalizedEmail})
    `;
  }

  // Checked before the admins table is even queried, so a throttled request
  // never runs bcrypt and never records another row — the cooldown is
  // bounded to ~ADMIN_LOGIN_WINDOW_MINUTES after the failure that tripped
  // it, not indefinitely extendable by continued hammering during the
  // cooldown itself.
  async checkAdminLoginRateLimit(
    normalizedEmail: string,
  ): Promise<RateLimitResult> {
    // Fixed SQL-literal interval, not a bound JS Date — matches every other
    // check method in this file (checkRateLimit, checkPasswordResetRateLimit).
    const [{ count }] = await this.pg<{ count: number }[]>`
      SELECT count(*)::int AS count FROM admin_login_rate_limit_events
      WHERE email_normalized = ${normalizedEmail}
        AND created_at > now() - interval '15 minutes'
    `;
    if (count >= ADMIN_LOGIN_FAILURE_LIMIT) {
      return { allowed: false, reason: 'Too many failed login attempts.' };
    }
    return { allowed: true };
  }

  // Recorded for EVERY rejection reason — nonexistent email, deactivated
  // admin, wrong password — never only for real/active accounts. Otherwise
  // whether an attempt ever gets throttled would itself reveal whether the
  // email belongs to a real admin, the same enumeration side-channel
  // recordPasswordResetAttempt's identical choice avoids.
  async recordAdminLoginFailure(normalizedEmail: string): Promise<void> {
    await this.pg`
      INSERT INTO admin_login_rate_limit_events (email_normalized)
      VALUES (${normalizedEmail})
    `;
  }

  // The one place this app's rate limiting actively resets rather than only
  // letting a window expire — required so a legitimate admin who mistypes a
  // few times and then logs in correctly isn't left partway toward a
  // cooldown their next honest mistake would trigger.
  async resetAdminLoginFailures(normalizedEmail: string): Promise<void> {
    await this.pg`
      DELETE FROM admin_login_rate_limit_events WHERE email_normalized = ${normalizedEmail}
    `;
  }

  // Manual/on-demand trigger (POST /cron/cleanup-rate-limit-events), same
  // unscheduled-until-now shape as the notification/password-reset-token
  // cleanup jobs. Deletes rows old enough that they can no longer factor
  // into any live rate-limit window (see RATE_LIMIT_EVENT_RETENTION_DAYS).
  async cleanupOldEvents(): Promise<RateLimitCleanupResult> {
    const sql = this.pg;
    const cutoff = new Date(
      Date.now() - RATE_LIMIT_EVENT_RETENTION_DAYS * 86_400_000,
    );
    const [rateLimitResult, passwordResetResult, adminLoginResult] =
      await Promise.all([
        sql`DELETE FROM rate_limit_events WHERE created_at < ${cutoff}`,
        sql`DELETE FROM password_reset_rate_limit_events WHERE created_at < ${cutoff}`,
        sql`DELETE FROM admin_login_rate_limit_events WHERE created_at < ${cutoff}`,
      ]);
    return {
      rateLimitEventsDeleted: rateLimitResult.count,
      passwordResetRateLimitEventsDeleted: passwordResetResult.count,
      adminLoginRateLimitEventsDeleted: adminLoginResult.count,
    };
  }
}
