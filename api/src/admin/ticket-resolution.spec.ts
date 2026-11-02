import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import type { ConfigService } from '@nestjs/config';
import { TicketsService } from './tickets.service';
import type { AdminSession } from '../auth/session.service';
import type { MediaService } from '../domain/media.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import type { AdminAuditService } from './admin-audit.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type { TransactionSql } from 'postgres';
import type { LogAdminAuditInput } from './admin-audit.service';
import type { CreateNotificationInput } from '../notifications/notifications.service';

// Manuscript revision Phase 5, step 5c: resolving (outcome + notes, Work
// Order and referral rules, the resolution record and its status_history
// snapshot) and returning a Resolved External Referral ticket to Under
// Review, through the real TicketsService on a fake client. The fake answers
// by query text and REFUSES any JS Date parameter (the repo's date rule:
// ISO strings with ::timestamptz, or SQL now()).

interface Call {
  text: string;
  values: unknown[];
  inTx: boolean;
}

type Responder = (text: string, values: unknown[]) => unknown;

function makeDb(respond: Responder) {
  const calls: Call[] = [];
  const make = (inTx: boolean) =>
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      if (values.some((v) => v instanceof Date)) {
        throw new Error('A JS Date was passed to raw SQL');
      }
      const text = strings.join('?');
      calls.push({ text, values, inTx });
      const result = respond(text, values);
      return {
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          void (
            result instanceof Error
              ? Promise.reject(result)
              : Promise.resolve(result)
          ).then(resolve, reject);
        },
      };
    }) as unknown as Sql;
  const sql = make(false);
  const tx = make(true);
  (
    sql as unknown as {
      begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
    }
  ).begin = (cb) => cb(tx);
  return { sql, calls };
}

const MEO: AdminSession = {
  adminId: 5,
  adminName: 'Mae Ocampo',
  email: 'meo@porac.gov.ph',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};
const MDRRMO: AdminSession = {
  ...MEO,
  adminId: 6,
  office: 'MDRRMO',
};
const FOCAL: AdminSession = {
  ...MEO,
  adminId: 7,
  isFocal: true,
  office: 'MDRRMO',
};
const SYSTEM_ADMIN: AdminSession = {
  ...MEO,
  adminId: 8,
  accountType: 'SYSTEM_ADMIN',
  office: null,
} as unknown as AdminSession;

function build(respond: Responder) {
  const { sql, calls } = makeDb(respond);
  const uploadImage = jest
    .fn()
    .mockResolvedValue('https://cdn.example/proof.jpg');
  const createInTx = jest.fn<
    Promise<void>,
    [TransactionSql, CreateNotificationInput]
  >(() => Promise.resolve());
  const sendReportResolved = jest.fn().mockResolvedValue(undefined);
  const logInPgTx = jest.fn<
    Promise<void>,
    [TransactionSql, LogAdminAuditInput]
  >(() => Promise.resolve());
  const recalculateTickets = jest.fn<
    Promise<{ updated: number }>,
    [TransactionSql, number[]]
  >(() => Promise.resolve({ updated: 1 }));
  const recalculateActiveTickets = jest.fn().mockResolvedValue({ updated: 3 });
  const service = new TicketsService(
    sql,
    { uploadImage } as unknown as MediaService,
    { createInTx } as unknown as NotificationsService,
    { sendReportResolved } as unknown as EmailService,
    {
      get: jest.fn().mockReturnValue('https://porac.example'),
    } as unknown as ConfigService<Env, true>,
    { logInPgTx } as unknown as AdminAuditService,
    {
      recalculateTickets,
      recalculateActiveTickets,
    } as unknown as OperationalPriorityService,
  );
  const writes = () => calls.filter((c) => /^\s*(UPDATE|INSERT)/.test(c.text));
  return {
    service,
    calls,
    writes,
    uploadImage,
    createInTx,
    sendReportResolved,
    logInPgTx,
    recalculateTickets,
    recalculateActiveTickets,
  };
}

// ---------------------------------------------------------------- resolve

interface ResolveWorld {
  status?: string;
  office?: 'MEO' | 'MDRRMO';
  merged?: number | null;
  activeWorkOrders?: number;
  referrals?: number;
  // What the locked re-read sees, when it differs from the first read.
  locked?: Partial<{
    status: string;
    activeWorkOrders: number;
    referrals: number;
  }>;
  updateCount?: number;
  updateError?: Error;
  citizens?: { citizen_id: number; report_id: number; email: string }[];
}

function resolveResponder(world: ResolveWorld): Responder {
  const office = world.office ?? 'MEO';
  return (text) => {
    if (
      /SELECT status, assigned_office, category, merged_into_ticket_id FROM tickets/.test(
        text,
      )
    ) {
      return [
        {
          status: world.status ?? 'In Progress',
          assigned_office: office,
          category: 'Streetlight Out',
          merged_into_ticket_id: world.merged ?? null,
        },
      ];
    }
    if (text.includes('AS referral_count')) {
      const locked = text.includes('FOR UPDATE OF t');
      return [
        {
          status:
            (locked ? world.locked?.status : undefined) ??
            world.status ??
            'In Progress',
          assigned_office: office,
          merged_into_ticket_id: world.merged ?? null,
          active_work_orders:
            (locked ? world.locked?.activeWorkOrders : undefined) ??
            world.activeWorkOrders ??
            0,
          referral_count:
            (locked ? world.locked?.referrals : undefined) ??
            world.referrals ??
            0,
        },
      ];
    }
    if (/^\s*UPDATE tickets SET/.test(text)) {
      if (world.updateError) return world.updateError;
      return Object.assign([], { count: world.updateCount ?? 1 });
    }
    if (text.includes('SELECT DISTINCT ON (r.citizen_id)')) {
      return world.citizens ?? [];
    }
    return [];
  };
}

describe('resolving a ticket (Phase 5, step 5c)', () => {
  it.each([
    [undefined, 'Patched.'],
    ['DONE', 'Patched.'],
    ['MUNICIPAL_ACTION_COMPLETED', undefined],
    ['MUNICIPAL_ACTION_COMPLETED', '   '],
    ['EXTERNAL_REFERRAL', 'x'.repeat(2001)],
  ])(
    'refuses outcome %p with notes %p (400) after reading only the ticket',
    async (outcome, notes) => {
      const t = build(resolveResponder({}));
      await expect(
        t.service.advanceStatus(7, MEO, notes, undefined, outcome),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(t.calls).toHaveLength(1);
      expect(t.uploadImage).not.toHaveBeenCalled();
      expect(t.writes()).toHaveLength(0);
    },
  );

  it.each([
    ['Focal Personnel', FOCAL],
    ['the System Administrator', SYSTEM_ADMIN],
    ['another office', MDRRMO],
  ])('refuses %s (403)', async (_label, admin) => {
    const t = build(resolveResponder({}));
    await expect(
      t.service.advanceStatus(
        7,
        admin,
        'Patched.',
        undefined,
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.writes()).toHaveLength(0);
  });

  it('refuses a merged-away ticket (409, not 404)', async () => {
    const t = build(resolveResponder({ merged: 3 }));
    await expect(
      t.service.advanceStatus(
        7,
        MEO,
        'Patched.',
        undefined,
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).rejects.toThrow('Ticket #7 was merged into Ticket #3 and is read-only.');
    expect(t.writes()).toHaveLength(0);
  });

  it('refuses while a Work Order is active (409 naming it), before uploading the photo', async () => {
    const t = build(resolveResponder({ activeWorkOrders: 1, referrals: 1 }));
    await expect(
      t.service.advanceStatus(
        7,
        MEO,
        'Patched.',
        Buffer.from('jpg'),
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Ticket #7 has 1 active Work Order. Complete or cancel it before resolving the ticket.',
      ),
    );
    expect(t.uploadImage).not.toHaveBeenCalled();
    expect(t.writes()).toHaveLength(0);
  });

  it('refuses External Referral with no referral (409), before uploading the photo', async () => {
    const t = build(resolveResponder({ referrals: 0 }));
    await expect(
      t.service.advanceStatus(
        7,
        MEO,
        'Referred.',
        Buffer.from('jpg'),
        'EXTERNAL_REFERRAL',
      ),
    ).rejects.toThrow(
      'Ticket #7 has no recorded referral. Refer it to an external agency first, or resolve it as Municipal action completed.',
    );
    expect(t.uploadImage).not.toHaveBeenCalled();
    expect(t.writes()).toHaveLength(0);
  });

  it('checks the rules again on the locked row: a Work Order started meanwhile refuses with no write', async () => {
    const t = build(
      resolveResponder({ referrals: 1, locked: { activeWorkOrders: 2 } }),
    );
    await expect(
      t.service.advanceStatus(
        7,
        MEO,
        'Referred.',
        undefined,
        'EXTERNAL_REFERRAL',
      ),
    ).rejects.toThrow('Ticket #7 has 2 active Work Orders.');
    const locked = t.calls.find((c) => c.text.includes('FOR UPDATE OF t'));
    expect(locked?.inTx).toBe(true);
    expect(t.writes()).toHaveLength(0);
    expect(t.logInPgTx).not.toHaveBeenCalled();
  });

  it('refuses when the locked row is no longer In Progress (409), with no write', async () => {
    const t = build(resolveResponder({ locked: { status: 'Resolved' } }));
    await expect(
      t.service.advanceStatus(
        7,
        MEO,
        'Patched.',
        undefined,
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).rejects.toThrow(
      'Ticket status already changed by another request (expected In Progress)',
    );
    expect(t.writes()).toHaveLength(0);
  });

  it('keeps the optimistic status guard: an UPDATE matching no row is a 409 before history/audit', async () => {
    const t = build(resolveResponder({ updateCount: 0 }));
    await expect(
      t.service.advanceStatus(
        7,
        MEO,
        'Patched.',
        undefined,
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const update = t.calls.find((c) => /^\s*UPDATE tickets/.test(c.text));
    expect(update?.text).toContain("AND status = 'In Progress'");
    expect(
      t.calls.some((c) => c.text.includes('INSERT INTO status_history')),
    ).toBe(false);
    expect(t.logInPgTx).not.toHaveBeenCalled();
  });

  it('reports a CHECK violation as a 409 for the resolve, never by constraint name', async () => {
    const checkError = Object.assign(new Error('violates check constraint'), {
      code: '23514',
      constraint_name: 'tickets_resolution_record_check',
    });
    const t = build(resolveResponder({ updateError: checkError }));
    const err = await t.service
      .advanceStatus(
        7,
        MEO,
        'Patched.',
        undefined,
        'MUNICIPAL_ACTION_COMPLETED',
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe(
      'Ticket #7 could not be resolved: its resolution record was refused by the database. Reload the ticket and try again.',
    );
  });

  it('writes the resolution record, the history snapshot, the audit outcome and the notifications in one transaction; email after commit', async () => {
    const t = build(
      resolveResponder({
        citizens: [{ citizen_id: 11, report_id: 21, email: 'a@example.test' }],
      }),
    );
    const result = await t.service.advanceStatus(
      7,
      MEO,
      '  Lamp replaced by the field crew.  ',
      undefined,
      'MUNICIPAL_ACTION_COMPLETED',
    );
    expect(result).toEqual({ status: 'Resolved' });

    const update = t.calls.find((c) => /^\s*UPDATE tickets/.test(c.text))!;
    expect(update.inTx).toBe(true);
    expect(update.text).toContain("status = 'Resolved'");
    expect(update.text).toContain('resolved_at = now()');
    expect(update.text).not.toMatch(/COALESCE/);
    // outcome, notes, image (NULL: no photo, never carried over), resolver.
    expect(update.values).toEqual([
      'MUNICIPAL_ACTION_COMPLETED',
      'Lamp replaced by the field crew.',
      null,
      5,
      7,
    ]);

    const history = t.calls.find((c) =>
      c.text.includes('INSERT INTO status_history'),
    )!;
    expect(history.inTx).toBe(true);
    expect(history.text).toContain("'Resolved', 'In Progress'");
    expect(history.text).toContain(
      'resolution_outcome, resolution_notes, resolution_image_url',
    );
    expect(history.values).toEqual([
      7,
      5,
      'Mae Ocampo',
      'MUNICIPAL_ACTION_COMPLETED',
      'Lamp replaced by the field crew.',
      null,
    ]);

    expect(t.logInPgTx).toHaveBeenCalledTimes(1);
    expect(t.logInPgTx.mock.calls[0][1]).toMatchObject({
      actionType: 'ticket_status_advanced',
      targetId: 7,
      metadata: {
        from: 'In Progress',
        to: 'Resolved',
        outcome: 'MUNICIPAL_ACTION_COMPLETED',
      },
    });
    expect(t.createInTx).toHaveBeenCalledTimes(1);
    expect(t.createInTx.mock.calls[0][1]).toMatchObject({
      type: 'ticket_resolved',
      recipientId: 11,
    });
    expect(t.sendReportResolved).toHaveBeenCalledWith(
      'a@example.test',
      'https://porac.example/dashboard/reports/21',
    );
  });

  it('stores the uploaded photo URL on the ticket and in the snapshot', async () => {
    const t = build(resolveResponder({ referrals: 2 }));
    await t.service.advanceStatus(
      7,
      MEO,
      'Referred to the electric cooperative.',
      Buffer.from('jpg'),
      'EXTERNAL_REFERRAL',
    );
    expect(t.uploadImage).toHaveBeenCalledTimes(1);
    const update = t.calls.find((c) => /^\s*UPDATE tickets/.test(c.text))!;
    expect(update.values[2]).toBe('https://cdn.example/proof.jpg');
    const history = t.calls.find((c) =>
      c.text.includes('INSERT INTO status_history'),
    )!;
    expect(history.values).toContain('https://cdn.example/proof.jpg');
    expect(history.values).toContain('EXTERNAL_REFERRAL');
  });

  it('other ladder steps ignore outcome and notes and write no resolution column', async () => {
    const t = build(resolveResponder({ status: 'Reported' }));
    const result = await t.service.advanceStatus(
      7,
      MEO,
      'ignored',
      undefined,
      'NOT_AN_OUTCOME',
    );
    expect(result).toEqual({ status: 'Under Review' });
    const update = t.calls.find((c) => /^\s*UPDATE tickets/.test(c.text))!;
    expect(update.text).not.toMatch(/resolution_|resolved_/);
    expect(t.calls.some((c) => c.text.includes('AS referral_count'))).toBe(
      false,
    );
  });
});

// ----------------------------------------------------------------- return

interface ReturnWorld {
  exists?: boolean;
  status?: string;
  office?: 'MEO' | 'MDRRMO';
  merged?: number | null;
  outcome?: 'MUNICIPAL_ACTION_COMPLETED' | 'EXTERNAL_REFERRAL' | null;
  resolvedAt?: string | null;
  latestReferralId?: number | null;
  updateCount?: number;
}

function returnResponder(world: ReturnWorld): Responder {
  return (text) => {
    if (
      text.includes('resolution_outcome, resolved_at') &&
      text.includes('FOR UPDATE')
    ) {
      if (world.exists === false) return [];
      return [
        {
          status: world.status ?? 'Resolved',
          assigned_office: world.office ?? 'MEO',
          category: 'Leaking Pipe / Water Supply Concern',
          merged_into_ticket_id: world.merged ?? null,
          resolution_outcome:
            world.outcome === undefined ? 'EXTERNAL_REFERRAL' : world.outcome,
          resolved_at:
            world.resolvedAt === undefined
              ? '2026-11-01T08:00:00.000Z'
              : world.resolvedAt,
        },
      ];
    }
    if (text.includes('FROM routing_actions') && text.includes('LIMIT 1')) {
      return world.latestReferralId === null
        ? []
        : [{ id: world.latestReferralId ?? 33 }];
    }
    if (/^\s*UPDATE tickets SET/.test(text)) {
      return Object.assign([], { count: world.updateCount ?? 1 });
    }
    return [];
  };
}

describe('returning a ticket to Under Review (Phase 5, step 5c)', () => {
  it.each([undefined, '', '   ', 'x'.repeat(1001)])(
    'refuses reason %p (400) before reading anything',
    async (reason) => {
      const t = build(returnResponder({}));
      await expect(
        t.service.returnToReview(9, MEO, reason),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(t.calls).toHaveLength(0);
    },
  );

  it('404s a missing ticket', async () => {
    const t = build(returnResponder({ exists: false }));
    await expect(
      t.service.returnToReview(9, MEO, 'Wrong agency.'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['Focal Personnel', FOCAL],
    ['the System Administrator', SYSTEM_ADMIN],
    ['another office', MDRRMO],
  ])('refuses %s (403) with no write', async (_label, admin) => {
    const t = build(returnResponder({}));
    await expect(
      t.service.returnToReview(9, admin, 'Wrong agency.'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.writes()).toHaveLength(0);
  });

  it('refuses a merged-away ticket (409)', async () => {
    const t = build(returnResponder({ merged: 4 }));
    await expect(
      t.service.returnToReview(9, MEO, 'Wrong agency.'),
    ).rejects.toThrow('Ticket #9 was merged into Ticket #4 and is read-only.');
  });

  it.each([
    [
      'an In Progress ticket',
      { status: 'In Progress', outcome: null, resolvedAt: null },
      'Ticket #9 is In Progress; only a Resolved ticket can be returned to Under Review.',
    ],
    [
      'a legacy Resolved ticket',
      { outcome: 'MUNICIPAL_ACTION_COMPLETED', resolvedAt: null },
      "Ticket #9 was resolved before outcomes were recorded (legacy) and can't be returned to Under Review.",
    ],
    [
      'a ticket resolved as Municipal action completed',
      { outcome: 'MUNICIPAL_ACTION_COMPLETED' },
      'Ticket #9 was resolved as Municipal action completed; only a ticket resolved by External referral can be returned to Under Review.',
    ],
  ] as const)(
    'refuses %s (409) with no write',
    async (_label, world, message) => {
      const t = build(returnResponder(world));
      await expect(
        t.service.returnToReview(9, MEO, 'Wrong agency.'),
      ).rejects.toThrow(new ConflictException(message));
      expect(t.writes()).toHaveLength(0);
      expect(t.recalculateTickets).not.toHaveBeenCalled();
    },
  );

  it('returns it: one locked transaction clearing the resolution record with the status, a reasoned history row, the audit event and the priority; no notification or email', async () => {
    const t = build(returnResponder({ latestReferralId: 33 }));
    const result = await t.service.returnToReview(
      9,
      MEO,
      '  The water district says this is not theirs.  ',
    );
    expect(result).toEqual({ status: 'Under Review' });

    const lock = t.calls[0];
    expect(lock.inTx).toBe(true);
    expect(lock.text).toContain('FOR UPDATE');

    const update = t.calls.find((c) => /^\s*UPDATE tickets/.test(c.text))!;
    expect(update.inTx).toBe(true);
    for (const cleared of [
      "status = 'Under Review'",
      'resolution_outcome = NULL',
      'resolution_notes = NULL',
      'resolution_image_url = NULL',
      'resolved_at = NULL',
      'resolved_by_admin_id = NULL',
    ]) {
      expect(update.text).toContain(cleared);
    }
    expect(update.text).toContain(
      "AND resolution_outcome = 'EXTERNAL_REFERRAL'",
    );
    expect(update.text).toContain('AND resolved_at IS NOT NULL');
    expect(update.text).toContain('AND merged_into_ticket_id IS NULL');

    const history = t.calls.find((c) =>
      c.text.includes('INSERT INTO status_history'),
    )!;
    expect(history.inTx).toBe(true);
    expect(history.text).toContain("'Under Review', 'Resolved'");
    expect(history.values).toEqual([
      9,
      'The water district says this is not theirs.',
      5,
      'Mae Ocampo',
    ]);
    // Nothing earlier is touched: no other UPDATE, no DELETE, and the
    // referral is only read.
    expect(t.writes()).toHaveLength(2);
    expect(t.calls.some((c) => /DELETE/.test(c.text))).toBe(false);

    expect(t.logInPgTx).toHaveBeenCalledTimes(1);
    expect(t.logInPgTx.mock.calls[0][1]).toMatchObject({
      actionType: 'ticket_returned_to_review',
      targetType: 'ticket',
      targetId: 9,
      metadata: {
        from: 'Resolved',
        to: 'Under Review',
        reason: 'The water district says this is not theirs.',
        previousOutcome: 'EXTERNAL_REFERRAL',
        latestReferralId: 33,
      },
    });
    expect(t.recalculateTickets).toHaveBeenCalledTimes(1);
    expect(t.recalculateTickets.mock.calls[0][1]).toEqual([9]);
    expect(t.recalculateActiveTickets).toHaveBeenCalledTimes(1);
    expect(t.createInTx).not.toHaveBeenCalled();
    expect(t.sendReportResolved).not.toHaveBeenCalled();
  });

  it('records latestReferralId null when the ticket has no REFER row', async () => {
    const t = build(returnResponder({ latestReferralId: null }));
    await t.service.returnToReview(9, MEO, 'Wrong agency.');
    expect(
      (t.logInPgTx.mock.calls[0][1].metadata as Record<string, unknown>)
        .latestReferralId,
    ).toBeNull();
  });

  it('an UPDATE matching no row (changed meanwhile) is a 409 with no history or audit', async () => {
    const t = build(returnResponder({ updateCount: 0 }));
    await expect(
      t.service.returnToReview(9, MEO, 'Wrong agency.'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      t.calls.some((c) => c.text.includes('INSERT INTO status_history')),
    ).toBe(false);
    expect(t.logInPgTx).not.toHaveBeenCalled();
    expect(t.recalculateTickets).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------ read model

function detailResponder(ticket: Record<string, unknown>): Responder {
  return (text) => {
    if (text.includes('AS barangay_geojson')) {
      return [
        {
          id: 9,
          category: 'Leaking Pipe / Water Supply Concern',
          barangay_id: 1,
          barangay_name: 'Jalung',
          barangay_geojson: null,
          status: 'Resolved',
          assigned_office: 'MEO',
          initial_assigned_office: 'MEO',
          resolution_outcome: 'EXTERNAL_REFERRAL',
          member_count: 1,
          lat: 15,
          lng: 120,
          priority_index: 40,
          resolution_image_url: null,
          resolution_notes: 'Referred.',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
          resolved_at: '2026-11-01T08:00:00.000Z',
          resolved_by_name: 'Mae Ocampo',
          disputed_at: null,
          dispute_reason: null,
          category_review_required: false,
          merged_into_ticket_id: null,
          active_work_orders: 0,
          ...ticket,
        },
      ];
    }
    return [];
  };
}

describe('Ticket Detail resolution read model (Phase 5, step 5c)', () => {
  it('a current External Referral resolution: outcome, resolver, return available', async () => {
    const t = build(detailResponder({}));
    const detail = (await t.service.getTicketDetail(9, MEO))!;
    expect(detail.ticket).toMatchObject({
      resolution_outcome: 'EXTERNAL_REFERRAL',
      resolution_legacy: false,
      resolved_by_name: 'Mae Ocampo',
    });
    expect(detail.returnToReview).toEqual({ available: true });
  });

  it('a legacy Resolved ticket: the stored outcome is hidden, flagged legacy, no return', async () => {
    const t = build(
      detailResponder({
        resolution_outcome: 'MUNICIPAL_ACTION_COMPLETED',
        resolved_at: null,
        resolved_by_name: '',
        resolution_notes: null,
      }),
    );
    const detail = (await t.service.getTicketDetail(9, MEO))!;
    expect(detail.ticket.resolution_outcome).toBeNull();
    expect(detail.ticket.resolution_legacy).toBe(true);
    expect(detail.ticket.resolved_by_name).toBeNull();
    expect(detail.returnToReview).toEqual({ available: false });
  });

  it('Municipal action completed offers no return', async () => {
    const t = build(
      detailResponder({ resolution_outcome: 'MUNICIPAL_ACTION_COMPLETED' }),
    );
    const detail = (await t.service.getTicketDetail(9, MEO))!;
    expect(detail.returnToReview).toEqual({ available: false });
  });

  it.each([
    [
      'a dispute before the latest resolution',
      '2026-10-30T00:00:00.000Z',
      '2026-11-01T08:00:00.000Z',
      false,
    ],
    [
      'a dispute at the latest resolution',
      '2026-11-01T08:00:00.000Z',
      '2026-11-01T08:00:00.000Z',
      true,
    ],
    [
      'a dispute after the latest resolution',
      '2026-11-02T00:00:00.000Z',
      '2026-11-01T08:00:00.000Z',
      true,
    ],
    [
      'a legacy ticket (no resolved_at)',
      '2026-10-30T00:00:00.000Z',
      null,
      true,
    ],
    ['no dispute', null, '2026-11-01T08:00:00.000Z', false],
  ])('Disputed badge: %s', async (_label, disputedAt, resolvedAt, shown) => {
    const t = build(
      detailResponder({ disputed_at: disputedAt, resolved_at: resolvedAt }),
    );
    const detail = (await t.service.getTicketDetail(9, MEO))!;
    expect(detail.ticket.disputed_current).toBe(shown);
  });

  it('reads the staff timeline columns and the latest referral next to a return', async () => {
    const t = build(detailResponder({}));
    await t.service.getTicketDetail(9, MEO);
    const history = t.calls.find((c) =>
      c.text.includes('FROM status_history sh'),
    )!;
    for (const column of [
      'sh.from_status',
      'sh.reason',
      'sh.resolution_outcome',
      'sh.resolution_notes',
      'latest_referral_agency',
    ]) {
      expect(history.text).toContain(column);
    }
    expect(history.text).toContain("ra.action_type = 'REFER'");
    expect(history.text).toContain(
      "sh.from_status = 'Resolved' AND sh.status = 'Under Review'",
    );
  });
});
