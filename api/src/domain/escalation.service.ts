import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { notifications, tickets, workOrders } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

// Same literal ticket_status list as work-orders.service.ts/tickets.service.ts
// (no shared exported constant exists in this codebase — each file repeats
// it, per established convention). 'Duplicate' is not a real ticket_status
// in this schema (reports merge into a ticket instead — see CLAUDE.md's
// "Report → Ticket separation"), so it's never included here.
const ACTIVE_TICKET_STATUSES = ['Reported', 'Under Review', 'In Progress'] as const;

// "Meaningful progress" = an office has actually started or finished the
// field work, not just logged a work order and left it pending — a
// freshly-created 'pending' work order (or a 'cancelled' one) does not
// clear the escalation candidate, since nothing has actually moved.
const MEANINGFUL_PROGRESS_STATUSES = ['in_progress', 'completed'] as const;

const ESCALATION_THRESHOLD_DAYS = 7;
const NOTIFICATION_TYPE = 'ticket_escalation';

export interface EscalationCheckResult {
  candidatesFound: number;
  notificationsCreated: number;
  duplicatesSkipped: number;
}

@Injectable()
export class EscalationService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly notifications: NotificationsService,
  ) {}

  // Manual/testing trigger (POST /cron/check-ticket-escalations), same shape
  // as every other api/src/cron/* job — called daily by .github/workflows/cron.yml
  // as a safety net. Never touches tickets.status, work_orders.status, or any
  // urgency/priority scoring column — a pure read-then-notify pass.
  async checkTicketEscalations(): Promise<EscalationCheckResult> {
    const cutoff = new Date(Date.now() - ESCALATION_THRESHOLD_DAYS * 86_400_000);

    const staleTickets = await this.db
      .select({
        id: tickets.id,
        assignedOffice: tickets.assignedOffice,
        category: tickets.category,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .where(and(inArray(tickets.status, ACTIVE_TICKET_STATUSES), lt(tickets.createdAt, cutoff)));

    if (staleTickets.length === 0) {
      return { candidatesFound: 0, notificationsCreated: 0, duplicatesSkipped: 0 };
    }

    // Dedupe/filter in application code rather than a NOT EXISTS subquery —
    // same tradeoff WorkOrdersService.getNeedsAttention already makes: this
    // result set is dashboard/cron-job sized, not a paginated user-facing
    // query, so a second small round trip is simpler than a correlated
    // subquery for the same result.
    const staleIds = staleTickets.map((t) => t.id);
    const progressedRows = await this.db
      .select({ ticketId: workOrders.ticketId })
      .from(workOrders)
      .where(
        and(
          inArray(workOrders.ticketId, staleIds),
          inArray(workOrders.status, MEANINGFUL_PROGRESS_STATUSES),
        ),
      );
    const progressedIds = new Set(progressedRows.map((r) => r.ticketId));
    const candidates = staleTickets.filter((t) => !progressedIds.has(t.id));

    if (candidates.length === 0) {
      return { candidatesFound: 0, notificationsCreated: 0, duplicatesSkipped: 0 };
    }

    // Duplicate prevention: a ticket is only ever escalated once, for the
    // lifetime of the notifications row (no schema change needed — this
    // reuses the existing notifications table exactly like the "was this
    // ticket already flagged" question is answered everywhere else in this
    // codebase, by reading state rather than adding a new column). If the
    // office needs a fresh nudge after already-created work stalls again,
    // that's a follow-up, not something this pass re-flags daily.
    const candidateIds = candidates.map((t) => t.id);
    const alreadyNotifiedRows = await this.db
      .select({ entityId: notifications.entityId })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, NOTIFICATION_TYPE),
          inArray(notifications.entityId, candidateIds),
        ),
      );
    const alreadyNotified = new Set(alreadyNotifiedRows.map((r) => r.entityId));

    let notificationsCreated = 0;
    let duplicatesSkipped = 0;
    for (const ticket of candidates) {
      if (alreadyNotified.has(ticket.id)) {
        duplicatesSkipped++;
        continue;
      }
      const ageDays = Math.floor((Date.now() - ticket.createdAt.getTime()) / 86_400_000);
      await this.notifications.create({
        recipientType: 'admin',
        recipientOffice: ticket.assignedOffice,
        type: NOTIFICATION_TYPE,
        title: 'Ticket needs review — no work order progress',
        message: `Ticket #${ticket.id} (${ticket.category}) has been active for ${ageDays} days with no work order progress.`,
        href: `/admin/tickets/${ticket.id}`,
        entityType: 'ticket',
        entityId: ticket.id,
      });
      notificationsCreated++;
    }

    return { candidatesFound: candidates.length, notificationsCreated, duplicatesSkipped };
  }
}
