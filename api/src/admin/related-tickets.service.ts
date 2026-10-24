import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import {
  assertOfficeAccess,
  isFocalPersonnel,
} from '../common/authz/admin-scope';
import { radiusForCategory } from '../common/utils/radius';
import type { TicketStatus } from './ticket-constants';
import {
  type GroupingActor,
  type GroupingTicketFacts,
  mergeBlock,
  regroupBlock,
  removeBlock,
} from './ticket-grouping.rules';

// Suggested related tickets (manuscript pp. 31, 78 and the PostGIS section;
// handoff Decision 1; manuscript revision Phase 3, step 3c). Suggestions
// only: distance and category alone don't establish the same incident, so
// nothing here merges, groups, writes, audits or notifies. Staff confirm
// with Merge / Move (step 3d, TicketGroupingService); the blocked reasons
// below tell the panel which of those the viewer may do, from the same rules.
export const RELATED_CANDIDATES_LIMIT = 10;

// Why an action is not available, in the words the action itself would
// answer with; null when it is.
export interface CandidateBlockedReasons {
  // Merge the candidate into the viewed ticket (the viewed one survives).
  mergeIntoViewed: string | null;
  // Merge the viewed ticket into the candidate.
  mergeViewedInto: string | null;
  // Move one of the viewed ticket's reports to the candidate.
  moveReportHere: string | null;
}

// Only what the panel shows: no citizen identity, photos, descriptions,
// flags, Work Order or assessment data (whether a Work Order blocks an
// action shows only as that action's blocked reason).
export interface RelatedTicketCandidate {
  ticketId: number;
  category: string;
  status: TicketStatus;
  assignedOffice: 'MEO' | 'MDRRMO';
  barangayName: string;
  distanceM: number;
  memberCount: number;
  createdAt: string;
  // The earliest member report: its submission time, tracking reference,
  // and id (Focal opens intake detail by report).
  reportedAt: string | null;
  trackingReference: string | null;
  firstReportId: number | null;
  blockedReasons: CandidateBlockedReasons;
}

export interface RelatedTicketCandidates {
  radiusM: number;
  viewed: {
    ticketId: number;
    createdAt: string;
    reportCount: number;
    mergedIntoTicketId: number | null;
    // Taking one of its reports out into a ticket of its own.
    blockedReasons: { removeReport: string | null };
  };
  candidates: RelatedTicketCandidate[];
}

interface ViewedTicket {
  id: number;
  category: string;
  status: TicketStatus;
  assigned_office: 'MEO' | 'MDRRMO';
  merged_into_ticket_id: number | null;
  created_at: string;
  report_count: number;
  active_work_orders: number;
}

interface CandidateRow {
  id: number;
  category: string;
  status: TicketStatus;
  assigned_office: 'MEO' | 'MDRRMO';
  barangay_name: string;
  distance_m: number;
  member_count: number;
  created_at: string;
  active_work_orders: number;
  first_report_id: number | null;
  tracking_reference: string | null;
  reported_at: string | null;
}

@Injectable()
export class RelatedTicketsService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  // Ticket Detail: the viewed ticket passes the same check as GET
  // /admin/tickets/:id (missing -> null -> 404; another office, Focal or the
  // System Administrator -> 403), and the candidates come from the caller's
  // own office only (the ticket's office, just checked).
  async forTicket(
    ticketId: number,
    admin: GroupingActor,
  ): Promise<RelatedTicketCandidates | null> {
    const [ticket] = await this.pg<ViewedTicket[]>`
      SELECT t.id, t.category, t.status, t.assigned_office, t.merged_into_ticket_id, t.created_at,
        (SELECT count(*)::int FROM reports rc WHERE rc.ticket_id = t.id) AS report_count,
        (SELECT count(*)::int FROM work_orders wo
          WHERE wo.ticket_id = t.id AND wo.status IN ('pending', 'in_progress')) AS active_work_orders
      FROM tickets t WHERE t.id = ${ticketId}
    `;
    if (!ticket) return null;
    assertOfficeAccess(admin, ticket.assigned_office);
    return this.candidates(ticket, ticket.assigned_office, admin);
  }

  // Focal intake works from a report, so this uses that report's ticket.
  // Focal's intake is municipality-wide, so candidates come from both
  // offices. The route is behind FocalGuard; checked again here.
  async forReport(
    reportId: number,
    admin: GroupingActor,
  ): Promise<RelatedTicketCandidates | null> {
    if (!isFocalPersonnel(admin)) {
      throw new ForbiddenException('Focal Intake access required.');
    }
    const [ticket] = await this.pg<ViewedTicket[]>`
      SELECT t.id, t.category, t.status, t.assigned_office, t.merged_into_ticket_id, t.created_at,
        (SELECT count(*)::int FROM reports rc WHERE rc.ticket_id = t.id) AS report_count,
        (SELECT count(*)::int FROM work_orders wo
          WHERE wo.ticket_id = t.id AND wo.status IN ('pending', 'in_progress')) AS active_work_orders
      FROM reports r JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ${reportId}
    `;
    if (!ticket) return null;
    return this.candidates(ticket, null, admin);
  }

  // Active tickets (Reported / Under Review / In Progress) of the same
  // current category, not merged away, within the radius of the viewed
  // ticket's category, nearest first. The `&&` bounding-box test lets the
  // geometry GiST index (tickets_geom_idx) narrow the search; ST_DWithin on
  // geography then decides in metres. The box is built from a buffer 1 m
  // wider than the radius, so it can never cut off a ticket ST_DWithin
  // accepts.
  private async candidates(
    viewed: ViewedTicket,
    office: 'MEO' | 'MDRRMO' | null,
    admin: GroupingActor,
  ): Promise<RelatedTicketCandidates> {
    const radiusM = radiusForCategory(viewed.category);
    const rows = await this.pg<CandidateRow[]>`
      SELECT
        t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
        round(ST_Distance(t.geom::geography, v.geom::geography))::int AS distance_m,
        t.member_count, t.created_at,
        (SELECT count(*)::int FROM work_orders wo
          WHERE wo.ticket_id = t.id AND wo.status IN ('pending', 'in_progress')) AS active_work_orders,
        first_report.id AS first_report_id,
        first_report.tracking_reference,
        first_report.created_at AS reported_at
      FROM tickets v
      JOIN tickets t ON t.id <> v.id AND t.category = v.category
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN LATERAL (
        SELECT r.id, r.tracking_reference, r.created_at
        FROM reports r
        WHERE r.ticket_id = t.id
        ORDER BY r.created_at, r.id
        LIMIT 1
      ) first_report ON true
      WHERE v.id = ${viewed.id}
        AND t.merged_into_ticket_id IS NULL
        AND t.status IN ('Reported', 'Under Review', 'In Progress')
        AND (${office}::text IS NULL OR t.assigned_office = ${office}::office)
        AND t.geom && ST_Envelope(ST_Buffer(v.geom::geography, ${radiusM + 1})::geometry)
        AND ST_DWithin(t.geom::geography, v.geom::geography, ${radiusM})
      ORDER BY ST_Distance(t.geom::geography, v.geom::geography), t.id
      LIMIT ${RELATED_CANDIDATES_LIMIT}
    `;

    const viewedFacts: GroupingTicketFacts = {
      id: viewed.id,
      status: viewed.status,
      assignedOffice: viewed.assigned_office,
      category: viewed.category,
      mergedIntoTicketId: viewed.merged_into_ticket_id ?? null,
      activeWorkOrders: viewed.active_work_orders ?? 0,
    };
    const reason = (block: { message: string } | null) =>
      block?.message ?? null;

    return {
      radiusM,
      viewed: {
        ticketId: viewed.id,
        createdAt: viewed.created_at,
        reportCount: viewed.report_count,
        mergedIntoTicketId: viewed.merged_into_ticket_id ?? null,
        blockedReasons: {
          removeReport: reason(
            removeBlock(admin, viewedFacts, viewed.report_count),
          ),
        },
      },
      candidates: rows.map((row) => {
        const candidateFacts: GroupingTicketFacts = {
          id: row.id,
          status: row.status,
          assignedOffice: row.assigned_office,
          category: row.category,
          mergedIntoTicketId: null,
          activeWorkOrders: row.active_work_orders ?? 0,
        };
        return {
          ticketId: row.id,
          category: row.category,
          status: row.status,
          assignedOffice: row.assigned_office,
          barangayName: row.barangay_name,
          distanceM: row.distance_m,
          memberCount: row.member_count,
          createdAt: row.created_at,
          reportedAt: row.reported_at,
          trackingReference: row.tracking_reference,
          firstReportId: row.first_report_id,
          blockedReasons: {
            mergeIntoViewed: reason(
              mergeBlock(admin, viewedFacts, candidateFacts),
            ),
            mergeViewedInto: reason(
              mergeBlock(admin, candidateFacts, viewedFacts),
            ),
            moveReportHere: reason(
              regroupBlock(
                admin,
                viewedFacts,
                candidateFacts,
                viewed.report_count,
              ),
            ),
          },
        };
      }),
    };
  }
}
