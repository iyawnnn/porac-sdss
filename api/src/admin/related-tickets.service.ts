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

// Suggested related tickets (manuscript pp. 31, 78 and the PostGIS section;
// handoff Decision 1; manuscript revision Phase 3, step 3c). Suggestions
// only: distance and category alone don't establish the same incident, so
// nothing here merges, groups, writes, audits or notifies. Staff confirm
// (step 3d).
export const RELATED_CANDIDATES_LIMIT = 10;

// Only what the panel shows: no citizen identity, photos, descriptions,
// flags, Work Order or assessment data.
export interface RelatedTicketCandidate {
  ticketId: number;
  category: string;
  status: TicketStatus;
  assignedOffice: 'MEO' | 'MDRRMO';
  barangayName: string;
  distanceM: number;
  memberCount: number;
  // The earliest member report: its submission time, tracking reference,
  // and id (Focal opens intake detail by report).
  reportedAt: string | null;
  trackingReference: string | null;
  firstReportId: number | null;
}

export interface RelatedTicketCandidates {
  radiusM: number;
  candidates: RelatedTicketCandidate[];
}

interface ViewedTicket {
  id: number;
  category: string;
  assigned_office: 'MEO' | 'MDRRMO';
}

interface CandidateRow {
  id: number;
  category: string;
  status: TicketStatus;
  assigned_office: 'MEO' | 'MDRRMO';
  barangay_name: string;
  distance_m: number;
  member_count: number;
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
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Promise<RelatedTicketCandidates | null> {
    const [ticket] = await this.pg<ViewedTicket[]>`
      SELECT id, category, assigned_office FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) return null;
    assertOfficeAccess(admin, ticket.assigned_office);
    return this.candidates(ticket, ticket.assigned_office);
  }

  // Focal intake works from a report, so this uses that report's ticket.
  // Focal's intake is municipality-wide, so candidates come from both
  // offices. The route is behind FocalGuard; checked again here.
  async forReport(
    reportId: number,
    admin: Pick<AdminSession, 'accountType' | 'isFocal'>,
  ): Promise<RelatedTicketCandidates | null> {
    if (!isFocalPersonnel(admin)) {
      throw new ForbiddenException('Focal Intake access required.');
    }
    const [ticket] = await this.pg<ViewedTicket[]>`
      SELECT t.id, t.category, t.assigned_office
      FROM reports r JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ${reportId}
    `;
    if (!ticket) return null;
    return this.candidates(ticket, null);
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
  ): Promise<RelatedTicketCandidates> {
    const radiusM = radiusForCategory(viewed.category);
    const rows = await this.pg<CandidateRow[]>`
      SELECT
        t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
        round(ST_Distance(t.geom::geography, v.geom::geography))::int AS distance_m,
        t.member_count,
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
    return {
      radiusM,
      candidates: rows.map((row) => ({
        ticketId: row.id,
        category: row.category,
        status: row.status,
        assignedOffice: row.assigned_office,
        barangayName: row.barangay_name,
        distanceM: row.distance_m,
        memberCount: row.member_count,
        reportedAt: row.reported_at,
        trackingReference: row.tracking_reference,
        firstReportId: row.first_report_id,
      })),
    };
  }
}
