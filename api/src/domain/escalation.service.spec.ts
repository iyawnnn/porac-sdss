import { readFileSync } from 'fs';
import { join } from 'path';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { EscalationService } from './escalation.service';
import type { NotificationsService } from '../notifications/notifications.service';

const OLD_DATE = new Date(Date.now() - 10 * 86_400_000); // 10 days old

// Mirrors work-orders.service.spec.ts's chain() helper, but keyed to
// sequential db.select() calls rather than a single chain — checkTicketEscalations
// makes up to three independent select() round trips (stale tickets, work
// orders with progress, existing escalation notifications), and each needs
// to resolve to its own canned result in order.
function makeDb(selectResults: unknown[][]) {
  let call = 0;
  const select = jest.fn(() => {
    const rows = selectResults[call++] ?? [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.where = self;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject);
    return chain;
  });
  return { select } as unknown as PostgresJsDatabase & { select: jest.Mock };
}

function makeNotifications() {
  const create = jest.fn().mockResolvedValue(undefined);
  return { create } as unknown as NotificationsService & { create: jest.Mock };
}

describe('EscalationService.checkTicketEscalations', () => {
  it('escalates an old active ticket with no work order progress, notifying its assigned office', async () => {
    const db = makeDb([
      [{ id: 1, assignedOffice: 'MEO', category: 'Pothole', createdAt: OLD_DATE }], // stale tickets
      [], // no work orders ever reached in_progress/completed
      [], // no prior escalation notification
    ]);
    const notifications = makeNotifications();
    const service = new EscalationService(db, notifications);

    const result = await service.checkTicketEscalations();

    expect(result).toEqual({ candidatesFound: 1, notificationsCreated: 1, duplicatesSkipped: 0 });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientType: 'admin',
        recipientOffice: 'MEO',
        type: 'ticket_escalation',
        href: '/admin/tickets/1',
        entityType: 'ticket',
        entityId: 1,
      }),
    );
  });

  it('does not escalate a ticket with meaningful work order progress', async () => {
    const db = makeDb([
      [{ id: 2, assignedOffice: 'MDRRMO', category: 'Flooding', createdAt: OLD_DATE }], // stale tickets
      [{ ticketId: 2 }], // ticket 2 has a work order that reached in_progress/completed
      // no third select call — candidates is empty before the duplicate check
    ]);
    const notifications = makeNotifications();
    const service = new EscalationService(db, notifications);

    const result = await service.checkTicketEscalations();

    expect(result).toEqual({ candidatesFound: 0, notificationsCreated: 0, duplicatesSkipped: 0 });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate escalation notification for a ticket already escalated', async () => {
    const db = makeDb([
      [{ id: 3, assignedOffice: 'MEO', category: 'Illegal Dumping', createdAt: OLD_DATE }], // stale tickets
      [], // no work order progress
      [{ entityId: 3 }], // already has a ticket_escalation notification
    ]);
    const notifications = makeNotifications();
    const service = new EscalationService(db, notifications);

    const result = await service.checkTicketEscalations();

    expect(result).toEqual({ candidatesFound: 1, notificationsCreated: 0, duplicatesSkipped: 1 });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('returns all-zero counts and makes no notification calls when nothing is stale', async () => {
    const db = makeDb([[]]); // no stale tickets at all
    const notifications = makeNotifications();
    const service = new EscalationService(db, notifications);

    const result = await service.checkTicketEscalations();

    expect(result).toEqual({ candidatesFound: 0, notificationsCreated: 0, duplicatesSkipped: 0 });
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

// No DB test harness exists in this codebase for query-builder-level
// correctness (see reports.service.spec.ts's comment on this pattern) — the
// mocked-db tests above prove the candidate/duplicate application logic,
// but can't prove the actual SQL filters recency and status correctly
// (the mock returns canned rows regardless of what was queried). These
// guard the query construction itself via source text instead.
describe('EscalationService query construction (recency + active-status filtering)', () => {
  const source = readFileSync(join(__dirname, 'escalation.service.ts'), 'utf8');

  it('filters stale tickets to only the active statuses, excluding Resolved/Rejected', () => {
    expect(source).toMatch(
      /ACTIVE_TICKET_STATUSES = \['Reported', 'Under Review', 'In Progress'\]/,
    );
    expect(source).not.toMatch(/ACTIVE_TICKET_STATUSES = \[[^\]]*'Resolved'/);
    expect(source).not.toMatch(/ACTIVE_TICKET_STATUSES = \[[^\]]*'Rejected'/);
    expect(source).toMatch(/inArray\(tickets\.status, ACTIVE_TICKET_STATUSES\)/);
  });

  it('only flags tickets older than the 7-day threshold via a lt(createdAt, cutoff) clause, not an equality/gt check', () => {
    expect(source).toMatch(/ESCALATION_THRESHOLD_DAYS = 7/);
    expect(source).toMatch(/lt\(tickets\.createdAt, cutoff\)/);
  });

  it('treats only in_progress/completed work orders as meaningful progress, not pending/cancelled', () => {
    expect(source).toMatch(
      /MEANINGFUL_PROGRESS_STATUSES = \['in_progress', 'completed'\]/,
    );
  });

  it('never writes to tickets.status, work_orders.status, or any urgency/priority column', () => {
    for (const forbidden of ['urgency_score', 'urgencyScore', 'priority_score', 'priorityScore', 'priority_index', 'priorityIndex', '.update(']) {
      expect(source).not.toContain(forbidden);
    }
  });
});
