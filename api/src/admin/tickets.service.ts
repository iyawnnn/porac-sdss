import { EXPORT_ROW_LIMIT, assertExportLimit } from './export-limit';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql, TransactionSql } from 'postgres';
import { PG } from '../db/db.module';
import { MediaService } from '../domain/media.service';
import {
  computePriorityBreakdown,
  type PriorityBreakdown,
} from '../common/utils/scoring';
import { ticketSeverity, type TicketSeverity } from '../common/utils/severity';
import {
  type CurrentHazardRow,
  type HazardApplicability,
  hazardContextForCategory,
  hazardSummary,
} from '../common/utils/hazard-information';
import type { AdminSession } from '../auth/session.service';
import {
  resolveOfficeScope,
  assertOfficeAccess,
} from '../common/authz/admin-scope';
import {
  ALL_CATEGORIES,
  TICKET_REJECTION_REASON_MAX_LENGTH,
} from '../contracts/schemas';
import { categoryRouting } from '../common/utils/office';
import {
  ROUTING_ADMIN_NAME_MAX_LENGTH,
  ROUTING_REASON_NOT_RECORDED,
  type ResolutionFeedbackType,
  type SeverityScreeningStatus,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BACK_UNDER_REVIEW,
  bestEffortNotifications,
  notifyTicketCitizens,
  reassignedNotice,
  referredNotice,
  resolvedNotice,
  ticketReporters,
} from '../notifications/citizen-notices';
import type { CitizenOutcome } from '../reports/citizen-report-view';
import { EMAIL_SERVICE, type EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import { AdminAuditService } from './admin-audit.service';
import { assertNotMergedAway, toHttpException } from './ticket-grouping.rules';
import {
  reassignDestinationBlock,
  referDestinationBlock,
  routingBlock,
  validateReferralAgency,
  validateRoutingReason,
} from './ticket-routing.rules';
import {
  TICKET_STATUSES,
  PAGE_LIMITS,
  DEFAULT_PAGE_LIMIT,
  NEXT_STATUS,
  type TicketStatus,
  type TicketSort,
} from './ticket-constants';
import {
  isLegacyResolution,
  resolveBlock,
  returnBlock,
  validateResolutionInput,
  validateReturnReason,
} from './ticket-resolution.rules';
import type { ResolutionOutcome } from '../contracts/schemas';
import { OperationalPriorityService } from '../domain/operational-priority.service';

// Counts behind the queue's built-in view tabs. Each field MUST be counted
// with the same predicate the tab's filter applies, or the tab will promise a
// number the list then contradicts. (The former "High urgency" tab and its
// highUrgency count went with the Hazard Urgency filter in manuscript
// revision Phase 1, step 4.)
export interface TicketViewCounts {
  allActive: number;
  disputed: number;
  meo: number;
  mdrrmo: number;
}

// Result shape shared by every bulk action. Bulk work is a LOOP over the
// existing single-ticket methods, each of which opens its own transaction —
// so partial success is the normal outcome, not an error case, and the
// caller is always told exactly which ids did not move and why. Never
// collapse this to a boolean.
export interface BulkActionResult {
  ok: number[];
  skipped: { id: number; reason: string }[];
}

// Matches the largest PAGE_LIMITS value, so "select every row on this page"
// always fits in one request and the UI never has to chunk.
export const BULK_MAX_TICKETS = 50;

export interface AdminTicketFilters {
  office?: 'MEO' | 'MDRRMO';
  status?: 'active' | 'all' | TicketStatus;
  category?: string;
  barangayId?: number;
  // Citizen resolution-feedback loop: true narrows to tickets a citizen
  // has flagged as "not actually fixed" (tickets.disputed_at IS NOT NULL).
  // A pure list-narrowing filter, same shape as WorkOrdersService's
  // `overdue` boolean — never absent-means-false, absent means unfiltered.
  disputed?: boolean;
  // true narrows to tickets marked tickets.category_review_required (old
  // combined drainage tickets, migration 0035 — handoff Decision 13). Same
  // shape as `disputed`: absent means unfiltered, never "only false".
  categoryReview?: boolean;
  sort?: TicketSort;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminTicketRow {
  id: number;
  category: string;
  title: string | null;
  barangay_id: number;
  barangay_name: string;
  member_count: number;
  // Operational Priority (1-100). The Hazard Urgency fields this row used to
  // carry (urgency_score/urgency_band/priority_score/urgency_level) were
  // removed from the queue response in manuscript revision Phase 1, step 4.
  priority_index: number | null;
  assigned_office: string;
  status: string;
  created_at: string;
  disputed_at: string | null;
  category_review_required: boolean;
  // DENR-MGB Hazard Information (manuscript revision Phase 4, step 4b),
  // advisory: whether the category has a lookup, and one line of the
  // current result in the source's terms ("Flood: MF (Moderate
  // Susceptibility to Flooding)", "Not applicable", ...). Never a score.
  hazard_applicability: HazardApplicability;
  hazard_summary: string;
}

export interface PaginatedTickets {
  tickets: AdminTicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Feeds ReportsService's CSV export — deliberately a narrower row shape than
// AdminTicketRow (no title, which comes from a citizen-authored report and
// isn't a stable/moderated field worth putting in an operational handoff
// export).
export interface AdminTicketExportRow {
  id: number;
  status: string;
  assigned_office: string;
  category: string;
  barangay_name: string;
  priority_index: number | null;
  member_count: number;
  created_at: string;
  updated_at: string;
  // Set on a ticket merged into another (manuscript revision Phase 3, step
  // 3d). Such rows appear only in a status=all export.
  merged_into_ticket_id: number | null;
  // Same line as AdminTicketRow.hazard_summary (Phase 4, step 4b).
  hazard_summary: string;
  // Phase 5, step 5c. The CSV leaves the outcome blank for a legacy
  // Resolved ticket (resolved_at NULL).
  resolution_outcome: ResolutionOutcome | null;
  resolved_at: string | null;
}

// The ticket's current Hazard Information row, when it is for the ticket's
// present location (a location correction whose new lookup hasn't finished
// leaves the old row current until it does). hazardSummary also ignores a
// row for another context type. Shared by the list and export queries.
function hazardCurrentColumn(sql: Sql) {
  return sql`(
    SELECT json_build_object(
      'hazard_context_type', h.hazard_context_type,
      'lookup_status', h.lookup_status,
      'susceptibility_code', h.susceptibility_code,
      'susceptibility_label', h.susceptibility_label
    )
    FROM hazard_information h
    WHERE h.ticket_id = t.id AND h.superseded_at IS NULL
      AND ST_Equals(h.query_geom, t.geom)
    ORDER BY h.looked_up_at DESC, h.id DESC
    LIMIT 1
  ) AS hazard_current`;
}

function withHazardSummary<
  T extends { category: string; hazard_current: CurrentHazardRow | null },
>(row: T) {
  const { hazard_current: current, ...rest } = row;
  return {
    ...rest,
    hazard_applicability: hazardContextForCategory(row.category).applicability,
    hazard_summary: hazardSummary(row.category, current),
  };
}

export interface AdminTicketGeoRow {
  id: number;
  category: string;
  status: string;
  assigned_office: string;
  barangay_name: string;
  // Manuscript revision Phase 1, step 5: the admin map reads Operational
  // Priority only. The Hazard Urgency columns (urgency_score/urgency_band/
  // priority_score) are no longer selected here.
  priority_index: number | null;
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
}

// The read-only banner on a merged-away ticket (manuscript revision Phase
// 3, step 3d). mergedAt/mergedByName/reason come from the ticket_merged audit
// event and are null only if that event can't be found.
export interface TicketMergedInto {
  ticketId: number;
  mergedAt: string | null;
  mergedByName: string | null;
  reason: string | null;
}

export interface TicketDetail {
  id: number;
  category: string;
  barangay_id: number;
  barangay_name: string;
  barangay_geojson: string | null;
  status: string;
  assigned_office: string;
  // Appendix H (manuscript revision Phase 2, step 2b): the office automatic
  // Initial Routing first assigned; differs from assigned_office after a
  // reassignment.
  initial_assigned_office: string;
  // Appendix H: set when the ticket is resolved; NULL while active and on a
  // Rejected ticket. Also NULL in this response for a legacy Resolved ticket
  // (resolution_legacy), whatever migration 0036 stored for it (manuscript
  // revision Phase 5, step 5c, decision 1).
  resolution_outcome: ResolutionOutcome | null;
  // Phase 5, step 5c (migration 0046): when and by whom the ticket was
  // resolved; NULL while active, on a legacy Resolved ticket, and again
  // after a return to Under Review clears them.
  resolved_at: string | null;
  resolved_by_name: string | null;
  // Resolved before outcomes were recorded (resolved_at NULL): the UI shows
  // "Not recorded (legacy)" for the outcome.
  resolution_legacy: boolean;
  // Whether the "Disputed" badge applies to the current resolution: the
  // citizen dispute is at or after resolved_at, or the ticket has no
  // resolved_at (legacy, or returned and not yet resolved again).
  disputed_current: boolean;
  member_count: number;
  lat: number;
  lng: number;
  // elevation_m left the detail response in manuscript revision Phase 1,
  // step 7a (no longer stored for new tickets).
  // Manuscript revision Phase 1, step 5: Ticket Detail shows Operational
  // Priority only. The Hazard Urgency columns (the three *_factor inputs,
  // urgency_score, urgency_band, priority_score, urgency_level) are no
  // longer selected here.
  priority_index: number | null;
  resolution_image_url: string | null;
  resolution_notes: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  // Set by migration 0035 on old combined drainage tickets (handoff
  // Decision 13); cleared by the Phase 3 category correction.
  category_review_required: boolean;
  // Pure function of category (api/src/common/utils/office.ts), computed at
  // read time — never stored. True means this office owns fixing it; false
  // means it's a referral/coordination concern this office merely holds
  // custody of for triage. See CategoryRouting.
  direct_responsibility: boolean;
  // Manuscript revision Phase 3, step 3d: set once this ticket is merged
  // into another; it is then read-only history.
  merged_into_ticket_id: number | null;
  created_at: string;
  updated_at: string;
}

// Citizen resolution feedback on Ticket Detail (Appendix H
// RESOLUTION_FEEDBACK; manuscript revision Phase 3, step 3g): how many
// reporters confirmed or disputed the resolution, and each answer with its
// reason and time. No citizen name, id or contact: Ticket Detail shows no
// reporter identity, so neither does this.
export interface TicketCitizenFeedbackResponse {
  feedback_type: ResolutionFeedbackType;
  reason: string | null;
  created_at: string;
}

export interface TicketCitizenFeedback {
  confirmed: number;
  disputed: number;
  responses: TicketCitizenFeedbackResponse[];
}

export interface TicketReport {
  id: number;
  // Appendix H tracking reference (PRC-YYYY-NNNNNN), the same one the
  // citizen sees.
  tracking_reference: string;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  exif_captured_at: string | null;
  exif_data: Record<string, unknown> | null;
  location_mismatch_m: number | null;
  created_at: string;
  flags: string[] | null;
  moderation_status: string | null;
  // The citizen's originals (manuscript revision Phase 3, step 3e): what
  // they picked and where they pinned it, never changed by a staff
  // correction; pin_distance_m is the pin's distance from the ticket's
  // current location.
  submitted_category: string;
  pin_lat: number;
  pin_lng: number;
  pin_distance_m: number;
  // Focal's severity screening (manuscript revision Phase 3, step 3f),
  // read-only here; never part of any citizen response.
  severity_screening_status: SeverityScreeningStatus;
  severity_screening_remarks: string | null;
}

// Staff-only (manuscript revision Phase 5, step 5c): from_status, reason and
// the resolution snapshot are never part of the citizen's status history
// (ReportsService.getMyReportDetail selects its own three columns).
export interface TicketStatusHistoryRow {
  status: string;
  admin_name: string | null;
  changed_at: string;
  // NULL on rows written before migration 0046 and on ordinary ladder steps.
  from_status: string | null;
  // The reason on a return to Under Review.
  reason: string | null;
  // The resolution as it was recorded, on a Resolved row (NULL on legacy
  // Resolved rows).
  resolution_outcome: ResolutionOutcome | null;
  resolution_notes: string | null;
  // On a return row: the ticket's latest referral at the time of the
  // return (routing_actions), shown next to it on the timeline.
  latest_referral_agency: string | null;
  latest_referral_at: string | null;
}

// Whether the signed-in admin may return this ticket to Under Review now
// (manuscript revision Phase 5, step 5c): the endpoint's own rule.
export interface TicketReturnToReviewState {
  available: boolean;
}

export interface TicketReassignmentRow {
  from_office: string;
  to_office: string;
  admin_name: string | null;
  reassigned_at: string;
  // The routing_actions reason written in the same transaction: required
  // since manuscript revision Phase 5, step 5a; null for an older
  // reassignment recorded without one.
  reason: string | null;
}

// Whether the signed-in admin may Reassign or Refer this ticket right now
// (manuscript revision Phase 5, step 5a): null when allowed, else the
// routing endpoints' own refusal message (ticket-routing.rules.ts).
export interface TicketRoutingState {
  blockedReason: string | null;
}

// A staff category or location correction on the Ticket Detail timeline
// (manuscript revision Phase 3, step 3e), from its audit event: old and new
// value, reason, who and when.
export interface TicketCorrectionRow {
  field: 'category' | 'location';
  old_value: string;
  new_value: string;
  reason: string | null;
  admin_name: string;
  corrected_at: string;
}

// Historical record only — never treated as live "currently pending
// referral" state. See docs/triage-model.md and the Phase 3 plan for why:
// an audit-event log can't cheaply answer "is this still unresolved"
// without also tracking a resolution event, which this codebase does not
// have. Display this as "Referral recorded", never as a current-state badge.
export interface TicketReferralRow {
  agency: string;
  // The referral's reason: metadata.reason since manuscript revision Phase
  // 5, step 5a (required); an older event's optional metadata.note.
  note: string | null;
  admin_name: string;
  referred_at: string;
}

// The live rain reading (rain1hMm) that used to ride along here fed only
// Ticket Detail's Hazard Urgency card, retired in manuscript revision
// Phase 1, step 5. Operational Priority has no rainfall input.
export interface TicketPriorityContext {
  breakdown: PriorityBreakdown;
}

// Same 3-status "active" set used throughout the codebase (dashboard,
// escalation, recompute, etc.) — a ticket outside this set is closed
// (Resolved or Rejected) and cannot be rejected. Rejected is final. Resolved
// is final on the NEXT_STATUS ladder too; the one way back is
// returnToReview (manuscript revision Phase 5, step 5c), and only for a
// ticket resolved by External Referral.
const ACTIVE_TICKET_STATUSES: TicketStatus[] = [
  'Reported',
  'Under Review',
  'In Progress',
];

// No entry for 'Reported' (the ladder's start, never a transition target)
// or 'Rejected' (NEXT_STATUS has no transition that produces it — rejection
// is a separate terminal outcome reached via rejectTicket, which builds its
// own notification directly since it needs to interpolate a reason).
const STATUS_NOTIFICATION: Partial<
  Record<TicketStatus, { type: string; title: string; message: string }>
> = {
  'Under Review': {
    type: 'ticket_under_review',
    title: 'Report under review',
    message: 'Your report is now under review by the assigned office.',
  },
  'In Progress': {
    type: 'ticket_in_progress',
    title: 'Work in progress',
    message: 'Work has started on your report.',
  },
  Resolved: {
    type: 'ticket_resolved',
    title: 'Report resolved',
    message: 'Your report has been marked resolved.',
  },
};

// Resolving and returning validate every rule behind migration 0046's CHECKs
// in code first, on the locked row. A check_violation (23514) from either
// therefore means the row changed under the request, or a bug; it is
// reported as a 409 for the action being attempted — never mapped by
// constraint name, since Postgres names only one of several failing CHECKs.
// Anything else is passed through unchanged.
function checkViolationAsConflict(err: unknown, message: string): unknown {
  if (
    err !== null &&
    typeof err === 'object' &&
    (err as { code?: unknown }).code === '23514'
  ) {
    return new ConflictException(message);
  }
  return err;
}

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AdminAuditService,
    // Return to Under Review recalculates the ticket's Operational Priority
    // inside its own transaction (manuscript revision Phase 5, step 5c).
    private readonly operationalPriority: OperationalPriorityService,
  ) {}

  // URL <-> filter mapping shared between SSR first paint (Phase 8) and the
  // client refetch route, so the two never drift.
  parseTicketQuery(
    query: Record<string, string | undefined>,
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Required<Pick<AdminTicketFilters, 'status' | 'sort' | 'page' | 'limit'>> &
    Pick<
      AdminTicketFilters,
      | 'office'
      | 'category'
      | 'barangayId'
      | 'search'
      | 'disputed'
      | 'categoryReview'
    > {
    const requestedOffice =
      query.office === 'all' ||
      query.office === 'MEO' ||
      query.office === 'MDRRMO'
        ? query.office
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);
    const status =
      query.status === 'all' ||
      query.status === 'active' ||
      TICKET_STATUSES.includes(query.status as TicketStatus)
        ? (query.status as AdminTicketFilters['status'])
        : 'active';
    const category = (ALL_CATEGORIES as readonly string[]).includes(
      query.category ?? '',
    )
      ? query.category
      : undefined;
    const barangayId = query.barangayId ? Number(query.barangayId) : undefined;
    const disputed = query.disputed === 'true' ? true : undefined;
    const categoryReview = query.categoryReview === 'true' ? true : undefined;
    // Default is Operational Priority (priority_index) descending — the
    // administrative queue recommendation. A retired Hazard Urgency sort
    // ('priority_desc'/'priority_asc') or an `urgency=` filter left in an old
    // bookmark is ignored, not rejected: it falls back to the default order
    // and no urgency filter (manuscript revision Phase 1, step 4).
    const sort: TicketSort =
      query.sort === 'op_priority_asc' || query.sort === 'newest'
        ? query.sort
        : 'op_priority_desc';
    const search = query.search?.trim() || undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = PAGE_LIMITS.includes(
      Number(query.limit) as (typeof PAGE_LIMITS)[number],
    )
      ? Number(query.limit)
      : DEFAULT_PAGE_LIMIT;

    return {
      office,
      status: status ?? 'active',
      disputed,
      categoryReview,
      category,
      barangayId,
      sort,
      search,
      page,
      limit,
    };
  }

  async getTicketsForAdmin(
    filters: AdminTicketFilters = {},
  ): Promise<PaginatedTickets> {
    const sql = this.pg;
    const status = filters.status ?? 'active';
    const statusClause =
      status === 'active'
        ? sql`AND t.status IN ('Reported', 'Under Review', 'In Progress')`
        : status === 'all'
          ? sql``
          : sql`AND t.status = ${status}::ticket_status`;
    // Operational Priority (priority_index) descending is the default and
    // canonical queue order. The Hazard Urgency orders were retired in
    // manuscript revision Phase 1, step 4.
    const orderBy =
      filters.sort === 'op_priority_asc'
        ? sql`t.priority_index ASC NULLS LAST, t.created_at DESC, t.id DESC`
        : filters.sort === 'newest'
          ? sql`t.created_at DESC, t.id DESC`
          : sql`t.priority_index DESC NULLS LAST, t.created_at DESC, t.id DESC`;

    const search = filters.search?.trim() || null;
    const searchPattern = search?.replace(/[\\%_]/g, '\\$&') ?? null;
    const searchId = search && /^\d+$/.test(search) ? Number(search) : null;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(
      1,
      Math.min(100, filters.limit ?? DEFAULT_PAGE_LIMIT),
    );
    const offset = (page - 1) * limit;

    // COUNT(*) OVER() rides along with the page query so the WHERE clause
    // (filters + search) can't drift between a separate count query and the
    // row query.
    const rows = await sql<
      (Omit<AdminTicketRow, 'hazard_applicability' | 'hazard_summary'> & {
        hazard_current: CurrentHazardRow | null;
        total_count: number;
      })[]
    >`
      SELECT t.id, t.category,
        (SELECT r.title FROM reports r WHERE r.ticket_id = t.id ORDER BY r.created_at ASC, r.id ASC LIMIT 1) AS title,
        t.barangay_id, b.name AS barangay_name, t.member_count,
        t.priority_index,
        t.assigned_office, t.status, t.created_at, t.disputed_at,
        t.category_review_required,
        ${hazardCurrentColumn(sql)},
        COUNT(*) OVER ()::int AS total_count
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE (${filters.office ?? null}::text IS NULL OR t.assigned_office = ${filters.office ?? null}::office)
        ${statusClause}
        -- A merged-away ticket is history (Phase 3, step 3d), never queued.
        AND t.merged_into_ticket_id IS NULL
        AND (${filters.category ?? null}::text IS NULL OR t.category = ${filters.category ?? null})
        AND (${filters.barangayId ?? null}::int IS NULL OR t.barangay_id = ${filters.barangayId ?? null}::int)
        AND (${filters.disputed ? true : null}::boolean IS NULL OR t.disputed_at IS NOT NULL)
        AND (${filters.categoryReview ? true : null}::boolean IS NULL OR t.category_review_required)
        AND (
          ${search}::text IS NULL
          OR b.name ILIKE '%' || ${searchPattern} || '%' ESCAPE E'\\\\'
          OR t.category ILIKE '%' || ${searchPattern} || '%' ESCAPE E'\\\\'
          OR (${searchId}::int IS NOT NULL AND t.id = ${searchId}::int)
          OR EXISTS (
            SELECT 1 FROM reports r
            WHERE r.ticket_id = t.id
              AND (r.title ILIKE '%' || ${searchPattern} || '%' ESCAPE E'\\\\'
                OR r.tracking_reference ILIKE '%' || ${searchPattern} || '%' ESCAPE E'\\\\')
          )
        )
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows[0]?.total_count ?? 0;

    return {
      tickets: rows.map(withHazardSummary),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // Powers the queue's view-tab strip. Deliberately NOT a separate endpoint:
  // it rides along on GET /admin/tickets so it can't be fetched without the
  // list it labels, needs no second recalculation pass, and
  // sidesteps the @Get(':id') ParseIntPipe route-ordering trap.
  //
  // Office scope is the caller's, not the current filter's — the tabs are a
  // fixed frame around everything this admin can see, so clicking MEO while
  // MDRRMO is selected still shows the right number. An office admin gets 0
  // for the office that is not theirs (resolveOfficeScope clamps them), and
  // the UI hides that tab rather than rendering a permanent zero.
  async getViewCounts(
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Promise<TicketViewCounts> {
    const sql = this.pg;
    const office = resolveOfficeScope(admin, undefined) ?? null;
    const [row] = await sql<
      {
        all_active: number;
        disputed: number;
        meo: number;
        mdrrmo: number;
      }[]
    >`
      SELECT
        COUNT(*)::int AS all_active,
        COUNT(*) FILTER (WHERE t.assigned_office = 'MEO')::int AS meo,
        COUNT(*) FILTER (WHERE t.assigned_office = 'MDRRMO')::int AS mdrrmo,
        -- Deliberately its own subquery, not a FILTER on the outer active-
        -- status WHERE below: a dispute can only ever exist on a Resolved
        -- ticket (disputeReport requires it), so filtering this count by
        -- the same active-only WHERE as the other three columns would make
        -- it permanently zero. Still office-scoped for RBAC.
        (
          SELECT COUNT(*)::int FROM tickets t2
          WHERE t2.disputed_at IS NOT NULL
            AND t2.merged_into_ticket_id IS NULL
            AND (${office}::text IS NULL OR t2.assigned_office = ${office}::office)
        ) AS disputed
      FROM tickets t
      WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
        AND t.merged_into_ticket_id IS NULL
        AND (${office}::text IS NULL OR t.assigned_office = ${office}::office)
    `;
    return {
      allActive: row?.all_active ?? 0,
      disputed: row?.disputed ?? 0,
      meo: row?.meo ?? 0,
      mdrrmo: row?.mdrrmo ?? 0,
    };
  }

  // Fetch one extra row so overflow is refused, never silently truncated.
  async getTicketsForExport(
    filters: AdminTicketFilters & {
      dateFrom?: Date;
      dateTo?: Date;
      ids?: number[];
    } = {},
  ): Promise<AdminTicketExportRow[]> {
    const sql = this.pg;
    const status = filters.status ?? 'active';
    const statusClause =
      status === 'active'
        ? sql`AND t.status IN ('Reported', 'Under Review', 'In Progress')`
        : status === 'all'
          ? sql``
          : sql`AND t.status = ${status}::ticket_status`;

    const search = filters.search?.trim() || null;
    const searchId = search && /^\d+$/.test(search) ? Number(search) : null;
    // postgres.js's tagged template needs a string, not a raw Date, when
    // the same placeholder value is reused across multiple interpolation
    // sites in one query (it otherwise throws ERR_INVALID_ARG_TYPE trying
    // to byte-serialize the Date directly) — ISO strings sidestep that.
    const dateFrom = filters.dateFrom?.toISOString() ?? null;
    const dateTo = filters.dateTo?.toISOString() ?? null;
    // Export-only, set by "Export selection" in the queue's bulk bar. It
    // NARROWS the already-scoped filter set — it is ANDed with office/status
    // /search like every other predicate, never used to look up ids outside
    // what resolveOfficeScope allows this admin to see.
    const ids = filters.ids?.length ? filters.ids : null;

    const rows = await sql<
      (Omit<AdminTicketExportRow, 'hazard_summary'> & {
        hazard_current: CurrentHazardRow | null;
      })[]
    >`
      SELECT t.id, t.status, t.assigned_office, t.category, b.name AS barangay_name,
        t.priority_index, t.member_count, t.created_at, t.updated_at,
        t.merged_into_ticket_id, t.resolution_outcome, t.resolved_at,
        ${hazardCurrentColumn(sql)}
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE (${filters.office ?? null}::text IS NULL OR t.assigned_office = ${filters.office ?? null}::office)
        ${statusClause}
        AND t.merged_into_ticket_id IS NULL
        AND (${filters.category ?? null}::text IS NULL OR t.category = ${filters.category ?? null})
        AND (${filters.barangayId ?? null}::int IS NULL OR t.barangay_id = ${filters.barangayId ?? null}::int)
        AND (${filters.categoryReview ? true : null}::boolean IS NULL OR t.category_review_required)
        AND (${dateFrom}::timestamptz IS NULL OR t.created_at >= ${dateFrom}::timestamptz)
        AND (${dateTo}::timestamptz IS NULL OR t.created_at <= ${dateTo}::timestamptz)
        AND (${ids}::int[] IS NULL OR t.id = ANY(${ids}::int[]))
        AND (
          ${search}::text IS NULL
          OR b.name ILIKE '%' || ${search} || '%'
          OR (${searchId}::int IS NOT NULL AND t.id = ${searchId}::int)
          OR EXISTS (
            SELECT 1 FROM reports r WHERE r.ticket_id = t.id AND r.title ILIKE '%' || ${search} || '%'
          )
        )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ${EXPORT_ROW_LIMIT + 1}
    `;
    assertExportLimit(rows);
    return rows.map(withHazardSummary);
  }

  async getTicketsGeo(
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
    requestedOffice: 'MEO' | 'MDRRMO' | 'all' | undefined,
  ): Promise<AdminTicketGeoRow[]> {
    const office = resolveOfficeScope(admin, requestedOffice) ?? null;
    const sql = this.pg;
    return sql<AdminTicketGeoRow[]>`
      SELECT t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
        t.priority_index, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
        r.title, r.image_url
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN LATERAL (
        SELECT title, image_url FROM reports
        WHERE reports.ticket_id = t.id
        ORDER BY reports.id ASC
        LIMIT 1
      ) r ON true
      WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
        AND t.merged_into_ticket_id IS NULL
        AND (${office}::text IS NULL OR t.assigned_office = ${office}::office)
    `;
  }

  async getTicketDetail(
    id: number,
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ) {
    const sql = this.pg;
    // Not filtered on merged_into_ticket_id: a merged-away ticket stays
    // viewable as read-only history (manuscript revision Phase 3, step 3d).
    const [row] = await sql<
      (Omit<TicketDetail, 'resolution_legacy' | 'disputed_current'> & {
        active_work_orders?: number;
      })[]
    >`
      SELECT t.id, t.category, t.barangay_id, b.name AS barangay_name, ST_AsGeoJSON(b.geom) AS barangay_geojson,
        t.status, t.assigned_office, t.initial_assigned_office, t.resolution_outcome,
        t.member_count, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
        t.priority_index,
        t.resolution_image_url, t.resolution_notes, t.created_at, t.updated_at,
        t.resolved_at, concat_ws(' ', ra.first_name, ra.last_name) AS resolved_by_name,
        t.disputed_at, t.dispute_reason, t.category_review_required,
        t.merged_into_ticket_id,
        (
          SELECT count(*)::int FROM work_orders w
          WHERE w.ticket_id = t.id AND w.status IN ('pending', 'in_progress')
        ) AS active_work_orders
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN admins ra ON ra.id = t.resolved_by_admin_id
      WHERE t.id = ${id}
    `;

    if (!row) return null;
    assertOfficeAccess(admin, row.assigned_office as 'MEO' | 'MDRRMO');
    // Whether this admin may Reassign or Refer the ticket now (manuscript
    // revision Phase 5, step 5a): the routing endpoints' own rule and
    // message, so the buttons never promise what the API refuses.
    const { active_work_orders: activeWorkOrders, ...base } = row;
    // Phase 5, step 5c: a legacy Resolved ticket's stored outcome is never
    // shown (decision 1), and the Disputed badge only follows a dispute of
    // the current resolution (decision 11).
    const legacy = isLegacyResolution(base.status, base.resolved_at);
    const ticket: TicketDetail = {
      ...base,
      resolved_by_name: base.resolved_at ? base.resolved_by_name || null : null,
      resolution_outcome: legacy ? null : base.resolution_outcome,
      resolution_legacy: legacy,
      disputed_current:
        base.disputed_at !== null &&
        (base.resolved_at === null ||
          new Date(base.disputed_at).getTime() >=
            new Date(base.resolved_at).getTime()),
    };
    const returnToReview: TicketReturnToReviewState = {
      available:
        returnBlock({
          id: ticket.id,
          status: ticket.status,
          resolutionOutcome: base.resolution_outcome,
          resolvedAt: ticket.resolved_at,
          mergedIntoTicketId: ticket.merged_into_ticket_id,
        }) === null,
    };
    const routing: TicketRoutingState = {
      blockedReason:
        routingBlock(admin, {
          id: ticket.id,
          status: ticket.status,
          assignedOffice: ticket.assigned_office as 'MEO' | 'MDRRMO',
          mergedIntoTicketId: ticket.merged_into_ticket_id,
          activeWorkOrders: activeWorkOrders ?? 0,
        })?.message ?? null,
    };

    const reports = await sql<TicketReport[]>`
      SELECT r.id, r.tracking_reference, r.title, r.description, r.citizen_severity, r.image_url,
        r.exif_captured_at, r.exif_data, r.location_mismatch_m, r.created_at,
        r.flags, r.moderation_status, r.submitted_category,
        ST_Y(r.pin_geom) AS pin_lat, ST_X(r.pin_geom) AS pin_lng,
        ST_Distance(r.pin_geom::geography, t.geom::geography) AS pin_distance_m,
        r.severity_screening_status, r.severity_screening_remarks
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.ticket_id = ${id} ORDER BY r.created_at
    `;
    // Staff-only columns (Phase 5, step 5c). On a return to Under Review,
    // the ticket's latest referral at that moment rides along for the
    // timeline line (decision 12: routing_actions is read only for this).
    const history = await sql<TicketStatusHistoryRow[]>`
      SELECT sh.status, sh.admin_name, sh.changed_at, sh.from_status, sh.reason,
        sh.resolution_outcome, sh.resolution_notes,
        lr.referral_target AS latest_referral_agency,
        lr.created_at AS latest_referral_at
      FROM status_history sh
      LEFT JOIN LATERAL (
        SELECT ra.referral_target, ra.created_at FROM routing_actions ra
        WHERE ra.ticket_id = sh.ticket_id AND ra.action_type = 'REFER'
          AND ra.created_at <= sh.changed_at
        ORDER BY ra.created_at DESC, ra.id DESC
        LIMIT 1
      ) lr ON sh.from_status = 'Resolved' AND sh.status = 'Under Review'
      WHERE sh.ticket_id = ${id} ORDER BY sh.changed_at, sh.id
    `;
    const reassignments = await sql<TicketReassignmentRow[]>`
      SELECT o.from_office, o.to_office, o.admin_name, o.reassigned_at,
        NULLIF(ra.reason, ${ROUTING_REASON_NOT_RECORDED}) AS reason
      FROM office_reassignments o
      LEFT JOIN LATERAL (
        SELECT reason FROM routing_actions
        WHERE ticket_id = o.ticket_id AND action_type = 'REASSIGN'
          AND created_at = o.reassigned_at AND to_office = o.to_office
        LIMIT 1
      ) ra ON true
      WHERE o.ticket_id = ${id} ORDER BY o.reassigned_at
    `;
    const referralEvents = await sql<
      {
        metadata: { agency: string; note?: string | null; reason?: string };
        actor_name: string;
        created_at: string;
      }[]
    >`
      SELECT metadata, actor_name, created_at FROM admin_audit_events
      WHERE target_type = 'ticket' AND target_id = ${id} AND action_type = 'ticket_referral_noted'
      ORDER BY created_at
    `;
    const referrals: TicketReferralRow[] = referralEvents.map((e) => ({
      agency: e.metadata.agency,
      note: e.metadata.reason ?? e.metadata.note ?? null,
      admin_name: e.actor_name,
      referred_at: e.created_at,
    }));

    // Staff corrections (manuscript revision Phase 3, step 3e), for the
    // timeline: old -> new, reason, who and when.
    const correctionEvents = await sql<
      {
        action_type: 'ticket_category_corrected' | 'ticket_location_corrected';
        metadata: Record<string, unknown>;
        actor_name: string;
        created_at: string;
      }[]
    >`
      SELECT action_type, metadata, actor_name, created_at FROM admin_audit_events
      WHERE target_type = 'ticket' AND target_id = ${id}
        AND action_type IN ('ticket_category_corrected', 'ticket_location_corrected')
      ORDER BY created_at
    `;
    const place = (barangay: unknown, lat: unknown, lng: unknown) =>
      `${String(barangay)} (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;
    const corrections: TicketCorrectionRow[] = correctionEvents.map((e) =>
      e.action_type === 'ticket_category_corrected'
        ? {
            field: 'category',
            old_value: String(e.metadata.oldValue),
            new_value: String(e.metadata.newValue),
            reason: (e.metadata.reason as string | undefined) ?? null,
            admin_name: e.actor_name,
            corrected_at: e.created_at,
          }
        : {
            field: 'location',
            old_value: place(
              e.metadata.oldBarangay,
              e.metadata.oldLat,
              e.metadata.oldLng,
            ),
            new_value: `${place(e.metadata.newBarangay, e.metadata.newLat, e.metadata.newLng)}, ${Number(e.metadata.distanceM)} m away`,
            reason: (e.metadata.reason as string | undefined) ?? null,
            admin_name: e.actor_name,
            corrected_at: e.created_at,
          },
    );

    ticket.direct_responsibility = categoryRouting(
      ticket.category,
    ).directResponsibility;

    // Manuscript revision Phase 3, step 3d. For a merged-away ticket: who
    // merged it into which ticket, when and why (from the ticket_merged
    // audit event written in the same transaction). For any ticket: the
    // tickets merged into it.
    let mergedInto: TicketMergedInto | null = null;
    if (ticket.merged_into_ticket_id !== null) {
      const [event] = await sql<
        { actor_name: string; created_at: string; reason: string | null }[]
      >`
        SELECT actor_name, created_at, metadata->>'reason' AS reason
        FROM admin_audit_events
        WHERE action_type = 'ticket_merged' AND target_type = 'ticket'
          AND target_id = ${ticket.merged_into_ticket_id}
          AND metadata->>'mergedTicketId' = ${String(id)}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      mergedInto = {
        ticketId: ticket.merged_into_ticket_id,
        mergedAt: event?.created_at ?? null,
        mergedByName: event?.actor_name ?? null,
        reason: event?.reason ?? null,
      };
    }
    const mergedFrom = (
      await sql<{ id: number }[]>`
        SELECT id FROM tickets WHERE merged_into_ticket_id = ${id} ORDER BY id
      `
    ).map((row) => row.id);

    // Every citizen answer on this ticket, oldest first. Answers are only
    // ever written against a survivor, so a merged-away ticket has none.
    const feedbackResponses = await sql<TicketCitizenFeedbackResponse[]>`
      SELECT feedback_type, reason, created_at FROM resolution_feedback
      WHERE ticket_id = ${id} ORDER BY created_at, id
    `;
    const citizenFeedback: TicketCitizenFeedback = {
      confirmed: feedbackResponses.filter(
        (f) => f.feedback_type === 'CONFIRMED',
      ).length,
      disputed: feedbackResponses.filter((f) => f.feedback_type === 'DISPUTED')
        .length,
      responses: feedbackResponses,
    };

    // The ticket's severity: the median of its member reports' severities
    // (manuscript revision Phase 4, step 4a). Each report keeps its own
    // citizen_severity in reports above.
    const severity: TicketSeverity = ticketSeverity(
      reports.map((r) => r.citizen_severity),
    );

    return {
      ticket,
      reports,
      severity,
      history,
      reassignments,
      referrals,
      corrections,
      mergedInto,
      mergedFrom,
      citizenFeedback,
      routing,
      returnToReview,
    };
  }

  // Live re-derivation of the same inputs OperationalPriorityService uses for this one
  // ticket, scoped by WHERE ticket_id — only meaningful while the ticket is
  // still active, since barangay density is computed over active tickets
  // only and freezes once resolved/rejected.
  async getTicketPriorityContext(
    ticketId: number,
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Promise<TicketPriorityContext | null> {
    const sql = this.pg;
    const [row] = await sql<
      {
        barangay_id: number;
        created_at: string;
        member_severities: string[];
        active_barangay_count: number;
        max_active_barangay_count: number;
        assigned_office: 'MEO' | 'MDRRMO';
      }[]
    >`
      WITH barangay_density AS (
        SELECT barangay_id, COUNT(*)::int AS active_barangay_count
        FROM tickets
        WHERE status IN ('Reported', 'Under Review', 'In Progress')
          AND merged_into_ticket_id IS NULL
        GROUP BY barangay_id
      )
      SELECT t.barangay_id, t.created_at, t.assigned_office,
        COALESCE((
          SELECT array_agg(citizen_severity ORDER BY created_at, id)
          FROM reports WHERE ticket_id = t.id
        ), ARRAY[]::text[]) AS member_severities,
        COALESCE(d.active_barangay_count, 0) AS active_barangay_count,
        COALESCE((SELECT MAX(active_barangay_count) FROM barangay_density), 0) AS max_active_barangay_count
      FROM tickets t
      LEFT JOIN barangay_density d ON d.barangay_id = t.barangay_id
      WHERE t.id = ${ticketId}
    `;
    if (!row) return null;
    assertOfficeAccess(admin, row.assigned_office);

    // The median of the member reports (manuscript revision Phase 4, step
    // 4a), the same common/utils/severity.ts rule OperationalPriorityService
    // writes priority_index with.
    const severity = ticketSeverity(row.member_severities);
    const breakdown = computePriorityBreakdown({
      severity: severity.label,
      severityFactor: severity.factor,
      createdAt: row.created_at,
      activeBarangayCount: row.active_barangay_count,
      maxActiveBarangayCount: row.max_active_barangay_count,
    });

    return { breakdown };
  }

  // The NEXT_STATUS ladder. Resolving (In Progress -> Resolved) is the only
  // step that takes an outcome, notes and an optional proof photo, and it
  // has its own rules (resolveTicket below); every other step ignores
  // notes, outcome and imageBuffer entirely.
  async advanceStatus(
    ticketId: number,
    admin: AdminSession,
    notes: unknown,
    imageBuffer: Buffer | undefined,
    outcome?: unknown,
    expectedStatus?: unknown,
  ): Promise<{ status: TicketStatus }> {
    const sql = this.pg;
    // Not filtered on merged_into_ticket_id, so a merged-away ticket is a
    // 409 (assertNotMergedAway), not a 404.
    const [ticket] = await sql<
      {
        status: TicketStatus;
        assigned_office: 'MEO' | 'MDRRMO';
        category: string;
        merged_into_ticket_id: number | null;
      }[]
    >`
      SELECT status, assigned_office, category, merged_into_ticket_id FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');
    assertOfficeAccess(admin, ticket.assigned_office);
    assertNotMergedAway({ id: ticketId, ...ticket });
    // The status the caller saw (IAN-32). Optional so API callers that never
    // sent it keep working; the Ticket Detail page always sends it, so a
    // second click on a stale page is refused instead of advancing the
    // ticket another step. Atomic with the update below: that UPDATE is
    // conditioned on the same status this check compared against.
    if (expectedStatus !== undefined) {
      if (!TICKET_STATUSES.includes(expectedStatus as TicketStatus)) {
        throw new BadRequestException(
          'expectedStatus must be a ticket status.',
        );
      }
      if (expectedStatus !== ticket.status) {
        throw new ConflictException(
          `Ticket #${ticketId} is already ${ticket.status}; it was not changed. Reload to see its current status.`,
        );
      }
    }

    const nextStatus = NEXT_STATUS[ticket.status];
    if (!nextStatus) {
      throw new BadRequestException(
        `No transition available from ${ticket.status}`,
      );
    }
    if (nextStatus === 'Resolved') {
      return this.resolveTicket(
        ticketId,
        admin,
        ticket.category,
        outcome,
        notes,
        imageBuffer,
      );
    }

    await sql.begin(async (tx) => {
      // Guarded on the status this request actually read: two requests
      // racing off the same starting status (double-click, retried
      // request, two admins) can no longer both succeed. The loser's
      // WHERE clause matches zero rows — Postgres serializes concurrent
      // UPDATEs to the same row, so the second one to actually execute
      // re-evaluates this condition against whatever the first one just
      // committed, not against the stale value read above.
      const updateResult = await tx`
        UPDATE tickets SET
          status = ${nextStatus},
          updated_at = now()
        WHERE id = ${ticketId} AND status = ${ticket.status}
      `;
      if (updateResult.count === 0) {
        throw new ConflictException(
          `Ticket status already changed by another request (expected ${ticket.status})`,
        );
      }
      await tx`
        INSERT INTO status_history (ticket_id, status, admin_id, admin_name, changed_at)
        VALUES (${ticketId}, ${nextStatus}, ${admin.adminId}, ${admin.adminName}, now())
      `;
      await this.audit.logInPgTx(tx, {
        actor: this.auditActor(admin),
        actionType: 'ticket_status_advanced',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${ticket.category})`,
        metadata: { from: ticket.status, to: nextStatus },
      });
      await this.notifyCitizensOfStatus(tx, ticketId, nextStatus);
    });

    return { status: nextStatus };
  }

  // Resolving (manuscript revision Phase 5, step 5c; migration 0046). The
  // caller (advanceStatus) has already applied the status-change gate:
  // operational Personnel of the ticket's current office, never a
  // merged-away ticket. Here: an outcome and non-blank notes are required
  // (400), no Work Order may be pending or in progress (409), and External
  // Referral needs a recorded referral (409) — checked once before the
  // optional photo is uploaded, so a refused request uploads nothing, and
  // again on the locked row. Everything else is written in one transaction:
  // the ticket's resolution record (outcome, notes, photo — NULL when there
  // is none, never carried over from an earlier resolution — resolved_at,
  // resolved_by), the status_history row with the same snapshot, the audit
  // event (with the outcome) and the citizen notifications; the resolve
  // email goes out after the commit, as before.
  private async resolveTicket(
    ticketId: number,
    admin: AdminSession,
    category: string,
    outcomeInput: unknown,
    notesInput: unknown,
    imageBuffer: Buffer | undefined,
  ): Promise<{ status: TicketStatus }> {
    const { outcome, notes } = validateResolutionInput(
      outcomeInput,
      notesInput,
    );
    const pre = await this.readResolveFacts(this.pg, ticketId, false);
    if (pre) {
      const block = resolveBlock({ id: ticketId, ...pre.facts }, outcome);
      if (block) throw toHttpException(block);
    }

    const imageUrl = imageBuffer
      ? await this.media.uploadImage(imageBuffer)
      : null;

    let emailRecipients: { email: string; reportId: number }[];
    try {
      emailRecipients = await this.pg.begin(async (tx) => {
        const locked = await this.readResolveFacts(tx, ticketId, true);
        if (!locked) throw new NotFoundException('Ticket not found');
        assertOfficeAccess(admin, locked.assigned_office);
        assertNotMergedAway({
          id: ticketId,
          merged_into_ticket_id: locked.merged_into_ticket_id,
        });
        if (locked.status !== 'In Progress') {
          throw new ConflictException(
            'Ticket status already changed by another request (expected In Progress)',
          );
        }
        const block = resolveBlock({ id: ticketId, ...locked.facts }, outcome);
        if (block) throw toHttpException(block);

        // Same optimistic status guard as the other ladder steps.
        const updateResult = await tx`
          UPDATE tickets SET
            status = 'Resolved',
            resolution_outcome = ${outcome}::resolution_outcome,
            resolution_notes = ${notes},
            resolution_image_url = ${imageUrl},
            resolved_at = now(),
            resolved_by_admin_id = ${admin.adminId},
            updated_at = now()
          WHERE id = ${ticketId} AND status = 'In Progress'
        `;
        if (updateResult.count === 0) {
          throw new ConflictException(
            'Ticket status already changed by another request (expected In Progress)',
          );
        }
        await tx`
          INSERT INTO status_history (
            ticket_id, status, from_status, admin_id, admin_name, changed_at,
            resolution_outcome, resolution_notes, resolution_image_url
          )
          VALUES (
            ${ticketId}, 'Resolved', 'In Progress', ${admin.adminId}, ${admin.adminName}, now(),
            ${outcome}::resolution_outcome, ${notes}, ${imageUrl}
          )
        `;
        await this.audit.logInPgTx(tx, {
          actor: this.auditActor(admin),
          actionType: 'ticket_status_advanced',
          targetType: 'ticket',
          targetId: ticketId,
          targetSummary: `Ticket #${ticketId} (${category})`,
          metadata: { from: 'In Progress', to: 'Resolved', outcome },
        });
        return this.notifyCitizensOfStatus(tx, ticketId, 'Resolved', outcome);
      });
    } catch (err) {
      throw checkViolationAsConflict(
        err,
        `Ticket #${ticketId} could not be resolved: its resolution record was refused by the database. Reload the ticket and try again.`,
      );
    }

    await this.sendResolvedEmails(
      emailRecipients,
      outcome === 'EXTERNAL_REFERRAL'
        ? 'REFERRED_OUTSIDE'
        : 'HANDLED_BY_MUNICIPALITY',
    );
    return { status: 'Resolved' };
  }

  // What the resolve rules read: the ticket's status, office and merge
  // state, its pending / in-progress Work Orders and its REFER routing
  // actions. lock = true takes the ticket's row lock for the rest of the
  // caller's transaction.
  private async readResolveFacts(
    client: Sql | TransactionSql,
    ticketId: number,
    lock: boolean,
  ): Promise<{
    status: string;
    assigned_office: 'MEO' | 'MDRRMO';
    merged_into_ticket_id: number | null;
    facts: { activeWorkOrders: number; referralCount: number };
  } | null> {
    const sql = client as Sql;
    type Row = {
      status: string;
      assigned_office: 'MEO' | 'MDRRMO';
      merged_into_ticket_id: number | null;
      active_work_orders: number;
      referral_count: number;
    };
    // Two literal queries rather than one with a FOR UPDATE fragment, so
    // each read is a single statement.
    const [row] = lock
      ? await sql<Row[]>`
          SELECT t.status, t.assigned_office, t.merged_into_ticket_id,
            (
              SELECT count(*)::int FROM work_orders w
              WHERE w.ticket_id = t.id AND w.status IN ('pending', 'in_progress')
            ) AS active_work_orders,
            (
              SELECT count(*)::int FROM routing_actions ra
              WHERE ra.ticket_id = t.id AND ra.action_type = 'REFER'
            ) AS referral_count
          FROM tickets t
          WHERE t.id = ${ticketId}
          FOR UPDATE OF t
        `
      : await sql<Row[]>`
          SELECT t.status, t.assigned_office, t.merged_into_ticket_id,
            (
              SELECT count(*)::int FROM work_orders w
              WHERE w.ticket_id = t.id AND w.status IN ('pending', 'in_progress')
            ) AS active_work_orders,
            (
              SELECT count(*)::int FROM routing_actions ra
              WHERE ra.ticket_id = t.id AND ra.action_type = 'REFER'
            ) AS referral_count
          FROM tickets t
          WHERE t.id = ${ticketId}
        `;
    if (!row) return null;
    return {
      status: row.status,
      assigned_office: row.assigned_office,
      merged_into_ticket_id: row.merged_into_ticket_id,
      facts: {
        activeWorkOrders: row.active_work_orders,
        referralCount: row.referral_count,
      },
    };
  }

  // Return to Under Review after a wrong referral (manuscript revision
  // Phase 5, step 5c). Only a ticket resolved by External Referral since
  // migration 0046 (resolved_at set) may return; a legacy Resolved ticket
  // never can. Same gate as resolving: operational Personnel of the
  // ticket's current office, never a merged-away ticket (read unfiltered so
  // it is a 409, not a 404). One transaction on the locked row: the status
  // change and the clearing of the ticket's resolution record in the same
  // UPDATE (so the 0046 CHECKs hold), a status_history row with the reason
  // (the earlier Resolved row keeps its snapshot, and the referral stays in
  // routing_actions — nothing earlier is touched), the audit event and the
  // ticket's Operational Priority and a generic citizen notice. No email. The
  // reason is staff-only.
  async returnToReview(
    ticketId: number,
    admin: AdminSession,
    reasonInput: unknown,
  ): Promise<{ status: 'Under Review' }> {
    const reason = validateReturnReason(reasonInput);

    try {
      await this.pg.begin(async (tx) => {
        const [ticket] = await tx<
          {
            status: string;
            assigned_office: 'MEO' | 'MDRRMO';
            category: string;
            merged_into_ticket_id: number | null;
            resolution_outcome: ResolutionOutcome | null;
            resolved_at: string | null;
          }[]
        >`
          SELECT status, assigned_office, category, merged_into_ticket_id,
            resolution_outcome, resolved_at
          FROM tickets WHERE id = ${ticketId}
          FOR UPDATE
        `;
        if (!ticket) throw new NotFoundException('Ticket not found');
        assertOfficeAccess(admin, ticket.assigned_office);
        assertNotMergedAway({ id: ticketId, ...ticket });
        const block = returnBlock({
          id: ticketId,
          status: ticket.status,
          resolutionOutcome: ticket.resolution_outcome,
          resolvedAt: ticket.resolved_at,
          mergedIntoTicketId: ticket.merged_into_ticket_id,
        });
        if (block) throw toHttpException(block);

        const [latestReferral] = await tx<{ id: number }[]>`
          SELECT id FROM routing_actions
          WHERE ticket_id = ${ticketId} AND action_type = 'REFER'
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `;

        const updateResult = await tx`
          UPDATE tickets SET
            status = 'Under Review',
            resolution_outcome = NULL,
            resolution_notes = NULL,
            resolution_image_url = NULL,
            resolved_at = NULL,
            resolved_by_admin_id = NULL,
            updated_at = now()
          WHERE id = ${ticketId}
            AND status = 'Resolved'
            AND resolution_outcome = 'EXTERNAL_REFERRAL'
            AND resolved_at IS NOT NULL
            AND merged_into_ticket_id IS NULL
        `;
        if (updateResult.count === 0) {
          throw new ConflictException(
            'Ticket status already changed by another request (expected Resolved by External referral)',
          );
        }
        await tx`
          INSERT INTO status_history (ticket_id, status, from_status, reason, admin_id, admin_name, changed_at)
          VALUES (${ticketId}, 'Under Review', 'Resolved', ${reason}, ${admin.adminId}, ${admin.adminName}, now())
        `;
        await this.audit.logInPgTx(tx, {
          actor: this.auditActor(admin),
          actionType: 'ticket_returned_to_review',
          targetType: 'ticket',
          targetId: ticketId,
          targetSummary: `Ticket #${ticketId} (${ticket.category})`,
          metadata: {
            from: 'Resolved',
            to: 'Under Review',
            reason,
            previousOutcome: ticket.resolution_outcome,
            latestReferralId: latestReferral?.id ?? null,
          },
        });
        // Active again: its priority commits with the return.
        await this.operationalPriority.recalculateTickets(tx, [ticketId]);
        await notifyTicketCitizens(
          tx,
          this.notifications,
          ticketId,
          BACK_UNDER_REVIEW,
        );
      });
    } catch (err) {
      throw checkViolationAsConflict(
        err,
        `Ticket #${ticketId} could not be returned to Under Review: the change was refused by the database. Reload the ticket and try again.`,
      );
    }

    // Barangay demand moved for the other active tickets there.
    await this.operationalPriority.recalculateActiveTickets();
    return { status: 'Under Review' };
  }

  private auditActor(admin: AdminSession) {
    return {
      adminId: admin.adminId,
      adminName: admin.adminName,
      email: admin.email,
      accountType: admin.accountType,
      office: admin.office,
    };
  }

  // The in-app status notification for each distinct citizen reporter
  // (STATUS_NOTIFICATION), inside a savepoint in the caller's transaction.
  // A notification failure never rolls back the action. Returns the
  // email recipients: only Resolved warrants an email through this ladder
  // (the rest stay in-app-only), per PLAN.md's notification-system design
  // decision. Rejected is a separate terminal outcome reached via
  // rejectTicket, never via this ladder — see that method for its own (also
  // selective) email send.
  private async notifyCitizensOfStatus(
    tx: TransactionSql,
    ticketId: number,
    status: TicketStatus,
    outcome?: ResolutionOutcome,
  ): Promise<{ email: string; reportId: number }[]> {
    const notice =
      status === 'Resolved'
        ? resolvedNotice({
            status,
            resolvedAt: outcome ? 'recorded' : null,
            outcomeCode: outcome ?? null,
          })
        : STATUS_NOTIFICATION[status];
    if (!notice) return [];

    const citizenRows = await notifyTicketCitizens(
      tx,
      this.notifications,
      ticketId,
      notice,
    );
    return status === 'Resolved'
      ? citizenRows.map((row) => ({
          email: row.email,
          reportId: row.report_id,
        }))
      : [];
  }

  // Post-commit, never inside the transaction — an external HTTP call has
  // no place holding a DB transaction open. Both send methods never throw
  // (ResendEmailService's existing contract), but the try/catch here is the
  // belt-and-suspenders guarantee that a misbehaving EmailService
  // implementation can never undo or block the status change that already
  // committed.
  private async sendResolvedEmails(
    recipients: { email: string; reportId: number }[],
    outcome: CitizenOutcome | null = null,
  ): Promise<void> {
    if (recipients.length === 0) return;
    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    for (const recipient of recipients) {
      try {
        const reportUrl = `${webOrigin}/dashboard/reports/${recipient.reportId}`;
        await this.email.sendReportResolved(
          recipient.email,
          reportUrl,
          outcome,
        );
      } catch {
        // Never let an email failure surface to the caller — the status
        // change and in-app notification already committed.
      }
    }
  }

  // Manual Reassign (manuscript pp. 43–44, Appendix H ROUTING_ACTIONS;
  // manuscript revision Phase 5, step 5a). Reached by the operational
  // Ticket Detail / bulk bar (own-office Personnel) and by Focal intake
  // (FocalIntakeService.reassign) — one mechanism, one rule
  // (ticket-routing.rules.ts), checked here on the locked row inside the
  // transaction so a race with work starting elsewhere loses safely. The
  // reason is required.
  async reassignOffice(
    ticketId: number,
    admin: AdminSession,
    toOffice: 'MEO' | 'MDRRMO',
    reason: unknown,
  ): Promise<{ assignedOffice: 'MEO' | 'MDRRMO' }> {
    const routingReason = validateRoutingReason(reason);
    await this.pg.begin(async (tx) => {
      const ticket = await this.lockForRouting(tx, ticketId);
      await this.assertCanReassign(ticketId, ticket, admin, toOffice, () =>
        Promise.resolve(ticket.active_work_orders),
      );
      await this.writeReassignment(tx, {
        ticketId,
        category: ticket.category,
        fromOffice: ticket.assigned_office,
        toOffice,
        admin,
        reason: routingReason,
      });
    });

    return { assignedOffice: toOffice };
  }

  // Reassign's own preconditions (routingBlock, then a same-office no-op).
  // Also checked by the category correction (manuscript revision Phase 3,
  // step 3e), which reassigns in its own transaction when the new category
  // belongs to the other office; it passes the active Work Order count it
  // already read on the locked row.
  async assertCanReassign(
    ticketId: number,
    ticket: {
      assigned_office: 'MEO' | 'MDRRMO';
      status: string;
      merged_into_ticket_id: number | null;
    },
    admin: AdminSession,
    toOffice: 'MEO' | 'MDRRMO',
    activeWorkOrders: () => Promise<number>,
  ): Promise<void> {
    const facts = {
      id: ticketId,
      status: ticket.status,
      assignedOffice: ticket.assigned_office,
      mergedIntoTicketId: ticket.merged_into_ticket_id,
      activeWorkOrders: await activeWorkOrders(),
    };
    const block =
      routingBlock(admin, facts) ?? reassignDestinationBlock(facts, toOffice);
    if (block) throw toHttpException(block);
  }

  // The ticket row a Reassign or Refer acts on, locked for the rest of the
  // caller's transaction, with its pending / in-progress Work Order count.
  private async lockForRouting(
    tx: TransactionSql,
    ticketId: number,
  ): Promise<{
    assigned_office: 'MEO' | 'MDRRMO';
    category: string;
    status: string;
    merged_into_ticket_id: number | null;
    active_work_orders: number;
  }> {
    const [ticket] = await tx<
      {
        assigned_office: 'MEO' | 'MDRRMO';
        category: string;
        status: string;
        merged_into_ticket_id: number | null;
        active_work_orders: number;
      }[]
    >`
      SELECT t.assigned_office, t.category, t.status, t.merged_into_ticket_id,
        (
          SELECT count(*)::int FROM work_orders w
          WHERE w.ticket_id = t.id AND w.status IN ('pending', 'in_progress')
        ) AS active_work_orders
      FROM tickets t
      WHERE t.id = ${ticketId}
      FOR UPDATE OF t
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  // The Reassign write: the office change, its office_reassignments and
  // routing_actions rows and the ticket_reassigned audit event, inside the
  // caller's transaction. reason is the routing reason — the Reassign's own,
  // or the category correction's.
  async writeReassignment(
    tx: TransactionSql,
    params: {
      ticketId: number;
      category: string;
      fromOffice: 'MEO' | 'MDRRMO';
      toOffice: 'MEO' | 'MDRRMO';
      admin: AdminSession;
      reason: string;
    },
  ): Promise<void> {
    const { ticketId, fromOffice, toOffice, admin, reason } = params;
    await tx`UPDATE tickets SET assigned_office = ${toOffice}, updated_at = now() WHERE id = ${ticketId}`;
    await tx`
      INSERT INTO office_reassignments (ticket_id, from_office, to_office, admin_id, admin_name)
      VALUES (${ticketId}, ${fromOffice}, ${toOffice}, ${admin.adminId}, ${admin.adminName})
    `;
    // Appendix H routing_actions (manuscript revision Phase 2, step 2c),
    // written alongside office_reassignments (the timeline still reads
    // office_reassignments). Same transaction, so now() equals
    // reassigned_at — the key migration 0037 uses to skip rows it already
    // has, and the key the timeline joins the reason on.
    await tx`
      INSERT INTO routing_actions (ticket_id, action_type, from_office, to_office, reason, admin_id, admin_name, created_at)
      VALUES (
        ${ticketId}, 'REASSIGN', ${fromOffice}, ${toOffice}, ${reason},
        ${admin.adminId}, left(${admin.adminName}::text, ${ROUTING_ADMIN_NAME_MAX_LENGTH}::int), now()
      )
    `;
    await this.audit.logInPgTx(tx, {
      actor: {
        adminId: admin.adminId,
        adminName: admin.adminName,
        email: admin.email,
        accountType: admin.accountType,
        office: admin.office,
      },
      actionType: 'ticket_reassigned',
      targetType: 'ticket',
      targetId: ticketId,
      targetSummary: `Ticket #${ticketId} (${params.category})`,
      metadata: { from: fromOffice, to: toOffice, reason },
    });
    await notifyTicketCitizens(
      tx,
      this.notifications,
      ticketId,
      reassignedNotice(toOffice),
    );
  }

  // Manual Refer (manuscript pp. 43–44, Appendix H ROUTING_ACTIONS;
  // manuscript revision Phase 5, step 5a): documents that a ticket was
  // referred to an external agency (solid waste enforcement, water/electric
  // utility, MENRO, DPWH, barangay clearing, etc.) — never mutates the
  // ticket row itself. This is history, not a status: assigned_office/status
  // are governed entirely by their own rules, unaffected by a referral. See
  // TicketReferralRow for why the read side must never be treated as live
  // "currently pending" state. Same callers and same rule as Reassign; the
  // reason is required, and a repeat of the ticket's latest referral to the
  // same agency is refused as a no-op.
  async logReferral(
    ticketId: number,
    admin: AdminSession,
    agency: unknown,
    reason: unknown,
  ): Promise<void> {
    const referralTarget = validateReferralAgency(agency);
    const routingReason = validateRoutingReason(reason);

    await this.pg.begin(async (tx) => {
      const ticket = await this.lockForRouting(tx, ticketId);
      const [latest] = await tx<
        { action_type: 'REASSIGN' | 'REFER'; referral_target: string | null }[]
      >`
        SELECT action_type, referral_target FROM routing_actions
        WHERE ticket_id = ${ticketId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `;
      const facts = {
        id: ticketId,
        status: ticket.status,
        assignedOffice: ticket.assigned_office,
        mergedIntoTicketId: ticket.merged_into_ticket_id,
        activeWorkOrders: ticket.active_work_orders,
      };
      const block =
        routingBlock(admin, facts) ??
        referDestinationBlock(
          facts,
          referralTarget,
          latest
            ? {
                actionType: latest.action_type,
                referralTarget: latest.referral_target,
              }
            : null,
        );
      if (block) throw toHttpException(block);

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          accountType: admin.accountType,
          office: admin.office,
        },
        actionType: 'ticket_referral_noted',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${ticket.category})`,
        // reason since Phase 5, step 5a; older events carry an optional
        // note instead, and stay as they are.
        metadata: { agency: referralTarget, reason: routingReason },
      });
      // Appendix H routing_actions (manuscript revision Phase 2, step 2c),
      // written alongside the audit event. Same transaction, so now()
      // equals the event's created_at, and referral_target is the agency
      // exactly as stored in its metadata — the key migration 0037 uses to
      // skip rows it already has.
      await tx`
        INSERT INTO routing_actions (ticket_id, action_type, from_office, to_office, referral_target, reason, admin_id, admin_name, created_at)
        VALUES (
          ${ticketId}, 'REFER', ${ticket.assigned_office}, NULL, ${referralTarget}, ${routingReason},
          ${admin.adminId}, left(${admin.adminName}::text, ${ROUTING_ADMIN_NAME_MAX_LENGTH}::int), now()
        )
      `;
      await notifyTicketCitizens(
        tx,
        this.notifications,
        ticketId,
        referredNotice(referralTarget),
      );
    });
  }

  // A separate terminal outcome, not a NEXT_STATUS ladder entry — reachable
  // from any active status, unlike the linear Reported -> ... -> Resolved
  // progression advanceStatus enforces. The reason is required (mirrors
  // disputeReport's exact validation shape) and is stored only in this
  // action's own admin_audit_events row (metadata.reason) — never a ticket
  // column, matching how logReferral above documents its agency/note.
  async rejectTicket(
    ticketId: number,
    admin: AdminSession,
    reason: string,
  ): Promise<{ status: 'Rejected' }> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('A reason is required.');
    }
    if (trimmedReason.length > TICKET_REJECTION_REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `Reason must be ${TICKET_REJECTION_REASON_MAX_LENGTH} characters or fewer.`,
      );
    }

    const sql = this.pg;
    const emailRecipients = await sql.begin(async (tx) => {
      const [ticket] = await tx<
        {
          status: TicketStatus;
          assigned_office: 'MEO' | 'MDRRMO';
          category: string;
          merged_into_ticket_id: number | null;
          active_work_orders: number;
        }[]
      >`
        SELECT t.status, t.assigned_office, t.category, t.merged_into_ticket_id,
          (SELECT count(*)::int FROM work_orders w
           WHERE w.ticket_id = t.id AND w.status IN ('pending', 'in_progress')) AS active_work_orders
        FROM tickets t WHERE t.id = ${ticketId}
        FOR UPDATE OF t
      `;
      if (!ticket) throw new NotFoundException('Ticket not found');
      assertOfficeAccess(admin, ticket.assigned_office);
      assertNotMergedAway({ id: ticketId, ...ticket });
      if (!ACTIVE_TICKET_STATUSES.includes(ticket.status)) {
        throw new ConflictException(
          `Ticket is already ${ticket.status} and cannot be rejected.`,
        );
      }
      if (ticket.active_work_orders > 0) {
        throw new ConflictException(
          `Ticket #${ticketId} has ${ticket.active_work_orders} active Work Order${ticket.active_work_orders === 1 ? '' : 's'}. Complete or cancel ${ticket.active_work_orders === 1 ? 'it' : 'them'} before rejecting the ticket.`,
        );
      }

      const updateResult = await tx`
        UPDATE tickets SET status = 'Rejected', updated_at = now()
        WHERE id = ${ticketId} AND status = ${ticket.status}
          AND status IN ('Reported', 'Under Review', 'In Progress')
      `;
      if (updateResult.count === 0) {
        throw new ConflictException(
          `Ticket #${ticketId} is already changed; it was not rejected. Reload to see its current status.`,
        );
      }
      await tx`
        INSERT INTO status_history (ticket_id, status, admin_id, admin_name, changed_at)
        VALUES (${ticketId}, 'Rejected', ${admin.adminId}, ${admin.adminName}, now())
      `;
      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          accountType: admin.accountType,
          office: admin.office,
        },
        actionType: 'ticket_rejected',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${ticket.category})`,
        metadata: {
          from: ticket.status,
          to: 'Rejected',
          reason: trimmedReason,
        },
      });

      let citizenRows: Awaited<ReturnType<typeof ticketReporters>> = [];
      await bestEffortNotifications(tx, async (sp) => {
        citizenRows = await ticketReporters(sp, ticketId);
        for (const row of citizenRows) {
          await this.notifications.createInTx(sp, {
            recipientType: 'citizen',
            recipientId: row.citizen_id,
            type: 'ticket_rejected',
            title: 'Report not accepted',
            message: `Your report was not accepted: ${trimmedReason}`,
            href: `/dashboard/reports/${row.report_id}`,
            entityType: 'ticket',
            entityId: ticketId,
          });
        }
      });

      return citizenRows.map((row) => ({
        email: row.email,
        reportId: row.report_id,
      }));
    });

    if (emailRecipients.length > 0) {
      const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
      for (const recipient of emailRecipients) {
        try {
          const reportUrl = `${webOrigin}/dashboard/reports/${recipient.reportId}`;
          await this.email.sendReportRejected(
            recipient.email,
            reportUrl,
            trimmedReason,
          );
        } catch {
          // Never let an email failure surface to the caller — the status
          // change and in-app notification already committed.
        }
      }
    }

    return { status: 'Rejected' };
  }

  // ---- Bulk actions -------------------------------------------------
  //
  // Every bulk method below deliberately LOOPS the single-ticket method
  // rather than issuing one wide UPDATE. That is what keeps bulk work
  // identical to single work: the same assertOfficeAccess check, the same
  // status_history row, the same per-ticket admin_audit_events entry, and
  // the same citizen notification/email fan-out. A set-based UPDATE would
  // be faster and would quietly become a second authorization path with no
  // audit trail — exactly the drift CLAUDE.md warns about for CSV exports.
  //
  // Per-ticket failures are caught and reported as `skipped`, never thrown:
  // one ticket another office owns, or one already sitting at Resolved,
  // must not roll back the twenty that succeeded.
  private async runBulk(
    ticketIds: number[],
    run: (id: number) => Promise<void>,
  ): Promise<BulkActionResult> {
    const result: BulkActionResult = { ok: [], skipped: [] };
    for (const id of ticketIds) {
      try {
        await run(id);
        result.ok.push(id);
      } catch (err) {
        result.skipped.push({
          id,
          reason:
            err instanceof Error && err.message
              ? err.message
              : 'Could not be updated.',
        });
      }
    }
    return result;
  }

  // Resolving needs a per-ticket outcome and resolution notes (and may
  // carry a photo) — manuscript revision Phase 5, step 5c — so a ticket
  // sitting at "In Progress" is filtered out here BEFORE the loop rather
  // than being resolved without them. The admin is told to open those
  // tickets individually.
  async bulkAdvanceStatus(
    ticketIds: number[],
    admin: AdminSession,
  ): Promise<BulkActionResult> {
    const sql = this.pg;
    const rows = await sql<{ id: number; status: TicketStatus }[]>`
      SELECT id, status FROM tickets WHERE id = ANY(${ticketIds}::int[])
    `;
    const statusById = new Map(rows.map((r) => [r.id, r.status]));

    const eligible: number[] = [];
    const skipped: { id: number; reason: string }[] = [];
    for (const id of ticketIds) {
      const status = statusById.get(id);
      if (!status) {
        skipped.push({ id, reason: 'Ticket not found.' });
        continue;
      }
      const next = NEXT_STATUS[status];
      if (!next) {
        skipped.push({
          id,
          reason: `Already ${status} — no transition available.`,
        });
        continue;
      }
      if (next === 'Resolved') {
        skipped.push({
          id,
          reason:
            'Resolving needs an outcome and resolution notes — open the ticket to resolve it.',
        });
        continue;
      }
      eligible.push(id);
    }

    // Each ticket advances from the status it had when it was checked here,
    // so a ticket that moved on in between is skipped, not advanced twice.
    const result = await this.runBulk(eligible, async (id) => {
      await this.advanceStatus(
        id,
        admin,
        undefined,
        undefined,
        undefined,
        statusById.get(id),
      );
    });
    return { ok: result.ok, skipped: [...skipped, ...result.skipped] };
  }

  // One required reason for the whole selection (manuscript revision Phase
  // 5, step 5a), validated up front so a blank one refuses the request
  // rather than skipping every ticket; each ticket is then reassigned — and
  // checked — on its own, with that reason on its routing_actions row.
  async bulkReassign(
    ticketIds: number[],
    admin: AdminSession,
    toOffice: 'MEO' | 'MDRRMO',
    reason: unknown,
  ): Promise<BulkActionResult> {
    const routingReason = validateRoutingReason(reason);
    return this.runBulk(ticketIds, async (id) => {
      await this.reassignOffice(id, admin, toOffice, routingReason);
    });
  }
}
