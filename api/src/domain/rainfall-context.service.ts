import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import type { Env } from '../config/env';
import type { AdminSession } from '../auth/session.service';
import { assertOfficeAccess } from '../common/authz/admin-scope';
import type { RainfallContextStatus } from '../db/schema';
import {
  RAINFALL_PROVIDER,
  RAINFALL_VALUE_LABEL,
  type RainfallFetchResult,
  fetchFailure,
  isRainfallCategory,
  parseCurrentWeather,
  rainfallLocationKey,
  rainfallQueryUrl,
  redactSecrets,
} from '../common/utils/rainfall-context';

// One attempt per provider call, cut off after 5 s.
export const RAINFALL_FETCH_TIMEOUT_MS = 5_000;
// A reading is reused for this long: the ticket's own current row, and the
// same-location cache across tickets (manuscript p. 72).
export const RAINFALL_REUSE_MS = 10 * 60_000;
// After a failed call, opening Ticket Detail doesn't ask again for this long.
export const RAINFALL_FAILURE_COOLDOWN_MS = 60_000;
// Staff Refresh: one per ticket per 60 s.
export const RAINFALL_REFRESH_THROTTLE_MS = 60_000;
// Superseded rows Ticket Detail lists.
const HISTORY_LIMIT = 10;
// Runs of one refresh() call: the first, plus re-runs asked for while it ran.
const MAX_RUNS = 3;

const ACTIVE_STATUSES = ['Reported', 'Under Review', 'In Progress'];

// Why a refresh runs:
//   detail      opening Ticket Detail. A current row fetched within 10
//               minutes is kept as is; no call during the failure cooldown;
//               the same-location cache may answer.
//   correction  a location or category correction. The current row is
//               always superseded and kept as history; the same-location
//               cache may answer (a category change keeps the location).
//   manual      staff Refresh. Always asks the provider (its own 60 s
//               throttle limits it).
export type RainfallRefreshReason = 'detail' | 'correction' | 'manual';

export type RainfallRefreshOutcome =
  | { outcome: 'recorded'; status: RainfallContextStatus; fromCache: boolean }
  // The ticket's current row is under 10 minutes old.
  | { outcome: 'reused' }
  // The category has no rainfall context: current rows (if any) were
  // superseded and nothing was inserted.
  | { outcome: 'not_applicable'; superseded: number }
  | {
      outcome: 'skipped';
      // changed: the ticket's category or location changed while the
      // provider answered (it is refreshed again, up to MAX_RUNS runs).
      reason:
        | 'not_found'
        | 'merged_away'
        | 'closed'
        | 'disabled'
        | 'cooldown'
        | 'changed'
        | 'error';
    };

export interface RainfallContextRow {
  id: number;
  status: RainfallContextStatus;
  // 0 is a real reading. Null only for UNAVAILABLE.
  rainfall_mm: number | null;
  source_provider: string;
  observation_at: string | null;
  fetched_at: string;
  failure_reason: string | null;
  superseded_at: string | null;
}

// applicable: an active, not merged-away Localized Flooding or Rain-Induced
// Slope Failure/Landslide ticket (legacy names too). closed_historical: such
// a ticket that is Resolved, Rejected or merged away; it keeps what it has
// and is never refreshed. not_applicable: any other category.
export type RainfallApplicability =
  'applicable' | 'not_applicable' | 'closed_historical';

// Ticket Detail's rainfallContext. Staff only: no citizen endpoint ever reads
// rainfall_context.
export interface RainfallContextView {
  applicability: RainfallApplicability;
  // "Rainfall (last hour)": what rainfall_mm is.
  valueLabel: string;
  // The current row, when it is for the ticket's present location. Null =
  // not yet fetched.
  current: RainfallContextRow | null;
  // Earlier rows, newest first (superseded rows, and a current row left at
  // an old location whose new reading hasn't landed).
  history: RainfallContextRow[];
}

interface TicketFacts {
  id: number;
  category: string;
  status: string;
  merged_into_ticket_id: number | null;
}

interface StoredRow extends RainfallContextRow {
  at_current_location: boolean;
}

interface CachedReading {
  rainfallMm: number;
  observationAt: Date;
  fetchedAt: Date;
}

export function rainfallApplicability(
  ticket: Pick<TicketFacts, 'category' | 'status' | 'merged_into_ticket_id'>,
): RainfallApplicability {
  if (!isRainfallCategory(ticket.category)) return 'not_applicable';
  if (
    ticket.merged_into_ticket_id !== null ||
    !ACTIVE_STATUSES.includes(ticket.status)
  ) {
    return 'closed_historical';
  }
  return 'applicable';
}

// Opening Ticket Detail refreshes an applicable ticket that has no current
// row, or whose current row was fetched more than 10 minutes ago.
export function isRefreshDue(
  view: Pick<RainfallContextView, 'applicability' | 'current'>,
  now: Date = new Date(),
): boolean {
  if (view.applicability !== 'applicable') return false;
  if (!view.current) return true;
  return (
    now.getTime() - new Date(view.current.fetched_at).getTime() >
    RAINFALL_REUSE_MS
  );
}

// Per-ticket rainfall context (manuscript p. 72, Appendix H
// RAINFALL_CONTEXT; manuscript revision Phase 4, step 4c): the current
// rainfall at a ticket's representative location (tickets.geom), from
// OpenWeatherMap Current Weather rain["1h"]. Kept apart from DENR-MGB Hazard
// Information. Advisory only: nothing here touches priority_index, report
// validity, hazard_information or any rule.
//
// A refresh never throws to its caller and never runs inside another write's
// transaction: callers fire it after their own commit and don't await it, so
// a failed or slow provider never blocks or delays a ticket action.
//
// Failure rule (A1): when a call fails and the ticket's current row has a
// value for this location, that row is updated in place to STALE (its
// value, observation and fetched times kept, failure_reason set). Only with
// no earlier value is an UNAVAILABLE row inserted. A failed call is never
// stored as 0 mm.
@Injectable()
export class RainfallContextService {
  private readonly logger = new Logger(RainfallContextService.name);
  // One refresh per ticket at a time. A correction that arrives while one
  // is running asks for one more run after it.
  private readonly inFlight = new Map<
    number,
    Promise<RainfallRefreshOutcome>
  >();
  private readonly rerun = new Set<number>();
  // Same-location readings (rainfallLocationKey), successful calls only.
  private readonly cache = new Map<string, CachedReading>();
  private readonly lastAttempt = new Map<number, number>();
  private readonly lastFailure = new Map<number, number>();
  private readonly lastManualRefresh = new Map<number, number>();

  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get enabled(): boolean {
    return this.config.get('RAINFALL_LOOKUPS', { infer: true }) !== 'disabled';
  }

  private get apiKey(): string {
    return this.config.get('OPENWEATHERMAP_API_KEY', { infer: true }) ?? '';
  }

  // Fire and forget, after the caller's transaction has committed.
  trigger(ticketId: number, reason: RainfallRefreshReason = 'detail') {
    this.refresh(ticketId, reason).catch((err: unknown) =>
      this.logger.warn(
        `Rainfall refresh for ticket #${ticketId} failed: ${redactSecrets(String(err), this.apiKey)}`,
      ),
    );
  }

  // A location or category correction: re-evaluate, keeping the previous
  // row as history. A category without rainfall context only supersedes.
  triggerForCorrection(ticketId: number) {
    this.trigger(ticketId, 'correction');
  }

  async refresh(
    ticketId: number,
    reason: RainfallRefreshReason = 'detail',
  ): Promise<RainfallRefreshOutcome> {
    const running = this.inFlight.get(ticketId);
    if (running) {
      if (reason === 'correction') this.rerun.add(ticketId);
      return running;
    }
    const run = (async () => {
      let outcome: RainfallRefreshOutcome;
      let runs = 0;
      let next = reason;
      do {
        this.rerun.delete(ticketId);
        outcome = await this.refreshOnce(ticketId, next);
        runs += 1;
        // A re-run is for a changed ticket: supersede what it has.
        next = 'correction';
      } while (this.rerun.has(ticketId) && runs < MAX_RUNS);
      this.rerun.delete(ticketId);
      return outcome;
    })().finally(() => this.inFlight.delete(ticketId));
    this.inFlight.set(ticketId, run);
    return run;
  }

  private async refreshOnce(
    ticketId: number,
    reason: RainfallRefreshReason,
  ): Promise<RainfallRefreshOutcome> {
    try {
      if (!this.enabled) return { outcome: 'skipped', reason: 'disabled' };
      const [ticket] = await this.pg<
        {
          category: string;
          status: string;
          merged_into_ticket_id: number | null;
          lat: number;
          lng: number;
        }[]
      >`
        SELECT category, status, merged_into_ticket_id, ST_Y(geom) AS lat, ST_X(geom) AS lng
        FROM tickets WHERE id = ${ticketId}
      `;
      if (!ticket) return { outcome: 'skipped', reason: 'not_found' };
      if (ticket.merged_into_ticket_id !== null) {
        return { outcome: 'skipped', reason: 'merged_away' };
      }
      // Closed tickets keep their rainfall context as history.
      if (!ACTIVE_STATUSES.includes(ticket.status)) {
        return { outcome: 'skipped', reason: 'closed' };
      }
      if (!isRainfallCategory(ticket.category)) {
        const superseded = await this.pg`
          UPDATE rainfall_context SET superseded_at = now()
          WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
        `;
        return { outcome: 'not_applicable', superseded: superseded.count };
      }

      if (reason === 'detail') {
        const [current] = await this.pg<
          { fetched_at: string; same_location: boolean }[]
        >`
          SELECT fetched_at,
            ST_Equals(query_geom, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326)) AS same_location
          FROM rainfall_context
          WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
        `;
        if (
          current?.same_location &&
          Date.now() - new Date(current.fetched_at).getTime() <=
            RAINFALL_REUSE_MS
        ) {
          return { outcome: 'reused' };
        }
        const failedAt = this.lastFailure.get(ticketId);
        if (
          failedAt !== undefined &&
          Date.now() - failedAt < RAINFALL_FAILURE_COOLDOWN_MS
        ) {
          return { outcome: 'skipped', reason: 'cooldown' };
        }
      }

      const key = rainfallLocationKey(ticket.lat, ticket.lng);
      const cached = reason === 'manual' ? null : this.cachedReading(key);
      let result: RainfallFetchResult;
      let fetchedAt: Date;
      if (cached) {
        result = {
          ok: true,
          rainfallMm: cached.rainfallMm,
          observationAt: cached.observationAt,
        };
        fetchedAt = cached.fetchedAt;
      } else {
        fetchedAt = new Date();
        this.lastAttempt.set(ticketId, fetchedAt.getTime());
        result = await this.fetchReading(key);
        if (result.ok) {
          this.remember(key, {
            rainfallMm: result.rainfallMm,
            observationAt: result.observationAt,
            fetchedAt,
          });
          this.lastFailure.delete(ticketId);
        } else {
          this.lastFailure.set(ticketId, Date.now());
        }
      }

      return await this.pg.begin(async (tx) => {
        // The ticket may have changed while the provider answered.
        const [now] = await tx<
          {
            category: string;
            status: string;
            merged_into_ticket_id: number | null;
            same_location: boolean;
          }[]
        >`
          SELECT category, status, merged_into_ticket_id,
            ST_Equals(geom, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326)) AS same_location
          FROM tickets WHERE id = ${ticketId}
          FOR UPDATE
        `;
        if (!now || now.merged_into_ticket_id !== null) {
          return { outcome: 'skipped', reason: 'merged_away' } as const;
        }
        if (!ACTIVE_STATUSES.includes(now.status)) {
          return { outcome: 'skipped', reason: 'closed' } as const;
        }
        if (!isRainfallCategory(now.category) || !now.same_location) {
          // Refresh the ticket again as it is now.
          this.rerun.add(ticketId);
          return { outcome: 'skipped', reason: 'changed' } as const;
        }

        const [current] = await tx<
          { id: number; rainfall_mm: number | null; same_location: boolean }[]
        >`
          SELECT id, rainfall_mm,
            ST_Equals(query_geom, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326)) AS same_location
          FROM rainfall_context
          WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
        `;

        if (result.ok) {
          await tx`
            UPDATE rainfall_context SET superseded_at = now()
            WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
          `;
          await tx`
            INSERT INTO rainfall_context (
              ticket_id, status, rainfall_mm, source_provider, observation_at,
              fetched_at, query_geom, failure_reason
            )
            VALUES (
              ${ticketId}, 'CURRENT', ${result.rainfallMm}, ${RAINFALL_PROVIDER}, ${result.observationAt},
              ${fetchedAt}, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326), NULL
            )
          `;
          return {
            outcome: 'recorded',
            status: 'CURRENT',
            fromCache: cached !== null,
          } as const;
        }

        const { failureReason } = result;
        this.logger.warn(
          `Rainfall for ticket #${ticketId} could not be fetched: ${failureReason}`,
        );
        // The last good value for this location (0 counts: compared with
        // null, never by truthiness).
        const lastGood =
          current && current.same_location && current.rainfall_mm !== null
            ? current
            : null;
        if (lastGood && reason !== 'correction') {
          await tx`
            UPDATE rainfall_context SET status = 'STALE', failure_reason = ${failureReason}
            WHERE id = ${lastGood.id}
          `;
          return {
            outcome: 'recorded',
            status: 'STALE',
            fromCache: false,
          } as const;
        }
        await tx`
          UPDATE rainfall_context SET superseded_at = now()
          WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
        `;
        if (lastGood) {
          // A category correction at the same location: the previous row
          // is history, and its value carries on as STALE.
          await tx`
            INSERT INTO rainfall_context (
              ticket_id, status, rainfall_mm, source_provider, observation_at,
              fetched_at, query_geom, failure_reason
            )
            SELECT ticket_id, 'STALE', rainfall_mm, source_provider, observation_at,
              fetched_at, query_geom, ${failureReason}
            FROM rainfall_context WHERE id = ${lastGood.id}
          `;
          return {
            outcome: 'recorded',
            status: 'STALE',
            fromCache: false,
          } as const;
        }
        await tx`
          INSERT INTO rainfall_context (
            ticket_id, status, rainfall_mm, source_provider, observation_at,
            fetched_at, query_geom, failure_reason
          )
          VALUES (
            ${ticketId}, 'UNAVAILABLE', NULL, ${RAINFALL_PROVIDER}, NULL,
            ${fetchedAt}, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326), ${failureReason}
          )
        `;
        return {
          outcome: 'recorded',
          status: 'UNAVAILABLE',
          fromCache: false,
        } as const;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Rainfall for ticket #${ticketId} not recorded: ${redactSecrets(message, this.apiKey)}`,
      );
      return { outcome: 'skipped', reason: 'error' };
    }
  }

  private cachedReading(key: string): CachedReading | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt.getTime() > RAINFALL_REUSE_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  private remember(key: string, reading: CachedReading) {
    // Expired entries are dropped as new ones arrive, so the map stays as
    // small as the set of points read in the last 10 minutes.
    for (const [k, entry] of this.cache) {
      if (Date.now() - entry.fetchedAt.getTime() > RAINFALL_REUSE_MS) {
        this.cache.delete(k);
      }
    }
    this.cache.set(key, reading);
  }

  // One call to the provider at the rounded point, a single attempt with a
  // hard timeout. Never throws; the API key never appears in a failure
  // reason.
  async fetchReading(key: string): Promise<RainfallFetchResult> {
    const apiKey = this.apiKey;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      RAINFALL_FETCH_TIMEOUT_MS,
    );
    // A pending call never keeps the process alive.
    timer.unref?.();
    try {
      const res = await fetch(rainfallQueryUrl(key, apiKey), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const text = await res.text();
      if (!res.ok) {
        // The provider explains an error in a JSON "message" (e.g. an
        // invalid key); keep it, redacted.
        let message = '';
        try {
          const body = JSON.parse(text) as { message?: unknown };
          if (typeof body?.message === 'string') {
            message = `: ${body.message.slice(0, 200)}`;
          }
        } catch {
          // Not JSON: the status alone.
        }
        return fetchFailure(
          redactSecrets(`HTTP ${res.status}${message}`, apiKey),
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return fetchFailure('Unparsable JSON response');
      }
      return parseCurrentWeather(body);
    } catch (err) {
      if (controller.signal.aborted) {
        return fetchFailure(
          `Timed out after ${RAINFALL_FETCH_TIMEOUT_MS / 1000} s`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return fetchFailure(redactSecrets(`Network error: ${message}`, apiKey));
    } finally {
      clearTimeout(timer);
    }
  }

  async getForTicket(ticket: TicketFacts): Promise<RainfallContextView> {
    const rows = await this.pg<StoredRow[]>`
      SELECT r.id, r.status, r.rainfall_mm, r.source_provider, r.observation_at,
        r.fetched_at, r.failure_reason, r.superseded_at,
        ST_Equals(r.query_geom, t.geom) AS at_current_location
      FROM rainfall_context r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.ticket_id = ${ticket.id}
      ORDER BY r.id DESC
    `;
    const strip = (r: StoredRow): RainfallContextRow => ({
      id: r.id,
      status: r.status,
      rainfall_mm: r.rainfall_mm,
      source_provider: r.source_provider,
      observation_at: r.observation_at,
      fetched_at: r.fetched_at,
      failure_reason: r.failure_reason,
      superseded_at: r.superseded_at,
    });
    const currentRow =
      rows.find((r) => r.superseded_at === null && r.at_current_location) ??
      null;
    return {
      applicability: rainfallApplicability(ticket),
      valueLabel: RAINFALL_VALUE_LABEL,
      current: currentRow ? strip(currentRow) : null,
      history: rows
        .filter((r) => r !== currentRow)
        .slice(0, HISTORY_LIMIT)
        .map(strip),
    };
  }

  // Ticket Detail: the view, plus a background refresh when one is due. Not
  // awaited, so it never slows the page.
  async forTicketDetail(ticket: TicketFacts): Promise<RainfallContextView> {
    const view = await this.getForTicket(ticket);
    if (isRefreshDue(view)) this.trigger(ticket.id, 'detail');
    return view;
  }

  // Staff Refresh (POST /admin/tickets/:id/rainfall-context/refresh): same
  // access as Ticket Detail, one per ticket per 60 s, and the caller waits
  // for the result.
  async manualRefresh(
    ticketId: number,
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Promise<RainfallContextView> {
    const ticket = await this.ticketFacts(ticketId);
    assertOfficeAccess(admin, ticket.assigned_office);
    if (ticket.merged_into_ticket_id !== null) {
      throw new ConflictException(
        `Ticket #${ticketId} was merged into Ticket #${ticket.merged_into_ticket_id} and is read-only.`,
      );
    }
    if (!ACTIVE_STATUSES.includes(ticket.status)) {
      throw new ConflictException(
        `Ticket #${ticketId} is ${ticket.status}; a closed ticket keeps its rainfall context.`,
      );
    }
    if (!isRainfallCategory(ticket.category)) {
      throw new ConflictException(
        `Rainfall context does not apply to ${ticket.category}.`,
      );
    }

    const [latest] = await this.pg<{ fetched_at: string | null }[]>`
      SELECT max(fetched_at) AS fetched_at FROM rainfall_context WHERE ticket_id = ${ticketId}
    `;
    const last = Math.max(
      this.lastManualRefresh.get(ticketId) ?? 0,
      this.lastAttempt.get(ticketId) ?? 0,
      latest?.fetched_at ? new Date(latest.fetched_at).getTime() : 0,
    );
    const waitMs = last + RAINFALL_REFRESH_THROTTLE_MS - Date.now();
    if (waitMs > 0) {
      throw new HttpException(
        `Rainfall for Ticket #${ticketId} was checked less than a minute ago. Try again in ${Math.ceil(waitMs / 1000)} s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastManualRefresh.set(ticketId, Date.now());

    await this.refresh(ticketId, 'manual');
    return this.getForTicket(await this.ticketFacts(ticketId));
  }

  private async ticketFacts(ticketId: number) {
    const [ticket] = await this.pg<
      (TicketFacts & { assigned_office: 'MEO' | 'MDRRMO' })[]
    >`
      SELECT id, category, status, merged_into_ticket_id, assigned_office
      FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException(`Ticket #${ticketId} not found.`);
    return ticket;
  }
}
