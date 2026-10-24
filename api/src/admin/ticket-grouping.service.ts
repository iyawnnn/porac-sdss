import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import { BarangayService } from '../domain/barangay.service';
import { OperationalPriorityService } from '../domain/operational-priority.service';
import { officeForCategory } from '../common/utils/office';
import { AdminAuditService, type AdminAuditActor } from './admin-audit.service';
import {
  type GroupingTicketFacts,
  mergeBlock,
  regroupBlock,
  removeBlock,
  toHttpException,
  validateGroupingReason,
  validateTicketId,
} from './ticket-grouping.rules';

// Staff Merge / Remove / Regroup of related reports (manuscript revision
// Phase 3, step 3d; handoff Decisions 1, 2, 11, 12). Grouping is always a
// human decision: the "Possibly related tickets" panel (step 3c) only
// suggests, and these actions apply it.
//
// - Merge moves every report of the merged-away ticket to the survivor and
//   sets merged_into_ticket_id. The merged-away ticket keeps its status,
//   assessment, Work Orders, acknowledgment, routing and status history as
//   history, and is read-only from then on. The survivor keeps its own
//   location: there is no centroid recalculation.
// - Remove gives one report a new ticket of its own, created exactly as a
//   new submission's would be.
// - Regroup moves one report to another active ticket.
//
// Each runs in one transaction. Tickets are locked first (SELECT ... FOR
// UPDATE, ascending id), then the moved report row, so two of these
// actions on overlapping tickets can't deadlock. The preconditions are
// checked on the locked rows (ticket-grouping.rules.ts). No status change,
// no acknowledgment and no routing_actions row is written; one audit event
// records each action. Report count is recalculated here; severity (MAX of
// member reports) and Operational Priority by OperationalPriorityService
// after commit, as after a new submission.

interface LockedTicket {
  id: number;
  status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  category: string;
  merged_into_ticket_id: number | null;
}

export interface MergeResult {
  survivorTicketId: number;
  mergedTicketId: number;
  movedReportIds: number[];
}

export interface RemoveReportResult {
  reportId: number;
  fromTicketId: number;
  newTicketId: number;
}

export interface RegroupReportResult {
  reportId: number;
  fromTicketId: number;
  toTicketId: number;
}

function actorOf(admin: AdminSession): AdminAuditActor {
  return {
    adminId: admin.adminId,
    adminName: admin.adminName,
    email: admin.email,
    accountType: admin.accountType,
    office: admin.office,
  };
}

@Injectable()
export class TicketGroupingService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly barangays: BarangayService,
    private readonly operationalPriority: OperationalPriorityService,
    private readonly audit: AdminAuditService,
  ) {}

  async merge(
    body: {
      survivorTicketId?: unknown;
      mergedTicketId?: unknown;
      reason?: unknown;
    },
    admin: AdminSession,
  ): Promise<MergeResult> {
    const survivorId = validateTicketId(
      body.survivorTicketId,
      'survivorTicketId',
    );
    const mergedId = validateTicketId(body.mergedTicketId, 'mergedTicketId');
    const reason = validateGroupingReason(body.reason);
    if (survivorId === mergedId) {
      throw new BadRequestException('Choose two different tickets to merge.');
    }

    const result = await this.pg.begin(async (tx) => {
      const locked = await this.lockTickets(tx, [survivorId, mergedId]);
      const facts = await this.facts(tx, locked);
      const survivor = facts.get(survivorId)!;
      const mergedAway = facts.get(mergedId)!;
      const block = mergeBlock(admin, survivor, mergedAway);
      if (block) throw toHttpException(block);

      const moved = await tx<{ id: number }[]>`
        UPDATE reports SET ticket_id = ${survivorId}
        WHERE ticket_id = ${mergedId}
        RETURNING id
      `;
      await tx`
        UPDATE tickets SET merged_into_ticket_id = ${survivorId}, updated_at = now()
        WHERE id = ${mergedId}
      `;
      await this.refreshMembership(tx, survivorId);

      const movedReportIds = moved.map((r) => r.id).sort((a, b) => a - b);
      await this.audit.logInPgTx(tx, {
        actor: actorOf(admin),
        actionType: 'ticket_merged',
        targetType: 'ticket',
        targetId: survivorId,
        targetSummary: `Ticket #${survivorId} (${survivor.category})`,
        metadata: { mergedTicketId: mergedId, movedReportIds, reason },
      });
      return {
        survivorTicketId: survivorId,
        mergedTicketId: mergedId,
        movedReportIds,
      };
    });

    await this.operationalPriority.recalculateActiveTickets();
    return result;
  }

  async removeReport(
    body: { reportId?: unknown; reason?: unknown },
    admin: AdminSession,
  ): Promise<RemoveReportResult> {
    const reportId = validateTicketId(body.reportId, 'reportId');
    const reason = validateGroupingReason(body.reason);

    const [report] = await this.pg<
      { ticket_id: number; lat: number; lng: number }[]
    >`
      SELECT ticket_id, ST_Y(pin_geom) AS lat, ST_X(pin_geom) AS lng
      FROM reports WHERE id = ${reportId}
    `;
    if (!report) throw new NotFoundException('Report not found.');
    // The same barangay lookup a new submission at this pin gets.
    const barangay = await this.barangays.findBarangayForPoint(
      report.lat,
      report.lng,
    );
    if (!barangay) {
      throw new ConflictException(
        "This report's pin is outside the municipality, so it can't become a ticket of its own.",
      );
    }
    const fromId = report.ticket_id;

    const result = await this.pg.begin(async (tx) => {
      const locked = await this.lockTickets(tx, [fromId]);
      const trackingReference = await this.lockReport(tx, reportId, fromId);
      const from = (await this.facts(tx, locked)).get(fromId)!;
      const block = removeBlock(
        admin,
        from,
        await this.reportCount(tx, fromId),
      );
      if (block) throw toHttpException(block);

      // As ReportsService.submit creates a ticket: the category (here the
      // ticket's current one), Initial Routing by category, status Reported
      // (the column default) and the report's pin as the location.
      const office = officeForCategory(from.category);
      const [ticket] = await tx<{ id: number }[]>`
        INSERT INTO tickets (
          category, barangay_id, member_count, assigned_office, initial_assigned_office, geom
        )
        VALUES (
          ${from.category}, ${barangay.id}, 1, ${office}, ${office},
          ST_SetSRID(ST_MakePoint(${report.lng}, ${report.lat}), 4326)
        )
        RETURNING id
      `;
      await tx`UPDATE reports SET ticket_id = ${ticket.id} WHERE id = ${reportId}`;
      await this.refreshMembership(tx, ticket.id);
      await this.refreshMembership(tx, fromId);

      await this.audit.logInPgTx(tx, {
        actor: actorOf(admin),
        actionType: 'report_removed_from_ticket',
        targetType: 'report',
        targetId: reportId,
        targetSummary: `Report ${trackingReference}`,
        metadata: { fromTicketId: fromId, newTicketId: ticket.id, reason },
      });
      return { reportId, fromTicketId: fromId, newTicketId: ticket.id };
    });

    await this.operationalPriority.recalculateActiveTickets();
    return result;
  }

  async regroupReport(
    body: { reportId?: unknown; toTicketId?: unknown; reason?: unknown },
    admin: AdminSession,
  ): Promise<RegroupReportResult> {
    const reportId = validateTicketId(body.reportId, 'reportId');
    const toId = validateTicketId(body.toTicketId, 'toTicketId');
    const reason = validateGroupingReason(body.reason);

    const [report] = await this.pg<{ ticket_id: number }[]>`
      SELECT ticket_id FROM reports WHERE id = ${reportId}
    `;
    if (!report) throw new NotFoundException('Report not found.');
    const fromId = report.ticket_id;
    if (fromId === toId) {
      throw new BadRequestException(
        `The report is already on Ticket #${toId}.`,
      );
    }

    const result = await this.pg.begin(async (tx) => {
      const locked = await this.lockTickets(tx, [fromId, toId]);
      const trackingReference = await this.lockReport(tx, reportId, fromId);
      const facts = await this.facts(tx, locked);
      const block = regroupBlock(
        admin,
        facts.get(fromId)!,
        facts.get(toId)!,
        await this.reportCount(tx, fromId),
      );
      if (block) throw toHttpException(block);

      await tx`UPDATE reports SET ticket_id = ${toId} WHERE id = ${reportId}`;
      await this.refreshMembership(tx, toId);
      await this.refreshMembership(tx, fromId);

      await this.audit.logInPgTx(tx, {
        actor: actorOf(admin),
        actionType: 'report_regrouped',
        targetType: 'report',
        targetId: reportId,
        targetSummary: `Report ${trackingReference}`,
        metadata: { fromTicketId: fromId, toTicketId: toId, reason },
      });
      return { reportId, fromTicketId: fromId, toTicketId: toId };
    });

    await this.operationalPriority.recalculateActiveTickets();
    return result;
  }

  // Ascending id order, one row at a time, so every grouping action takes
  // its ticket locks in the same order.
  private async lockTickets(
    tx: TransactionSql,
    ids: number[],
  ): Promise<Map<number, LockedTicket>> {
    const locked = new Map<number, LockedTicket>();
    for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
      const [row] = await tx<LockedTicket[]>`
        SELECT id, status, assigned_office, category, merged_into_ticket_id
        FROM tickets WHERE id = ${id}
        FOR UPDATE
      `;
      if (!row) throw new NotFoundException(`Ticket #${id} not found.`);
      locked.set(id, row);
    }
    return locked;
  }

  // Locked after the tickets. Confirms the report is still on the ticket it
  // was read from, and returns its tracking reference for the audit summary.
  private async lockReport(
    tx: TransactionSql,
    reportId: number,
    expectedTicketId: number,
  ): Promise<string> {
    const [row] = await tx<{ ticket_id: number; tracking_reference: string }[]>`
      SELECT ticket_id, tracking_reference FROM reports WHERE id = ${reportId}
      FOR UPDATE
    `;
    if (!row) throw new NotFoundException('Report not found.');
    if (row.ticket_id !== expectedTicketId) {
      throw new ConflictException(
        'This report was moved to another ticket meanwhile. Reload and try again.',
      );
    }
    return row.tracking_reference;
  }

  private async facts(
    tx: TransactionSql,
    locked: Map<number, LockedTicket>,
  ): Promise<Map<number, GroupingTicketFacts>> {
    const ids = [...locked.keys()];
    const counts = await tx<{ ticket_id: number; active: number }[]>`
      SELECT ticket_id, count(*)::int AS active
      FROM work_orders
      WHERE ticket_id = ANY(${ids}::int[]) AND status IN ('pending', 'in_progress')
      GROUP BY ticket_id
    `;
    const active = new Map(counts.map((c) => [c.ticket_id, c.active]));
    return new Map(
      [...locked.values()].map((t) => [
        t.id,
        {
          id: t.id,
          status: t.status,
          assignedOffice: t.assigned_office,
          category: t.category,
          mergedIntoTicketId: t.merged_into_ticket_id,
          activeWorkOrders: active.get(t.id) ?? 0,
        },
      ]),
    );
  }

  private async reportCount(
    tx: TransactionSql,
    ticketId: number,
  ): Promise<number> {
    const [{ count }] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM reports WHERE ticket_id = ${ticketId}
    `;
    return count;
  }

  // Report count from the reports themselves. tickets.flagged (set when a
  // member report is quarantined; hides the ticket from the public map) is
  // carried over to a ticket that receives a quarantined report and is
  // never cleared here.
  private async refreshMembership(
    tx: TransactionSql,
    ticketId: number,
  ): Promise<void> {
    await tx`
      UPDATE tickets SET
        member_count = (SELECT count(*)::int FROM reports WHERE ticket_id = ${ticketId}),
        flagged = COALESCE(flagged, false) OR EXISTS (
          SELECT 1 FROM reports
          WHERE ticket_id = ${ticketId} AND moderation_status = 'quarantined'
        ),
        updated_at = now()
      WHERE id = ${ticketId}
    `;
  }
}
