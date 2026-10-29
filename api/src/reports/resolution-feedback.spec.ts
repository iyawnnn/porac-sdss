import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { ReportsService } from './reports.service';
import type { BarangayService } from '../domain/barangay.service';
import type { MediaService } from '../domain/media.service';
import type { RateLimitService } from '../domain/ratelimit.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type { NotificationsService } from '../notifications/notifications.service';

// Per-citizen resolution feedback (Appendix H RESOLUTION_FEEDBACK;
// manuscript revision Phase 3, step 3g). ReportsService runs against a
// small in-memory stand-in for the five statements answerResolution sends
// (each one matched on its SQL text and given the same meaning as the
// real query), so the rules are checked by behavior, not by source text.
// The SQL itself was run against Postgres (PGlite) with migration 0042.

interface Ticket {
  id: number;
  status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  merged_into_ticket_id: number | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  resolution_confirmed_at: string | null;
  priority_index: number;
}
interface Report {
  id: number;
  ticket_id: number;
  citizen_id: number;
  title: string;
  created_at: string;
}
interface Feedback {
  ticket_id: number;
  citizen_id: number;
  feedback_type: 'CONFIRMED' | 'DISPUTED';
  reason: string | null;
  created_at: string;
}
interface State {
  tickets: Ticket[];
  reports: Report[];
  feedback: Feedback[];
  notifications: { recipientOffice: string; type: string; entityId: number }[];
}

const CITIZEN_A = 101;
const CITIZEN_B = 102;
const CITIZEN_C = 103;
const OUTSIDER = 104;

function ticket(id: number, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    status: 'Resolved',
    assigned_office: 'MEO',
    merged_into_ticket_id: null,
    disputed_at: null,
    dispute_reason: null,
    resolution_confirmed_at: null,
    priority_index: 40,
    ...overrides,
  };
}

// Ticket 1: Resolved, reported by A (report 11), B (report 12) and C (report
// 13, merged in from ticket 2, which is now merged away into 1). Ticket 3:
// still In Progress, reported by A (report 31). Report 21 is a leftover still
// sitting on merged-away ticket 2 (a merge moves reports, so this only
// checks the survivor walk). Report 41 belongs to OUTSIDER on ticket 4.
function seed(): State {
  return {
    tickets: [
      ticket(1),
      ticket(2, { merged_into_ticket_id: 1 }),
      ticket(3, { status: 'In Progress' }),
      ticket(4, { assigned_office: 'MDRRMO' }),
    ],
    reports: [
      {
        id: 11,
        ticket_id: 1,
        citizen_id: CITIZEN_A,
        title: 'Pothole on the main road',
        created_at: '2026-10-01',
      },
      {
        id: 12,
        ticket_id: 1,
        citizen_id: CITIZEN_B,
        title: 'Same pothole',
        created_at: '2026-10-02',
      },
      {
        id: 13,
        ticket_id: 1,
        citizen_id: CITIZEN_C,
        title: 'Merged-in report',
        created_at: '2026-10-03',
      },
      {
        id: 21,
        ticket_id: 2,
        citizen_id: CITIZEN_C,
        title: 'Left on the merged-away ticket',
        created_at: '2026-10-03',
      },
      {
        id: 31,
        ticket_id: 3,
        citizen_id: CITIZEN_A,
        title: 'Not resolved yet',
        created_at: '2026-10-04',
      },
      {
        id: 41,
        ticket_id: 4,
        citizen_id: OUTSIDER,
        title: 'Elsewhere',
        created_at: '2026-10-05',
      },
    ],
    feedback: [],
    notifications: [],
  };
}

function makeService(state: State) {
  let clock = 0;
  const now = () => `2026-10-29T00:00:${String(clock++).padStart(2, '0')}.000Z`;
  const text = (strings: TemplateStringsArray) =>
    strings.join('?').replace(/\s+/g, ' ').trim();
  const survivorOf = (id: number) => {
    let t = state.tickets.find((x) => x.id === id);
    for (
      let hops = 0;
      t && t.merged_into_ticket_id !== null && hops < 10;
      hops++
    ) {
      t = state.tickets.find((x) => x.id === t!.merged_into_ticket_id);
    }
    return t && t.merged_into_ticket_id === null ? t : undefined;
  };
  const family = (id: number): number[] => [
    id,
    ...state.tickets
      .filter((t) => t.merged_into_ticket_id === id)
      .flatMap((t) => family(t.id)),
  ];

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = text(strings);
    if (q.startsWith('SELECT r.ticket_id FROM reports r')) {
      const [reportId, citizenId] = values as number[];
      const r = state.reports.find(
        (x) => x.id === reportId && x.citizen_id === citizenId,
      );
      return Promise.resolve(r ? [{ ticket_id: r.ticket_id }] : []);
    }
    if (q.startsWith('WITH RECURSIVE chain')) {
      const t = survivorOf(values[0] as number);
      return Promise.resolve(t ? [{ id: t.id }] : []);
    }
    if (q.startsWith('WITH RECURSIVE family')) {
      expect(q).toMatch(/FOR UPDATE OF t$/);
      const [id, , citizenId] = values as number[];
      const t = state.tickets.find((x) => x.id === id);
      if (!t) return Promise.resolve([]);
      const ids = family(id);
      const first = state.reports
        .filter((r) => r.ticket_id === id)
        .sort(
          (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
        )[0];
      return Promise.resolve([
        {
          ticket_id: t.id,
          status: t.status,
          assigned_office: t.assigned_office,
          merged_into_ticket_id: t.merged_into_ticket_id,
          title: first?.title ?? null,
          has_report: state.reports.some(
            (r) => ids.includes(r.ticket_id) && r.citizen_id === citizenId,
          ),
        },
      ]);
    }
    if (q.startsWith('INSERT INTO resolution_feedback')) {
      expect(q).toContain('ON CONFLICT (ticket_id, citizen_id) DO NOTHING');
      const [ticketId, citizenId, feedbackType, reason] = values as [
        number,
        number,
        Feedback['feedback_type'],
        string | null,
      ];
      if (
        state.feedback.some(
          (f) => f.ticket_id === ticketId && f.citizen_id === citizenId,
        )
      ) {
        return Promise.resolve([]);
      }
      const row = {
        ticket_id: ticketId,
        citizen_id: citizenId,
        feedback_type: feedbackType,
        reason,
        created_at: now(),
      };
      state.feedback.push(row);
      return Promise.resolve([
        {
          feedback_type: row.feedback_type,
          reason: row.reason,
          created_at: row.created_at,
        },
      ]);
    }
    if (
      q.startsWith('UPDATE tickets SET disputed_at = now(), dispute_reason = ?')
    ) {
      expect(q).toMatch(/WHERE id = \? AND disputed_at IS NULL$/);
      const [reason, id] = values as [string, number];
      const t = state.tickets.find((x) => x.id === id)!;
      if (t.disputed_at === null) {
        t.disputed_at = now();
        t.dispute_reason = reason;
      }
      return Promise.resolve([]);
    }
    if (q.startsWith('UPDATE tickets SET resolution_confirmed_at = now()')) {
      expect(q).toMatch(
        /WHERE id = \? AND resolution_confirmed_at IS NULL AND disputed_at IS NULL$/,
      );
      const t = state.tickets.find((x) => x.id === (values[0] as number))!;
      if (t.resolution_confirmed_at === null && t.disputed_at === null) {
        t.resolution_confirmed_at = now();
      }
      return Promise.resolve([]);
    }
    throw new Error(`unexpected SQL: ${q}`);
  };
  // A failed transaction keeps nothing, as in Postgres.
  (sql as unknown as { begin: unknown }).begin = async (
    cb: (tx: unknown) => Promise<unknown>,
  ) => {
    const snapshot = structuredClone(state);
    try {
      return await cb(sql);
    } catch (err) {
      Object.assign(state, snapshot);
      throw err;
    }
  };
  const notifications = {
    createInTx: (
      _tx: unknown,
      n: State['notifications'][number] & Record<string, unknown>,
    ) => {
      state.notifications.push({
        recipientOffice: n.recipientOffice,
        type: n.type,
        entityId: n.entityId,
      });
      return Promise.resolve();
    },
  };
  return new ReportsService(
    sql as unknown as Sql,
    {} as BarangayService,
    {} as MediaService,
    {} as RateLimitService,
    {} as OperationalPriorityService,
    notifications as unknown as NotificationsService,
  );
}

describe('per-citizen resolution feedback (Phase 3, step 3g)', () => {
  let state: State;
  let service: ReportsService;
  beforeEach(() => {
    state = seed();
    service = makeService(state);
  });
  const ticket1 = () => state.tickets.find((t) => t.id === 1)!;

  it('two citizens on one ticket answer independently', async () => {
    const a = await service.confirmResolution(CITIZEN_A, 11);
    const b = await service.disputeReport(
      CITIZEN_B,
      12,
      '  Still a hole after the rain.  ',
    );

    expect(a).toMatchObject({
      ticket_id: 1,
      feedback: { feedback_type: 'CONFIRMED', reason: null },
    });
    expect(b).toMatchObject({
      ticket_id: 1,
      feedback: {
        feedback_type: 'DISPUTED',
        reason: 'Still a hole after the rain.',
      },
    });
    expect(state.feedback.map((f) => [f.citizen_id, f.feedback_type])).toEqual([
      [CITIZEN_A, 'CONFIRMED'],
      [CITIZEN_B, 'DISPUTED'],
    ]);
  });

  it('the same citizen answering twice gets a 409 and nothing changes', async () => {
    await service.confirmResolution(CITIZEN_A, 11);
    const before = structuredClone(state);

    await expect(service.confirmResolution(CITIZEN_A, 11)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.disputeReport(CITIZEN_A, 11, 'Changed my mind'),
    ).rejects.toThrow(ConflictException);
    expect(state).toEqual(before);
  });

  it('one locked answer per citizen per ticket, whichever of their reports they answer through', async () => {
    state.reports.push({
      id: 14,
      ticket_id: 1,
      citizen_id: CITIZEN_A,
      title: 'A again',
      created_at: '2026-10-06',
    });
    await service.confirmResolution(CITIZEN_A, 11);
    await expect(service.confirmResolution(CITIZEN_A, 14)).rejects.toThrow(
      ConflictException,
    );
    expect(state.feedback).toHaveLength(1);
  });

  it('a citizen with no report on the ticket gets a 403', async () => {
    await expect(
      service.answerResolution(OUTSIDER, 1, 'CONFIRMED', null),
    ).rejects.toThrow(ForbiddenException);
    expect(state.feedback).toEqual([]);
  });

  it("a report that isn't the citizen's is a 404, as on every reports.mine route", async () => {
    await expect(service.confirmResolution(OUTSIDER, 11)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.disputeReport(CITIZEN_B, 999, 'x')).rejects.toThrow(
      NotFoundException,
    );
    expect(state.feedback).toEqual([]);
  });

  it('only a Resolved ticket accepts feedback (400)', async () => {
    await expect(service.confirmResolution(CITIZEN_A, 31)).rejects.toThrow(
      'Only resolved tickets can be confirmed.',
    );
    await expect(
      service.disputeReport(CITIZEN_A, 31, 'Not fixed'),
    ).rejects.toThrow('Only resolved tickets can be disputed.');
    expect(state.feedback).toEqual([]);
  });

  it('a dispute needs a non-empty reason (400) and keeps the trimmed reason', async () => {
    for (const reason of ['', '   ']) {
      await expect(
        service.disputeReport(CITIZEN_B, 12, reason),
      ).rejects.toThrow(BadRequestException);
    }
    await expect(
      service.disputeReport(CITIZEN_B, 12, 'x'.repeat(1001)),
    ).rejects.toThrow(BadRequestException);
    expect(state.feedback).toEqual([]);
  });

  it('a confirmation stores no reason', async () => {
    await service.confirmResolution(CITIZEN_B, 12);
    expect(state.feedback[0]).toMatchObject({
      feedback_type: 'CONFIRMED',
      reason: null,
    });
  });

  it('a reporter whose report was merged into the ticket can answer', async () => {
    const result = await service.confirmResolution(CITIZEN_C, 13);
    expect(result.ticket_id).toBe(1);
    expect(state.feedback).toEqual([
      expect.objectContaining({ ticket_id: 1, citizen_id: CITIZEN_C }),
    ]);
  });

  it('a merged-away ticket id resolves to its survivor; nothing is written against the merged-away id', async () => {
    const viaTicket = await service.answerResolution(
      CITIZEN_C,
      2,
      'DISPUTED',
      'Still flooded',
    );
    expect(viaTicket.ticket_id).toBe(1);
    expect(state.feedback.every((f) => f.ticket_id === 1)).toBe(true);
    expect(state.tickets.find((t) => t.id === 2)).toMatchObject({
      disputed_at: null,
      dispute_reason: null,
    });
    expect(state.notifications).toEqual([
      { recipientOffice: 'MEO', type: 'ticket_disputed', entityId: 1 },
    ]);

    // Through the leftover report still on the merged-away ticket: the same
    // survivor, and the same citizen is now locked.
    await expect(service.confirmResolution(CITIZEN_C, 21)).rejects.toThrow(
      ConflictException,
    );
  });

  it('a dispute still flags the ticket and notifies the office after another citizen already confirmed', async () => {
    await service.confirmResolution(CITIZEN_A, 11);
    await service.disputeReport(CITIZEN_B, 12, 'Came back');

    expect(ticket1()).toMatchObject({
      dispute_reason: 'Came back',
      status: 'Resolved',
      priority_index: 40,
    });
    expect(ticket1().disputed_at).not.toBeNull();
    expect(state.notifications).toEqual([
      { recipientOffice: 'MEO', type: 'ticket_disputed', entityId: 1 },
    ]);
  });

  it('every dispute notifies the assigned office; the first dispute alone sets the ticket-level columns', async () => {
    await service.disputeReport(CITIZEN_A, 11, 'First');
    const firstAt = ticket1().disputed_at;
    await service.disputeReport(CITIZEN_B, 12, 'Second');

    expect(ticket1()).toMatchObject({
      disputed_at: firstAt,
      dispute_reason: 'First',
    });
    expect(state.notifications).toHaveLength(2);
    expect(state.feedback.map((f) => f.reason)).toEqual(['First', 'Second']);
  });

  it('dual-write: the first confirmation sets resolution_confirmed_at only while the ticket has no dispute', async () => {
    await service.confirmResolution(CITIZEN_A, 11);
    const confirmedAt = ticket1().resolution_confirmed_at;
    expect(confirmedAt).not.toBeNull();
    await service.confirmResolution(CITIZEN_B, 12);
    expect(ticket1().resolution_confirmed_at).toBe(confirmedAt);
    expect(state.notifications).toEqual([]);

    // A disputed ticket: a later confirmation is stored for the citizen but
    // never sets the ticket-level confirmation.
    const other = seed();
    const s = makeService(other);
    await s.disputeReport(CITIZEN_A, 11, 'Not fixed');
    await s.confirmResolution(CITIZEN_B, 12);
    expect(other.tickets[0]).toMatchObject({
      resolution_confirmed_at: null,
      dispute_reason: 'Not fixed',
    });
    expect(other.feedback.map((f) => f.feedback_type)).toEqual([
      'DISPUTED',
      'CONFIRMED',
    ]);
  });

  it('never changes the status or Operational Priority', async () => {
    await service.disputeReport(CITIZEN_A, 11, 'Not fixed');
    await service.confirmResolution(CITIZEN_B, 12);
    expect(ticket1()).toMatchObject({ status: 'Resolved', priority_index: 40 });
  });
});
