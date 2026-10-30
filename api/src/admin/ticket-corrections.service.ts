import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import {
  assertOfficeAccess,
  isOperationalPersonnel,
} from '../common/authz/admin-scope';
import { officeForCategory } from '../common/utils/office';
import { CATEGORIES } from '../contracts/schemas';
import { BarangayService } from '../domain/barangay.service';
import { OperationalPriorityService } from '../domain/operational-priority.service';
import { HazardInformationService } from '../domain/hazard-information.service';
import { RainfallContextService } from '../domain/rainfall-context.service';
import { AdminAuditService, type AdminAuditActor } from './admin-audit.service';
import { TicketsService } from './tickets.service';
import {
  SAME_LOCATION_M,
  type CorrectionTicketFacts,
  categoryCorrectionBlock,
  correctionBlock,
  officeChangeBlock,
  validateCorrectionCategory,
  validateCorrectionPoint,
} from './ticket-corrections.rules';
import {
  toHttpException,
  validateGroupingReason,
} from './ticket-grouping.rules';

// Staff category and location correction (manuscript pp. 42–45, Tables 2–4;
// manuscript revision Phase 3, step 3e). Both change the ticket only: the
// citizen's originals stay on the reports (reports.submitted_category,
// reports.pin_geom / geom / exif_geom are never written here), and each
// correction's old and new values, reason, who and when are one audit event.
//
// - A category from the other office also reassigns the ticket in the same
//   transaction through Reassign's own code path (TicketsService
//   assertCanReassign + writeReassignment: office_reassignments,
//   routing_actions with this reason, ticket_reassigned), and is blocked
//   while the ticket has a pending or in-progress Work Order.
// - A location must be inside a Porac barangay polygon, with no boundary
//   fallback (unlike a citizen submission); the barangay follows the point
//   and Operational Priority is recalculated after commit.
// - Either correction re-evaluates the ticket's DENR-MGB Hazard Information
//   after the commit (manuscript revision Phase 4, step 4b), fired and not
//   awaited; the previous result stays as history. It re-evaluates the
//   rainfall context the same way (Phase 4, step 4c): the current row is
//   superseded and kept as history, and a category without rainfall context
//   gets no new row.

interface LockedTicket {
  id: number;
  status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  category: string;
  merged_into_ticket_id: number | null;
  lat: number;
  lng: number;
  barangay_name: string;
}

export interface CorrectionAvailability {
  ticketId: number;
  category: string;
  assignedOffice: 'MEO' | 'MDRRMO';
  lat: number;
  lng: number;
  barangayName: string;
  // Why this viewer can't correct the ticket at all; null when they can.
  blocked: string | null;
  // Why a category from the other office is refused (an active Work
  // Order); null when it isn't.
  officeChangeBlocked: string | null;
  // The current categories with the office each one routes to.
  categories: { category: string; office: 'MEO' | 'MDRRMO' }[];
}

export interface CategoryCorrectionResult {
  ticketId: number;
  category: string;
  assignedOffice: 'MEO' | 'MDRRMO';
  officeChanged: boolean;
}

export interface LocationCorrectionResult {
  ticketId: number;
  lat: number;
  lng: number;
  barangayName: string;
  distanceM: number;
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
export class TicketCorrectionsService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly tickets: TicketsService,
    private readonly barangays: BarangayService,
    private readonly operationalPriority: OperationalPriorityService,
    private readonly audit: AdminAuditService,
    private readonly hazardInformation: HazardInformationService,
    private readonly rainfallContext: RainfallContextService,
  ) {}

  // For the Correct category / Correct location buttons and dialogs. An
  // operational Personnel gets the same 403 as Ticket Detail for another
  // office's ticket; Focal sees any office's.
  async availability(
    ticketId: number,
    admin: AdminSession,
  ): Promise<CorrectionAvailability | null> {
    return this.pg.begin(async (tx) => {
      const [ticket] = await tx<LockedTicket[]>`
        SELECT t.id, t.status, t.assigned_office, t.category, t.merged_into_ticket_id,
          ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng, b.name AS barangay_name
        FROM tickets t
        JOIN barangays b ON b.id = t.barangay_id
        WHERE t.id = ${ticketId}
      `;
      if (!ticket) return null;
      if (isOperationalPersonnel(admin)) {
        assertOfficeAccess(admin, ticket.assigned_office);
      }
      const facts = await this.facts(tx, ticket);
      return {
        ticketId: ticket.id,
        category: ticket.category,
        assignedOffice: ticket.assigned_office,
        lat: ticket.lat,
        lng: ticket.lng,
        barangayName: ticket.barangay_name,
        blocked: correctionBlock(admin, facts)?.message ?? null,
        officeChangeBlocked: officeChangeBlock(facts)?.message ?? null,
        categories: CATEGORIES.map((category) => ({
          category,
          office: officeForCategory(category),
        })),
      };
    });
  }

  async correctCategory(
    ticketId: number,
    body: { category?: unknown; reason?: unknown },
    admin: AdminSession,
  ): Promise<CategoryCorrectionResult> {
    const category = validateCorrectionCategory(body.category);
    const reason = validateGroupingReason(body.reason);

    const result = await this.pg.begin(async (tx) => {
      const ticket = await this.lockTicket(tx, ticketId);
      const facts = await this.facts(tx, ticket);
      const block = categoryCorrectionBlock(admin, facts, category);
      if (block) throw toHttpException(block);

      const fromOffice = ticket.assigned_office;
      const toOffice = officeForCategory(category);
      const officeChanged = toOffice !== fromOffice;
      if (officeChanged) {
        await this.tickets.assertCanReassign(
          ticketId,
          ticket,
          admin,
          toOffice,
          () => Promise.resolve(facts.activeWorkOrders),
        );
      }

      await tx`
        UPDATE tickets SET category = ${category}, category_review_required = false, updated_at = now()
        WHERE id = ${ticketId}
      `;
      await this.audit.logInPgTx(tx, {
        actor: actorOf(admin),
        actionType: 'ticket_category_corrected',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${category})`,
        metadata: {
          field: 'category',
          oldValue: ticket.category,
          newValue: category,
          reason,
          officeChanged,
          fromOffice,
          toOffice,
        },
      });
      if (officeChanged) {
        await this.tickets.writeReassignment(tx, {
          ticketId,
          category,
          fromOffice,
          toOffice,
          admin,
          reason,
        });
      }
      return { ticketId, category, assignedOffice: toOffice, officeChanged };
    });

    // A category without a lookup (Lahar, any other) only supersedes the
    // current result. Rainfall context the same.
    this.hazardInformation.trigger(ticketId);
    this.rainfallContext.triggerForCorrection(ticketId);
    return result;
  }

  async correctLocation(
    ticketId: number,
    body: { lat?: unknown; lng?: unknown; reason?: unknown },
    admin: AdminSession,
  ): Promise<LocationCorrectionResult> {
    const point = validateCorrectionPoint(body.lat, body.lng);
    const reason = validateGroupingReason(body.reason);
    const barangay = await this.barangays.findContainingBarangay(
      point.lat,
      point.lng,
    );
    if (!barangay) {
      throw new BadRequestException('Location must be inside Porac.');
    }

    const result = await this.pg.begin(async (tx) => {
      const ticket = await this.lockTicket(tx, ticketId);
      const block = correctionBlock(admin, await this.facts(tx, ticket));
      if (block) throw toHttpException(block);

      const [{ distance_m: distanceM }] = await tx<{ distance_m: number }[]>`
        SELECT ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
        ) AS distance_m
        FROM tickets WHERE id = ${ticketId}
      `;
      if (distanceM < SAME_LOCATION_M) {
        throw new BadRequestException(
          'The new location is the same as the current one.',
        );
      }

      await tx`
        UPDATE tickets SET
          geom = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326),
          barangay_id = ${barangay.id},
          updated_at = now()
        WHERE id = ${ticketId}
      `;
      // Its barangay demand moved: recalculate it in this transaction
      // (manuscript revision Phase 4, step 4a); every other ticket follows
      // after the commit.
      await this.operationalPriority.recalculateTickets(tx, [ticketId]);
      const rounded = Math.round(distanceM);
      await this.audit.logInPgTx(tx, {
        actor: actorOf(admin),
        actionType: 'ticket_location_corrected',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${ticket.category})`,
        metadata: {
          field: 'location',
          oldLat: ticket.lat,
          oldLng: ticket.lng,
          oldBarangay: ticket.barangay_name,
          newLat: point.lat,
          newLng: point.lng,
          newBarangay: barangay.name,
          distanceM: rounded,
          reason,
        },
      });
      return {
        ticketId,
        lat: point.lat,
        lng: point.lng,
        barangayName: barangay.name,
        distanceM: rounded,
      };
    });

    this.hazardInformation.trigger(ticketId);
    this.rainfallContext.triggerForCorrection(ticketId);
    // Barangay demand moved with the ticket.
    await this.operationalPriority.recalculateActiveTickets();
    return result;
  }

  private async lockTicket(
    tx: TransactionSql,
    ticketId: number,
  ): Promise<LockedTicket> {
    const [ticket] = await tx<LockedTicket[]>`
      SELECT t.id, t.status, t.assigned_office, t.category, t.merged_into_ticket_id,
        ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng, b.name AS barangay_name
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE t.id = ${ticketId}
      FOR UPDATE OF t
    `;
    if (!ticket) throw new NotFoundException(`Ticket #${ticketId} not found.`);
    return ticket;
  }

  private async facts(
    tx: TransactionSql,
    ticket: LockedTicket,
  ): Promise<CorrectionTicketFacts> {
    const [{ active }] = await tx<{ active: number }[]>`
      SELECT count(*)::int AS active FROM work_orders
      WHERE ticket_id = ${ticket.id} AND status IN ('pending', 'in_progress')
    `;
    return {
      id: ticket.id,
      status: ticket.status,
      assignedOffice: ticket.assigned_office,
      category: ticket.category,
      mergedIntoTicketId: ticket.merged_into_ticket_id,
      activeWorkOrders: active,
    };
  }
}
