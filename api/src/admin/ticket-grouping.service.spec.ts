import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import type { BarangayService } from '../domain/barangay.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type {
  AdminAuditService,
  LogAdminAuditInput,
} from './admin-audit.service';
import { TicketGroupingService } from './ticket-grouping.service';

// Manuscript revision Phase 3, step 3d. The fake SQL answers each query by
// its text and records every call, so these tests pin the transaction's
// effects: what is locked and in which order, what is written (and what is
// not), the audit event and the recalculation. The same service ran against
// PostGIS (PGlite) outside the repo with real rows.

const MEO: AdminSession = {
  adminId: 1,
  email: 'meo@example.com',
  adminName: 'Meo Staff',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};
const FOCAL: AdminSession = {
  adminId: 3,
  email: 'focal@example.com',
  adminName: 'Focal Staff',
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
};
const SYSTEM_ADMIN: AdminSession = {
  adminId: 4,
  email: 'sys@example.com',
  adminName: 'Sys Admin',
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
};

interface TicketRow {
  id: number;
  status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  category: string;
  merged_into_ticket_id: number | null;
}

interface Call {
  text: string;
  values: unknown[];
  inTx: boolean;
}

function pothole(id: number, overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id,
    status: 'Reported',
    assigned_office: 'MEO',
    category: 'Pothole / Road Surface Damage',
    merged_into_ticket_id: null,
    ...overrides,
  };
}

function setup(options: {
  tickets: TicketRow[];
  activeWorkOrders?: Record<number, number>;
  // report id -> its ticket
  reports?: Record<number, number>;
  reportTicketWhenLocked?: number;
  movedReportIds?: number[];
  reportCount?: number;
  barangay?: { id: number; name: string; viaFallback: boolean } | null;
}) {
  const calls: Call[] = [];
  const tickets = new Map(options.tickets.map((t) => [t.id, t]));
  const answer = (text: string, values: unknown[]): unknown[] => {
    if (
      text.includes('FROM tickets WHERE id = ?') &&
      text.includes('FOR UPDATE')
    ) {
      const row = tickets.get(values[0] as number);
      return row ? [row] : [];
    }
    if (text.includes('FROM work_orders')) {
      return Object.entries(options.activeWorkOrders ?? {}).map(
        ([ticketId, active]) => ({
          ticket_id: Number(ticketId),
          active,
        }),
      );
    }
    if (
      text.includes('UPDATE reports SET ticket_id') &&
      text.includes('RETURNING id')
    ) {
      return (options.movedReportIds ?? []).map((id) => ({ id }));
    }
    if (text.includes('ST_Y(pin_geom)')) {
      const ticketId = options.reports?.[values[0] as number];
      return ticketId ? [{ ticket_id: ticketId, lat: 15.07, lng: 120.54 }] : [];
    }
    if (text.includes('SELECT ticket_id FROM reports WHERE id')) {
      const ticketId = options.reports?.[values[0] as number];
      return ticketId ? [{ ticket_id: ticketId }] : [];
    }
    if (text.includes('SELECT ticket_id, tracking_reference FROM reports')) {
      const ticketId =
        options.reportTicketWhenLocked ??
        options.reports?.[values[0] as number];
      return ticketId
        ? [{ ticket_id: ticketId, tracking_reference: 'PRC-2026-000010' }]
        : [];
    }
    if (text.includes('SELECT count(*)::int AS count FROM reports')) {
      return [{ count: options.reportCount ?? 2 }];
    }
    if (text.includes('INSERT INTO tickets')) return [{ id: 500 }];
    return [];
  };
  const tag = (inTx: boolean) =>
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      calls.push({ text, values, inTx });
      return Promise.resolve(answer(text, values));
    });
  const begin = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(tag(true)),
  );
  const sql = Object.assign(tag(false), { begin }) as unknown as Sql;

  const logInPgTx = jest.fn<Promise<void>, [unknown, LogAdminAuditInput]>(() =>
    Promise.resolve(),
  );
  const recalculateActiveTickets = jest.fn(() =>
    Promise.resolve({ updated: 0 }),
  );
  // Manuscript revision Phase 4, step 4a: the changed tickets' severity
  // and priority, recorded in order with the SQL so a test can see it ran
  // inside the transaction, after the membership writes.
  const recalculateTickets = jest.fn((tx: unknown, ids: number[]) => {
    calls.push({ text: 'RECALCULATE TICKETS', values: ids, inTx: tx !== sql });
    return Promise.resolve({ updated: ids.length });
  });
  const findBarangayForPoint = jest.fn(() =>
    Promise.resolve(
      options.barangay === undefined
        ? { id: 9, name: 'Pio', viaFallback: false }
        : options.barangay,
    ),
  );
  const service = new TicketGroupingService(
    sql,
    { findBarangayForPoint } as unknown as BarangayService,
    {
      recalculateActiveTickets,
      recalculateTickets,
    } as unknown as OperationalPriorityService,
    { logInPgTx } as unknown as AdminAuditService,
  );
  const writes = () =>
    calls
      .filter((c) => /^\s*(UPDATE|INSERT|DELETE)/.test(c.text))
      .map((c) => c.text);
  const locks = () =>
    calls
      .filter(
        (c) =>
          c.text.includes('FROM tickets WHERE id = ?') &&
          c.text.includes('FOR UPDATE'),
      )
      .map((c) => c.values[0]);
  return {
    service,
    calls,
    writes,
    locks,
    logInPgTx,
    recalculateActiveTickets,
    recalculateTickets,
    findBarangayForPoint,
  };
}

// The recalculation of the changed tickets: once, inside the transaction,
// after the last membership write (manuscript revision Phase 4, step 4a).
function expectRecalculatedInTx(t: ReturnType<typeof setup>, ids: number[]) {
  expect(t.recalculateTickets).toHaveBeenCalledTimes(1);
  const index = t.calls.findIndex((c) => c.text === 'RECALCULATE TICKETS');
  expect(t.calls[index]).toEqual({
    text: 'RECALCULATE TICKETS',
    values: ids,
    inTx: true,
  });
  const lastMembershipWrite = t.calls.reduce(
    (last, c, i) => (c.text.includes('member_count =') ? i : last),
    -1,
  );
  expect(lastMembershipWrite).toBeGreaterThan(-1);
  expect(lastMembershipWrite).toBeLessThan(index);
}

describe('TicketGroupingService.merge', () => {
  const body = {
    survivorTicketId: 5,
    mergedTicketId: 3,
    reason: '  Same pothole.  ',
  };

  it('moves every report, marks the merged-away ticket and records one audit event', async () => {
    const t = setup({
      tickets: [pothole(3), pothole(5)],
      movedReportIds: [8, 7],
    });
    await expect(t.service.merge(body, MEO)).resolves.toEqual({
      survivorTicketId: 5,
      mergedTicketId: 3,
      movedReportIds: [7, 8],
    });
    const writes = t.writes();
    expect(writes[0]).toMatch(
      /UPDATE reports SET ticket_id = \?\s+WHERE ticket_id = \?/,
    );
    expect(writes[1]).toMatch(
      /UPDATE tickets SET merged_into_ticket_id = \?, updated_at = now\(\)/,
    );
    expect(writes[2]).toMatch(
      /member_count = \(SELECT count\(\*\)::int FROM reports/,
    );
    expect(writes).toHaveLength(3);
    expect(t.logInPgTx).toHaveBeenCalledTimes(1);
    expect(t.logInPgTx.mock.calls[0][1]).toEqual({
      actor: {
        adminId: 1,
        adminName: 'Meo Staff',
        email: 'meo@example.com',
        accountType: 'PERSONNEL',
        office: 'MEO',
      },
      actionType: 'ticket_merged',
      targetType: 'ticket',
      targetId: 5,
      targetSummary: 'Ticket #5 (Pothole / Road Surface Damage)',
      metadata: {
        mergedTicketId: 3,
        movedReportIds: [7, 8],
        reason: 'Same pothole.',
      },
    });
  });

  it('keeps the survivor where it is (no centroid) and writes no status, acknowledgment or routing rows', async () => {
    const t = setup({ tickets: [pothole(3), pothole(5)], movedReportIds: [7] });
    await t.service.merge(body, MEO);
    for (const text of t.writes()) {
      expect(text).not.toMatch(/geom|ST_Centroid|\bstatus\s*=/);
      expect(text).not.toMatch(
        /status_history|acknowledgments|report_acknowledgments|routing_actions|office_reassignments/,
      );
    }
  });

  it('recalculates the survivor severity and priority in the transaction, then every ticket after it', async () => {
    const t = setup({ tickets: [pothole(3), pothole(5)] });
    await t.service.merge(body, MEO);
    expectRecalculatedInTx(t, [5]);
    expect(t.recalculateActiveTickets).toHaveBeenCalledTimes(1);
    expect(t.calls.every((c) => c.inTx || !/UPDATE|INSERT/.test(c.text))).toBe(
      true,
    );
  });

  it('locks both tickets in ascending id order, whichever survives (no deadlock between opposite merges)', async () => {
    const a = setup({ tickets: [pothole(3), pothole(5)] });
    await a.service.merge(
      { survivorTicketId: 5, mergedTicketId: 3, reason: 'x' },
      MEO,
    );
    const b = setup({ tickets: [pothole(3), pothole(5)] });
    await b.service.merge(
      { survivorTicketId: 3, mergedTicketId: 5, reason: 'x' },
      MEO,
    );
    expect(a.locks()).toEqual([3, 5]);
    expect(b.locks()).toEqual([3, 5]);
    // Tickets are locked before any report row is touched.
    const firstReportWrite = a.calls.findIndex((c) =>
      c.text.includes('UPDATE reports'),
    );
    const lastLock = a.calls.findLastIndex((c) =>
      c.text.includes('FOR UPDATE'),
    );
    expect(lastLock).toBeLessThan(firstReportWrite);
  });

  it('writes nothing when a precondition fails, and says why', async () => {
    const t = setup({
      tickets: [pothole(3), pothole(5)],
      activeWorkOrders: { 3: 1 },
    });
    await expect(t.service.merge(body, MEO)).rejects.toThrow(
      new ConflictException(
        'Ticket #3 has an active Work Order. Finish or cancel its Work Orders first.',
      ),
    );
    expect(t.writes()).toEqual([]);
    expect(t.logInPgTx).not.toHaveBeenCalled();
    expect(t.recalculateTickets).not.toHaveBeenCalled();
    expect(t.recalculateActiveTickets).not.toHaveBeenCalled();
  });

  it('rejects another office, Focal past Reported and the System Administrator', async () => {
    const mdrrmo = setup({
      tickets: [
        pothole(3, { assigned_office: 'MDRRMO' }),
        pothole(5, { assigned_office: 'MDRRMO' }),
      ],
    });
    await expect(mdrrmo.service.merge(body, MEO)).rejects.toThrow(
      ForbiddenException,
    );
    const reviewed = setup({
      tickets: [pothole(3, { status: 'Under Review' }), pothole(5)],
    });
    await expect(reviewed.service.merge(body, FOCAL)).rejects.toThrow(
      ForbiddenException,
    );
    const sys = setup({ tickets: [pothole(3), pothole(5)] });
    await expect(sys.service.merge(body, SYSTEM_ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets Focal merge Reported tickets of any office', async () => {
    const t = setup({
      tickets: [
        pothole(3, { assigned_office: 'MDRRMO' }),
        pothole(5, { assigned_office: 'MDRRMO' }),
      ],
    });
    await expect(t.service.merge(body, FOCAL)).resolves.toMatchObject({
      survivorTicketId: 5,
    });
  });

  it('validates the input before touching the database', async () => {
    const t = setup({ tickets: [] });
    await expect(
      t.service.merge({ ...body, reason: ' ' }, MEO),
    ).rejects.toThrow(BadRequestException);
    await expect(
      t.service.merge(
        { survivorTicketId: 3, mergedTicketId: 3, reason: 'x' },
        MEO,
      ),
    ).rejects.toThrow(
      new BadRequestException('Choose two different tickets to merge.'),
    );
    expect(t.calls).toEqual([]);
  });

  it('404s an unknown ticket', async () => {
    const t = setup({ tickets: [pothole(5)] });
    await expect(t.service.merge(body, MEO)).rejects.toThrow(
      new NotFoundException('Ticket #3 not found.'),
    );
  });
});

describe('TicketGroupingService.removeReport', () => {
  const body = { reportId: 10, reason: 'A different drain, 40 m away.' };

  it('creates a ticket for the report as a new submission would, moves it, and recounts both', async () => {
    const t = setup({
      tickets: [
        pothole(7, { category: 'Localized Flooding', assigned_office: 'MEO' }),
      ],
      reports: { 10: 7 },
    });
    await expect(t.service.removeReport(body, MEO)).resolves.toEqual({
      reportId: 10,
      fromTicketId: 7,
      newTicketId: 500,
    });
    expect(t.findBarangayForPoint).toHaveBeenCalledWith(15.07, 120.54);
    const insert = t.calls.find((c) => c.text.includes('INSERT INTO tickets'))!;
    // category (the ticket's current one), barangay from the report's pin,
    // office from Initial Routing by category (Localized Flooding -> MDRRMO)
    // for both assigned_office and initial_assigned_office, the pin as the
    // location; status is left to its default, Reported.
    expect(insert.values).toEqual([
      'Localized Flooding',
      9,
      'MDRRMO',
      'MDRRMO',
      120.54,
      15.07,
    ]);
    expect(insert.text).not.toMatch(/status/);
    const writes = t.writes();
    expect(writes[1]).toMatch(
      /UPDATE reports SET ticket_id = \? WHERE id = \?/,
    );
    expect(writes.filter((w) => w.includes('member_count ='))).toHaveLength(2);
    expect(t.logInPgTx.mock.calls[0][1]).toMatchObject({
      actionType: 'report_removed_from_ticket',
      targetType: 'report',
      targetId: 10,
      targetSummary: 'Report PRC-2026-000010',
      metadata: {
        fromTicketId: 7,
        newTicketId: 500,
        reason: 'A different drain, 40 m away.',
      },
    });
    // Both tickets' membership changed: the old one and the new one.
    expectRecalculatedInTx(t, [7, 500]);
    expect(t.recalculateActiveTickets).toHaveBeenCalledTimes(1);
  });

  it('needs at least two reports on the ticket (409), and writes nothing', async () => {
    const t = setup({
      tickets: [pothole(7)],
      reports: { 10: 7 },
      reportCount: 1,
    });
    await expect(t.service.removeReport(body, MEO)).rejects.toThrow(
      new ConflictException(
        'Ticket #7 has only this report, so there is nothing to remove it from.',
      ),
    );
    expect(t.writes()).toEqual([]);
  });

  it('refuses when the pin is outside the municipality (409), before the transaction', async () => {
    const t = setup({
      tickets: [pothole(7)],
      reports: { 10: 7 },
      barangay: null,
    });
    await expect(t.service.removeReport(body, MEO)).rejects.toThrow(
      ConflictException,
    );
    expect(t.calls.some((c) => c.inTx)).toBe(false);
  });

  it('refuses when the report moved meanwhile (409)', async () => {
    const t = setup({
      tickets: [pothole(7)],
      reports: { 10: 7 },
      reportTicketWhenLocked: 8,
    });
    await expect(t.service.removeReport(body, MEO)).rejects.toThrow(
      new ConflictException(
        'This report was moved to another ticket meanwhile. Reload and try again.',
      ),
    );
    expect(t.writes()).toEqual([]);
  });

  it('404s an unknown report', async () => {
    const t = setup({ tickets: [], reports: {} });
    await expect(t.service.removeReport(body, MEO)).rejects.toThrow(
      new NotFoundException('Report not found.'),
    );
  });
});

describe('TicketGroupingService.regroupReport', () => {
  const body = {
    reportId: 9,
    toTicketId: 3,
    reason: 'Belongs with the other report.',
  };

  it('moves the report, recounts both tickets and records report_regrouped', async () => {
    const t = setup({ tickets: [pothole(3), pothole(7)], reports: { 9: 7 } });
    await expect(t.service.regroupReport(body, MEO)).resolves.toEqual({
      reportId: 9,
      fromTicketId: 7,
      toTicketId: 3,
    });
    expect(t.locks()).toEqual([3, 7]);
    expect(t.writes()[0]).toMatch(
      /UPDATE reports SET ticket_id = \? WHERE id = \?/,
    );
    expect(t.writes().filter((w) => w.includes('member_count ='))).toHaveLength(
      2,
    );
    expect(t.logInPgTx.mock.calls[0][1]).toMatchObject({
      actionType: 'report_regrouped',
      targetType: 'report',
      targetId: 9,
      metadata: {
        fromTicketId: 7,
        toTicketId: 3,
        reason: 'Belongs with the other report.',
      },
    });
    expectRecalculatedInTx(t, [7, 3]);
    expect(t.recalculateActiveTickets).toHaveBeenCalledTimes(1);
  });

  it("is not blocked by the source ticket's active Work Orders", async () => {
    const t = setup({
      tickets: [pothole(3), pothole(7)],
      reports: { 9: 7 },
      activeWorkOrders: { 7: 1 },
    });
    await expect(t.service.regroupReport(body, MEO)).resolves.toMatchObject({
      toTicketId: 3,
    });
  });

  it('keeps at least one report on the source ticket (409)', async () => {
    const t = setup({
      tickets: [pothole(3), pothole(7)],
      reports: { 9: 7 },
      reportCount: 1,
    });
    await expect(t.service.regroupReport(body, MEO)).rejects.toThrow(
      new ConflictException(
        'Ticket #7 would have no reports left. Merge the tickets instead.',
      ),
    );
    expect(t.writes()).toEqual([]);
  });

  it('rejects moving a report to its own ticket (400)', async () => {
    const t = setup({ tickets: [pothole(3)], reports: { 9: 3 } });
    await expect(t.service.regroupReport(body, MEO)).rejects.toThrow(
      new BadRequestException('The report is already on Ticket #3.'),
    );
  });

  it('applies the merge rules between the two tickets (office, category, Focal)', async () => {
    const otherOffice = setup({
      tickets: [pothole(3, { assigned_office: 'MDRRMO' }), pothole(7)],
      reports: { 9: 7 },
    });
    await expect(otherOffice.service.regroupReport(body, MEO)).rejects.toThrow(
      /Reassign or Refer first/,
    );
    const otherCategory = setup({
      tickets: [pothole(3, { category: 'Streetlight Out' }), pothole(7)],
      reports: { 9: 7 },
    });
    await expect(
      otherCategory.service.regroupReport(body, MEO),
    ).rejects.toThrow(/Correct the category first/);
    const focal = setup({
      tickets: [pothole(3, { status: 'In Progress' }), pothole(7)],
      reports: { 9: 7 },
    });
    await expect(focal.service.regroupReport(body, FOCAL)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
