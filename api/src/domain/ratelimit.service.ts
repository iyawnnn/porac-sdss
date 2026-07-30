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

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
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
}
