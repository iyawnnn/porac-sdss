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
import type { HazardContextType, HazardLookupStatus } from '../db/schema';
import {
  HAZARD_LAYERS,
  type HazardApplicability,
  type HazardLookupResult,
  hazardContextForCategory,
  hazardQueryUrl,
  parseLayerResponse,
  unavailable,
} from '../common/utils/hazard-information';

// One attempt per lookup, cut off after 8 s (the source took 2-8 s in the
// Porac coverage test).
export const HAZARD_LOOKUP_TIMEOUT_MS = 8_000;
// Staff Retry: one attempt per ticket per 60 s.
export const HAZARD_RETRY_THROTTLE_MS = 60_000;
// Opening Ticket Detail retries a TEMPORARILY_UNAVAILABLE result this old.
export const HAZARD_AUTO_RETRY_AFTER_MS = 10 * 60_000;
// Superseded rows Ticket Detail lists.
const HISTORY_LIMIT = 10;
// Runs of one lookup() call: the first, plus re-runs asked for while it ran.
const MAX_RUNS = 3;

const ACTIVE_STATUSES = ['Reported', 'Under Review', 'In Progress'];

export type HazardLookupOutcome =
  | {
      outcome: 'recorded';
      contextType: HazardContextType;
      lookupStatus: HazardLookupStatus;
    }
  // Lahar or any other category: the current rows (if any) were superseded
  // and nothing was inserted.
  | { outcome: 'not_applicable'; superseded: number }
  | {
      outcome: 'skipped';
      // changed: the ticket's category or location changed while the
      // source answered (it is looked up again, up to MAX_RUNS runs).
      reason: 'not_found' | 'merged_away' | 'disabled' | 'changed' | 'error';
    };

export interface HazardInformationRow {
  id: number;
  hazard_context_type: HazardContextType;
  lookup_status: HazardLookupStatus;
  susceptibility_code: string | null;
  susceptibility_label: string | null;
  failure_reason: string | null;
  looked_up_at: string;
  superseded_at: string | null;
}

// Ticket Detail's hazardInformation. Staff only: no citizen endpoint ever
// reads hazard_information.
export interface HazardInformationView {
  applicability: HazardApplicability;
  contextType: HazardContextType | null;
  // "Flood" / "Rain-induced landslide", and the layer's source name.
  layerName: string | null;
  sourceName: string | null;
  // The current row, when it is for the ticket's present category and
  // representative location. Null = not yet checked.
  current: HazardInformationRow | null;
  // Earlier results, newest first (superseded rows, and a current row left
  // behind by a category or location change whose new lookup hasn't
  // finished).
  history: HazardInformationRow[];
}

interface TicketFacts {
  id: number;
  category: string;
  status: string;
  merged_into_ticket_id: number | null;
}

interface StoredRow extends HazardInformationRow {
  at_current_location: boolean;
}

// The rule for opening Ticket Detail (an implementation extension, see
// docs/database.md): an active, not merged-away ticket in an applicable
// category is looked up in the background when it has no current row or
// its current row is TEMPORARILY_UNAVAILABLE and older than 10 minutes.
// Closed tickets keep what they have.
export function isAutoRetryDue(
  ticket: Pick<TicketFacts, 'status' | 'merged_into_ticket_id'>,
  view: Pick<HazardInformationView, 'applicability' | 'current'>,
  now: Date = new Date(),
): boolean {
  if (view.applicability !== 'applicable') return false;
  if (ticket.merged_into_ticket_id !== null) return false;
  if (!ACTIVE_STATUSES.includes(ticket.status)) return false;
  if (!view.current) return true;
  return (
    view.current.lookup_status === 'TEMPORARILY_UNAVAILABLE' &&
    now.getTime() - new Date(view.current.looked_up_at).getTime() >
      HAZARD_AUTO_RETRY_AFTER_MS
  );
}

// DENR-MGB Hazard Information (manuscript pp. 71-72, Appendix H
// HAZARD_INFORMATION; manuscript revision Phase 4, step 4b). Looks a
// ticket's representative location (tickets.geom) up against the layer its
// category uses and records the result in hazard_information. Advisory only:
// never a score, and nothing here touches priority_index, report validity,
// Work Orders or assessments.
//
// A lookup never throws to its caller and never runs inside another write's
// transaction: callers fire it after their own commit and don't await it, so
// a failed or slow source never blocks or delays a submission or a ticket
// action. Each lookup supersedes the ticket's current row(s) and inserts the
// new one in one transaction; old rows stay as history.
@Injectable()
export class HazardInformationService {
  private readonly logger = new Logger(HazardInformationService.name);
  // One lookup per ticket at a time. A trigger that arrives while one is
  // running (a correction mid-lookup) asks for one more run after it.
  private readonly inFlight = new Map<number, Promise<HazardLookupOutcome>>();
  private readonly rerun = new Set<number>();
  private readonly lastRetryAttempt = new Map<number, number>();

  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get enabled(): boolean {
    return (
      this.config.get('HAZARD_INFORMATION_LOOKUPS', { infer: true }) !==
      'disabled'
    );
  }

  // Fire and forget, after the caller's transaction has committed.
  trigger(ticketId: number, options: { rerunIfInFlight?: boolean } = {}) {
    this.lookup(ticketId, options).catch((err: unknown) =>
      this.logger.warn(
        `Hazard lookup for ticket #${ticketId} failed: ${String(err)}`,
      ),
    );
  }

  // A new ticket: only an applicable category is looked up.
  triggerForNewTicket(ticketId: number, category: string) {
    if (hazardContextForCategory(category).contextType) this.trigger(ticketId);
  }

  async lookup(
    ticketId: number,
    { rerunIfInFlight = true }: { rerunIfInFlight?: boolean } = {},
  ): Promise<HazardLookupOutcome> {
    const running = this.inFlight.get(ticketId);
    if (running) {
      if (rerunIfInFlight) this.rerun.add(ticketId);
      return running;
    }
    const run = (async () => {
      let outcome: HazardLookupOutcome;
      let runs = 0;
      do {
        this.rerun.delete(ticketId);
        outcome = await this.lookupOnce(ticketId);
        runs += 1;
      } while (this.rerun.has(ticketId) && runs < MAX_RUNS);
      this.rerun.delete(ticketId);
      return outcome;
    })().finally(() => this.inFlight.delete(ticketId));
    this.inFlight.set(ticketId, run);
    return run;
  }

  private async lookupOnce(ticketId: number): Promise<HazardLookupOutcome> {
    try {
      if (!this.enabled) return { outcome: 'skipped', reason: 'disabled' };
      const [ticket] = await this.pg<
        {
          category: string;
          merged_into_ticket_id: number | null;
          lat: number;
          lng: number;
        }[]
      >`
        SELECT category, merged_into_ticket_id, ST_Y(geom) AS lat, ST_X(geom) AS lng
        FROM tickets WHERE id = ${ticketId}
      `;
      if (!ticket) return { outcome: 'skipped', reason: 'not_found' };
      if (ticket.merged_into_ticket_id !== null) {
        return { outcome: 'skipped', reason: 'merged_away' };
      }

      const { contextType } = hazardContextForCategory(ticket.category);
      if (!contextType) {
        const superseded = await this.pg`
          UPDATE hazard_information SET superseded_at = now()
          WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
        `;
        return { outcome: 'not_applicable', superseded: superseded.count };
      }

      const result = await this.queryLayer(contextType, ticket.lat, ticket.lng);

      return await this.pg.begin(async (tx) => {
        // The ticket may have changed while the source answered.
        const [now] = await tx<
          {
            category: string;
            merged_into_ticket_id: number | null;
            same_location: boolean;
          }[]
        >`
          SELECT category, merged_into_ticket_id,
            ST_Equals(geom, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326)) AS same_location
          FROM tickets WHERE id = ${ticketId}
          FOR UPDATE
        `;
        if (!now || now.merged_into_ticket_id !== null) {
          return { outcome: 'skipped', reason: 'merged_away' } as const;
        }
        if (
          hazardContextForCategory(now.category).contextType !== contextType ||
          !now.same_location
        ) {
          // Look the ticket up again as it is now.
          this.rerun.add(ticketId);
          return { outcome: 'skipped', reason: 'changed' } as const;
        }
        await tx`
          UPDATE hazard_information SET superseded_at = now()
          WHERE ticket_id = ${ticketId} AND superseded_at IS NULL
        `;
        await tx`
          INSERT INTO hazard_information (
            ticket_id, hazard_context_type, lookup_status, susceptibility_code,
            susceptibility_label, query_geom, failure_reason
          )
          VALUES (
            ${ticketId}, ${contextType}, ${result.lookupStatus}, ${result.susceptibilityCode},
            ${result.susceptibilityLabel}, ST_SetSRID(ST_MakePoint(${ticket.lng}, ${ticket.lat}), 4326),
            ${result.failureReason}
          )
        `;
        if (result.lookupStatus === 'TEMPORARILY_UNAVAILABLE') {
          this.logger.warn(
            `Hazard lookup for ticket #${ticketId} unavailable: ${result.failureReason}`,
          );
        }
        return {
          outcome: 'recorded',
          contextType,
          lookupStatus: result.lookupStatus,
        } as const;
      });
    } catch (err) {
      this.logger.warn(
        `Hazard lookup for ticket #${ticketId} not recorded: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { outcome: 'skipped', reason: 'error' };
    }
  }

  // One request to the layer, a single attempt with a hard timeout. Every
  // failure becomes TEMPORARILY_UNAVAILABLE with a reason.
  async queryLayer(
    contextType: HazardContextType,
    lat: number,
    lng: number,
  ): Promise<HazardLookupResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      HAZARD_LOOKUP_TIMEOUT_MS,
    );
    // A pending lookup never keeps the process (or a script) alive.
    timer.unref?.();
    try {
      const res = await fetch(hazardQueryUrl(contextType, lat, lng), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return unavailable(`HTTP ${res.status}`);
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return unavailable('Unparsable JSON response');
      }
      return parseLayerResponse(contextType, body);
    } catch (err) {
      if (controller.signal.aborted) {
        return unavailable(
          `Timed out after ${HAZARD_LOOKUP_TIMEOUT_MS / 1000} s`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return unavailable(`Network error: ${message}`.slice(0, 500));
    } finally {
      clearTimeout(timer);
    }
  }

  async getForTicket(ticket: TicketFacts): Promise<HazardInformationView> {
    const { applicability, contextType } = hazardContextForCategory(
      ticket.category,
    );
    const rows = await this.pg<StoredRow[]>`
      SELECT h.id, h.hazard_context_type, h.lookup_status, h.susceptibility_code,
        h.susceptibility_label, h.failure_reason, h.looked_up_at, h.superseded_at,
        ST_Equals(h.query_geom, t.geom) AS at_current_location
      FROM hazard_information h
      JOIN tickets t ON t.id = h.ticket_id
      WHERE h.ticket_id = ${ticket.id}
      ORDER BY h.looked_up_at DESC, h.id DESC
    `;
    const strip = (r: StoredRow): HazardInformationRow => ({
      id: r.id,
      hazard_context_type: r.hazard_context_type,
      lookup_status: r.lookup_status,
      susceptibility_code: r.susceptibility_code,
      susceptibility_label: r.susceptibility_label,
      failure_reason: r.failure_reason,
      looked_up_at: r.looked_up_at,
      superseded_at: r.superseded_at,
    });
    const currentRow =
      rows.find(
        (r) =>
          r.superseded_at === null &&
          r.hazard_context_type === contextType &&
          r.at_current_location,
      ) ?? null;
    return {
      applicability,
      contextType,
      layerName: contextType ? HAZARD_LAYERS[contextType].name : null,
      sourceName: contextType ? HAZARD_LAYERS[contextType].sourceName : null,
      current: currentRow ? strip(currentRow) : null,
      history: rows
        .filter((r) => r !== currentRow)
        .slice(0, HISTORY_LIMIT)
        .map(strip),
    };
  }

  // Ticket Detail: the view, plus the background lookup when it is due. Not
  // awaited, so it never slows the page.
  async forTicketDetail(ticket: TicketFacts): Promise<HazardInformationView> {
    const view = await this.getForTicket(ticket);
    if (isAutoRetryDue(ticket, view)) {
      this.trigger(ticket.id, { rerunIfInFlight: false });
    }
    return view;
  }

  // Staff Retry (POST /admin/tickets/:id/hazard-information/retry): same
  // access as Ticket Detail, one attempt per ticket per 60 s, and the caller
  // waits for the result.
  async retry(
    ticketId: number,
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Promise<HazardInformationView> {
    const ticket = await this.ticketFacts(ticketId);
    assertOfficeAccess(admin, ticket.assigned_office);
    if (ticket.merged_into_ticket_id !== null) {
      throw new ConflictException(
        `Ticket #${ticketId} was merged into Ticket #${ticket.merged_into_ticket_id} and is read-only.`,
      );
    }
    if (!ACTIVE_STATUSES.includes(ticket.status)) {
      throw new ConflictException(
        `Ticket #${ticketId} is ${ticket.status}; a closed ticket keeps its Hazard Information.`,
      );
    }
    if (
      hazardContextForCategory(ticket.category).applicability !== 'applicable'
    ) {
      throw new ConflictException(
        `Hazard Information has no lookup for ${ticket.category}.`,
      );
    }

    const [latest] = await this.pg<{ looked_up_at: string }[]>`
      SELECT max(looked_up_at) AS looked_up_at FROM hazard_information WHERE ticket_id = ${ticketId}
    `;
    const last = Math.max(
      this.lastRetryAttempt.get(ticketId) ?? 0,
      latest?.looked_up_at ? new Date(latest.looked_up_at).getTime() : 0,
    );
    const waitMs = last + HAZARD_RETRY_THROTTLE_MS - Date.now();
    if (waitMs > 0) {
      throw new HttpException(
        `Hazard Information for Ticket #${ticketId} was checked less than a minute ago. Try again in ${Math.ceil(waitMs / 1000)} s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastRetryAttempt.set(ticketId, Date.now());

    await this.lookup(ticketId, { rerunIfInFlight: false });
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
