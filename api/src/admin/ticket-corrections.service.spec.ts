import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Sql, TransactionSql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import { ROUTING_ADMIN_NAME_MAX_LENGTH } from '../db/schema';
import type { BarangayService } from '../domain/barangay.service';
import type { MediaService } from '../domain/media.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type { HazardInformationService } from '../domain/hazard-information.service';
import { RainfallContextService } from '../domain/rainfall-context.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminAuditService,
  LogAdminAuditInput,
} from './admin-audit.service';
import { TicketCorrectionsService } from './ticket-corrections.service';
import { TicketsService } from './tickets.service';

// Manuscript revision Phase 3, step 3e. The fake SQL answers each query by
// its text and records every call, so these tests pin what the correction
// transaction writes (and never writes), including the Reassign it runs
// through the real TicketsService code path. The same service ran against
// PostGIS (PGlite) outside the repo with real rows and polygons.

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
  lat: number;
  lng: number;
  barangay_name: string;
}

interface Call {
  text: string;
  values: unknown[];
  inTx: boolean;
}

function pothole(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 7,
    status: 'Reported',
    assigned_office: 'MEO',
    category: 'Pothole / Road Surface Damage',
    merged_into_ticket_id: null,
    lat: 15.07,
    lng: 120.52,
    barangay_name: 'Pio',
    ...overrides,
  };
}

function setup(options: {
  ticket?: TicketRow | null;
  activeWorkOrders?: number;
  distanceM?: number;
  barangay?: { id: number; name: string } | null;
  // A real RainfallContextService instead of the recording stub.
  rainfall?: RainfallContextService;
}) {
  const calls: Call[] = [];
  const answer = (text: string): unknown[] => {
    if (text.includes('FROM tickets t') && text.includes('JOIN barangays b')) {
      return options.ticket === null ? [] : [options.ticket ?? pothole()];
    }
    if (text.includes('FROM work_orders')) {
      return [{ active: options.activeWorkOrders ?? 0 }];
    }
    if (text.includes('ST_Distance(')) {
      return [{ distance_m: options.distanceM ?? 120.4 }];
    }
    return [];
  };
  const tag = (inTx: boolean) =>
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      calls.push({ text, values, inTx });
      return Promise.resolve(answer(text));
    });
  const begin = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const result = await fn(tag(true));
    committed = true;
    return result;
  });
  const sql = Object.assign(tag(false), { begin }) as unknown as Sql;

  const logInPgTx = jest.fn<
    Promise<void>,
    [TransactionSql, LogAdminAuditInput]
  >(() => Promise.resolve());
  const audit = { logInPgTx } as unknown as AdminAuditService;
  const recalculateActiveTickets = jest.fn(() =>
    Promise.resolve({ updated: 0 }),
  );
  // Manuscript revision Phase 4, step 4a: recorded in order with the SQL.
  const recalculateTickets = jest.fn((tx: unknown, ids: number[]) => {
    calls.push({ text: 'RECALCULATE TICKETS', values: ids, inTx: tx !== sql });
    return Promise.resolve({ updated: ids.length });
  });
  // Manuscript revision Phase 4, step 4b: recorded in order with the SQL,
  // and whether the transaction had committed (begin had returned).
  let committed = false;
  const hazardTrigger = jest.fn((ticketId: number) => {
    calls.push({
      text: 'HAZARD TRIGGER',
      values: [ticketId, committed],
      inTx: false,
    });
  });
  // Manuscript revision Phase 4, step 4c: the same for rainfall context.
  const rainfallTrigger = jest.fn((ticketId: number) => {
    calls.push({
      text: 'RAINFALL TRIGGER',
      values: [ticketId, committed],
      inTx: false,
    });
  });
  const findContainingBarangay = jest.fn(() =>
    Promise.resolve(
      options.barangay === undefined
        ? { id: 2, name: 'Poblacion' }
        : options.barangay,
    ),
  );
  // The real TicketsService, so the office-changing case runs Reassign's
  // own preconditions and writes.
  const tickets = new TicketsService(
    sql,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    audit,
  );
  const service = new TicketCorrectionsService(
    sql,
    tickets,
    { findContainingBarangay } as unknown as BarangayService,
    {
      recalculateActiveTickets,
      recalculateTickets,
    } as unknown as OperationalPriorityService,
    audit,
    { trigger: hazardTrigger } as unknown as HazardInformationService,
    options.rainfall ??
      ({
        triggerForCorrection: rainfallTrigger,
      } as unknown as RainfallContextService),
  );
  const writes = () =>
    calls.filter((c) => /^\s*(UPDATE|INSERT|DELETE)/.test(c.text));
  const auditInputs = () => logInPgTx.mock.calls.map((c) => c[1]);
  return {
    service,
    calls,
    writes,
    auditInputs,
    recalculateActiveTickets,
    recalculateTickets,
    findContainingBarangay,
    hazardTrigger,
    rainfallTrigger,
  };
}

describe('TicketCorrectionsService.correctCategory', () => {
  it('within the office: updates the category, clears the review flag, records one event, no Reassign', async () => {
    const t = setup({ activeWorkOrders: 2 });
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Uneven Sidewalk', reason: '  Sidewalk, not road.  ' },
        MEO,
      ),
    ).resolves.toEqual({
      ticketId: 7,
      category: 'Uneven Sidewalk',
      assignedOffice: 'MEO',
      officeChanged: false,
    });
    const writes = t.writes();
    expect(writes).toHaveLength(1);
    expect(writes[0].text).toMatch(
      /UPDATE tickets SET category = \?, category_review_required = false, updated_at = now\(\)/,
    );
    expect(writes[0].values).toEqual(['Uneven Sidewalk', 7]);
    expect(t.auditInputs()).toEqual([
      {
        actor: {
          adminId: 1,
          adminName: 'Meo Staff',
          email: 'meo@example.com',
          accountType: 'PERSONNEL',
          office: 'MEO',
        },
        actionType: 'ticket_category_corrected',
        targetType: 'ticket',
        targetId: 7,
        targetSummary: 'Ticket #7 (Uneven Sidewalk)',
        metadata: {
          field: 'category',
          oldValue: 'Pothole / Road Surface Damage',
          newValue: 'Uneven Sidewalk',
          reason: 'Sidewalk, not road.',
          officeChanged: false,
          fromOffice: 'MEO',
          toOffice: 'MEO',
        },
      },
    ]);
    // A category correction changes no membership, so no severity either.
    expect(t.recalculateActiveTickets).not.toHaveBeenCalled();
    expect(t.recalculateTickets).not.toHaveBeenCalled();
  });

  it('to the other office: reassigns in the same transaction, with the reason on the routing row', async () => {
    const t = setup({ activeWorkOrders: 0 });
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Localized Flooding', reason: 'Standing water.' },
        MEO,
      ),
    ).resolves.toMatchObject({ assignedOffice: 'MDRRMO', officeChanged: true });

    const writes = t.writes();
    expect(writes.every((w) => w.inTx)).toBe(true);
    expect(
      writes.map((w) => w.text.trim().split(/\s+/).slice(0, 3).join(' ')),
    ).toEqual([
      'UPDATE tickets SET',
      'UPDATE tickets SET',
      'INSERT INTO office_reassignments',
      'INSERT INTO routing_actions',
    ]);
    expect(writes[1].values).toEqual(['MDRRMO', 7]);
    expect(writes[2].values).toEqual([7, 'MEO', 'MDRRMO', 1, 'Meo Staff']);
    expect(writes[3].text).toContain("'REASSIGN'");
    expect(writes[3].values).toEqual([
      7,
      'MEO',
      'MDRRMO',
      'Standing water.',
      1,
      'Meo Staff',
      ROUTING_ADMIN_NAME_MAX_LENGTH,
    ]);
    const [corrected, reassigned] = t.auditInputs();
    expect(corrected.metadata).toEqual({
      field: 'category',
      oldValue: 'Pothole / Road Surface Damage',
      newValue: 'Localized Flooding',
      reason: 'Standing water.',
      officeChanged: true,
      fromOffice: 'MEO',
      toOffice: 'MDRRMO',
    });
    expect(reassigned).toMatchObject({
      actionType: 'ticket_reassigned',
      targetId: 7,
      metadata: { from: 'MEO', to: 'MDRRMO', reason: 'Standing water.' },
    });
  });

  it('to the other office with a pending or in-progress Work Order: 409, nothing written', async () => {
    const t = setup({ activeWorkOrders: 1 });
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Localized Flooding', reason: 'x' },
        MEO,
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Ticket #7 has an active Work Order, and the new category belongs to the other office. Finish or cancel the Work Orders first.',
      ),
    );
    expect(t.writes()).toEqual([]);
    expect(t.auditInputs()).toEqual([]);
  });

  it('counts only pending and in-progress Work Orders (completed and cancelled stay history)', async () => {
    const t = setup({});
    await t.service.correctCategory(
      7,
      { category: 'Localized Flooding', reason: 'x' },
      MEO,
    );
    const count = t.calls.find((c) => c.text.includes('FROM work_orders'))!;
    expect(count.text).toContain("status IN ('pending', 'in_progress')");
    expect(count.inTx).toBe(true);
  });

  it('locks the ticket row for the transaction', async () => {
    const t = setup({});
    await t.service.correctCategory(
      7,
      { category: 'Uneven Sidewalk', reason: 'x' },
      MEO,
    );
    const lock = t.calls.find((c) => c.text.includes('FOR UPDATE OF t'));
    expect(lock?.inTx).toBe(true);
    expect(t.calls.indexOf(lock!)).toBe(0);
  });

  it("never writes the report's submitted category", async () => {
    const t = setup({});
    await t.service.correctCategory(
      7,
      { category: 'Localized Flooding', reason: 'x' },
      MEO,
    );
    expect(
      t.calls.some((c) => /UPDATE reports|submitted_category/.test(c.text)),
    ).toBe(false);
  });

  it('validates before touching the database', async () => {
    const t = setup({});
    await expect(
      t.service.correctCategory(7, { category: 'Flooding', reason: 'x' }, MEO),
    ).rejects.toThrow(
      new BadRequestException('Choose one of the current categories.'),
    );
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Uneven Sidewalk', reason: ' ' },
        MEO,
      ),
    ).rejects.toThrow(new BadRequestException('A reason is required.'));
    expect(t.calls).toEqual([]);
  });

  it.each([
    [
      'a merged-away ticket',
      pothole({ merged_into_ticket_id: 3 }),
      MEO,
      ConflictException,
    ],
    [
      'a Resolved ticket',
      pothole({ status: 'Resolved' }),
      MEO,
      ConflictException,
    ],
    [
      'another office',
      pothole({ assigned_office: 'MDRRMO' }),
      MEO,
      ForbiddenException,
    ],
    [
      'Focal past Reported',
      pothole({ status: 'Under Review' }),
      FOCAL,
      ForbiddenException,
    ],
    ['the System Administrator', pothole(), SYSTEM_ADMIN, ForbiddenException],
  ] as const)(
    'refuses %s and writes nothing',
    async (_label, ticket, admin, error) => {
      const t = setup({ ticket });
      await expect(
        t.service.correctCategory(
          7,
          { category: 'Uneven Sidewalk', reason: 'x' },
          admin,
        ),
      ).rejects.toThrow(error);
      expect(t.writes()).toEqual([]);
    },
  );

  it("lets Focal correct a Reported ticket of another office, reassigning through Focal's routing rule", async () => {
    const t = setup({
      ticket: pothole({
        assigned_office: 'MDRRMO',
        category: 'Localized Flooding',
      }),
    });
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Streetlight Out', reason: 'x' },
        FOCAL,
      ),
    ).resolves.toMatchObject({ assignedOffice: 'MEO', officeChanged: true });
  });

  it('404s an unknown ticket', async () => {
    const t = setup({ ticket: null });
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Uneven Sidewalk', reason: 'x' },
        MEO,
      ),
    ).rejects.toThrow(new NotFoundException('Ticket #7 not found.'));
  });
});

// Manuscript revision Phase 4, step 4b. The lookup itself (superseding,
// a category without a lookup inserting nothing) is pinned in
// hazard-information.service.spec.ts.
describe('TicketCorrectionsService.correctCategory and Hazard Information', () => {
  it('re-evaluates Hazard Information once, after the commit', async () => {
    const t = setup({});
    await t.service.correctCategory(
      7,
      { category: 'Localized Flooding', reason: 'Standing water.' },
      MEO,
    );
    expect(t.hazardTrigger).toHaveBeenCalledTimes(1);
    const trigger = t.calls.find((c) => c.text === 'HAZARD TRIGGER');
    expect(trigger?.values).toEqual([7, true]);
  });

  it('re-evaluates for a category without a lookup too (the service only supersedes)', async () => {
    const t = setup({
      ticket: pothole({
        category: 'Localized Flooding',
        assigned_office: 'MDRRMO',
      }),
    });
    await t.service.correctCategory(
      7,
      { category: 'Lahar or Volcanic Debris-Flow Threat', reason: 'Lahar.' },
      { ...MEO, office: 'MDRRMO' },
    );
    expect(t.hazardTrigger).toHaveBeenCalledWith(7);
  });

  it('does not re-evaluate when the correction is refused', async () => {
    const t = setup({ activeWorkOrders: 1 });
    await expect(
      t.service.correctCategory(
        7,
        { category: 'Localized Flooding', reason: 'Standing water.' },
        MEO,
      ),
    ).rejects.toThrow(ConflictException);
    expect(t.hazardTrigger).not.toHaveBeenCalled();
  });
});

// Manuscript revision Phase 4, step 4c. The refresh itself (superseding, a
// category without rainfall context inserting nothing) is pinned in
// rainfall-context.service.spec.ts.
describe('TicketCorrectionsService and rainfall context', () => {
  const locationBody = {
    lat: 15.0712,
    lng: 120.5703,
    reason: 'Pin on the wrong side.',
  };

  it('a category correction re-evaluates rainfall context once, after the commit', async () => {
    const t = setup({});
    await t.service.correctCategory(
      7,
      { category: 'Localized Flooding', reason: 'Standing water.' },
      MEO,
    );
    expect(t.rainfallTrigger).toHaveBeenCalledTimes(1);
    const trigger = t.calls.find((c) => c.text === 'RAINFALL TRIGGER');
    expect(trigger?.values).toEqual([7, true]);
  });

  it('a category correction to one without rainfall context still triggers (the service only supersedes)', async () => {
    const t = setup({
      ticket: pothole({
        category: 'Localized Flooding',
        assigned_office: 'MDRRMO',
      }),
    });
    await t.service.correctCategory(
      7,
      { category: 'Lahar or Volcanic Debris-Flow Threat', reason: 'Lahar.' },
      { ...MEO, office: 'MDRRMO' },
    );
    expect(t.rainfallTrigger).toHaveBeenCalledWith(7);
  });

  it('a location correction re-evaluates once, after the commit, without awaiting it', async () => {
    const t = setup({});
    await t.service.correctLocation(7, locationBody, MEO);
    expect(t.rainfallTrigger).toHaveBeenCalledTimes(1);
    const trigger = t.calls.findIndex((c) => c.text === 'RAINFALL TRIGGER');
    expect(t.calls[trigger].values).toEqual([7, true]);
    expect(t.calls.slice(trigger + 1).some((c) => c.inTx)).toBe(false);
  });

  it('a refused correction triggers nothing', async () => {
    const category = setup({ activeWorkOrders: 1 });
    await expect(
      category.service.correctCategory(
        7,
        { category: 'Localized Flooding', reason: 'Standing water.' },
        MEO,
      ),
    ).rejects.toThrow(ConflictException);
    expect(category.rainfallTrigger).not.toHaveBeenCalled();
    const location = setup({ distanceM: 0.4 });
    await expect(
      location.service.correctLocation(7, locationBody, MEO),
    ).rejects.toThrow(BadRequestException);
    expect(location.rainfallTrigger).not.toHaveBeenCalled();
  });

  // The real service behind both corrections, with the weather call
  // hanging or failing: the correction still succeeds at once.
  describe('with the weather call hanging or failing', () => {
    let fetchMock: jest.SpyInstance;
    const realRainfall = () => {
      const facts = {
        category: 'Localized Flooding',
        status: 'Reported',
        merged_into_ticket_id: null,
      };
      const writes: string[] = [];
      const tag = jest.fn((strings: TemplateStringsArray) => {
        const text = strings.join('?');
        if (/^\s*(UPDATE|INSERT)/.test(text)) writes.push(text);
        if (text.includes('ST_Y(geom)')) {
          return Promise.resolve([{ ...facts, lat: 15.08, lng: 120.54 }]);
        }
        if (text.includes('FOR UPDATE')) {
          return Promise.resolve([{ ...facts, same_location: true }]);
        }
        return Promise.resolve(Object.assign([], { count: 0 }));
      });
      const sql = Object.assign(tag, {
        begin: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn(tag),
        ),
      }) as unknown as Sql;
      const config = {
        get: (key: string) =>
          key === 'OPENWEATHERMAP_API_KEY' ? 'test-key' : 'enabled',
      } as unknown as ConfigService<Env, true>;
      return { service: new RainfallContextService(sql, config), writes };
    };
    let warn: jest.SpyInstance;
    beforeEach(() => {
      fetchMock = jest.spyOn(global, 'fetch');
      // The failure is logged as a warning; keep the test output quiet.
      warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });
    afterEach(() => {
      fetchMock.mockRestore();
      warn.mockRestore();
    });

    it('hanging: both corrections resolve while the call is still pending', async () => {
      fetchMock.mockImplementation(() => new Promise(() => undefined));
      const rainfall = realRainfall();
      const t = setup({ rainfall: rainfall.service });
      await expect(
        t.service.correctLocation(7, locationBody, MEO),
      ).resolves.toMatchObject({ ticketId: 7 });
      await expect(
        setup({ rainfall: rainfall.service }).service.correctCategory(
          7,
          { category: 'Localized Flooding', reason: 'Standing water.' },
          MEO,
        ),
      ).resolves.toMatchObject({ ticketId: 7 });
      await new Promise((resolve) => setImmediate(resolve));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(rainfall.writes).toEqual([]);
    });

    it('failing: the correction resolves, and rainfall is recorded as UNAVAILABLE afterwards', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      const rainfall = realRainfall();
      const t = setup({ rainfall: rainfall.service });
      await expect(
        t.service.correctLocation(7, locationBody, MEO),
      ).resolves.toMatchObject({ ticketId: 7 });
      await new Promise((resolve) => setImmediate(resolve));
      expect(rainfall.writes.some((w) => /'UNAVAILABLE'/.test(w))).toBe(true);
    });
  });
});

describe('TicketCorrectionsService.correctLocation', () => {
  const body = {
    lat: 15.0712,
    lng: 120.5703,
    reason: 'Pin on the wrong side.',
  };

  it('moves the ticket and its barangay, records one event, then recalculates Operational Priority', async () => {
    const t = setup({ distanceM: 5376.4 });
    await expect(t.service.correctLocation(7, body, MEO)).resolves.toEqual({
      ticketId: 7,
      lat: 15.0712,
      lng: 120.5703,
      barangayName: 'Poblacion',
      distanceM: 5376,
    });
    expect(t.findContainingBarangay).toHaveBeenCalledWith(15.0712, 120.5703);
    const writes = t.writes();
    expect(writes).toHaveLength(1);
    expect(writes[0].text).toMatch(
      /UPDATE tickets SET\s+geom = ST_SetSRID\(ST_MakePoint\(\?, \?\), 4326\),\s+barangay_id = \?/,
    );
    expect(writes[0].values).toEqual([120.5703, 15.0712, 2, 7]);
    expect(
      t.calls.some((c) => /UPDATE reports|pin_geom|exif_geom/.test(c.text)),
    ).toBe(false);
    expect(t.auditInputs()).toEqual([
      expect.objectContaining({
        actionType: 'ticket_location_corrected',
        targetType: 'ticket',
        targetId: 7,
        metadata: {
          field: 'location',
          oldLat: 15.07,
          oldLng: 120.52,
          oldBarangay: 'Pio',
          newLat: 15.0712,
          newLng: 120.5703,
          newBarangay: 'Poblacion',
          distanceM: 5376,
          reason: 'Pin on the wrong side.',
        },
      }),
    ]);
    expect(t.recalculateActiveTickets).toHaveBeenCalledTimes(1);
  });

  // Manuscript revision Phase 4, step 4a.
  it('recalculates the ticket in the transaction, after the location write, and every ticket after the commit', async () => {
    const t = setup({});
    await t.service.correctLocation(7, body, MEO);
    const update = t.calls.findIndex((c) =>
      /UPDATE tickets SET\s+geom =/.test(c.text),
    );
    const recalc = t.calls.findIndex((c) => c.text === 'RECALCULATE TICKETS');
    expect(t.recalculateTickets).toHaveBeenCalledTimes(1);
    expect(t.calls[recalc]).toEqual({
      text: 'RECALCULATE TICKETS',
      values: [7],
      inTx: true,
    });
    expect(update).toBeGreaterThan(-1);
    expect(update).toBeLessThan(recalc);
    expect(t.recalculateActiveTickets).toHaveBeenCalledTimes(1);
  });

  // Manuscript revision Phase 4, step 4b.
  it('re-evaluates Hazard Information once, after the commit, without awaiting it', async () => {
    const t = setup({});
    await t.service.correctLocation(7, body, MEO);
    expect(t.hazardTrigger).toHaveBeenCalledTimes(1);
    const trigger = t.calls.findIndex((c) => c.text === 'HAZARD TRIGGER');
    expect(t.calls[trigger].values).toEqual([7, true]);
    expect(t.calls.slice(trigger + 1).some((c) => c.inTx)).toBe(false);
  });

  it('does not re-evaluate Hazard Information when the correction is refused', async () => {
    const t = setup({ distanceM: 0.4 });
    await expect(t.service.correctLocation(7, body, MEO)).rejects.toThrow(
      BadRequestException,
    );
    expect(t.hazardTrigger).not.toHaveBeenCalled();
  });

  it('rejects a point outside every Porac barangay polygon (no boundary fallback), before the transaction', async () => {
    const t = setup({ barangay: null });
    await expect(t.service.correctLocation(7, body, MEO)).rejects.toThrow(
      new BadRequestException('Location must be inside Porac.'),
    );
    expect(t.calls).toEqual([]);
    expect(t.recalculateActiveTickets).not.toHaveBeenCalled();
  });

  it('rejects the same location (400)', async () => {
    const t = setup({ distanceM: 0.4 });
    await expect(t.service.correctLocation(7, body, MEO)).rejects.toThrow(
      new BadRequestException(
        'The new location is the same as the current one.',
      ),
    );
    expect(t.writes()).toEqual([]);
  });

  it('applies who-may-correct and the active, not-merged rule', async () => {
    const closed = setup({ ticket: pothole({ status: 'Rejected' }) });
    await expect(closed.service.correctLocation(7, body, MEO)).rejects.toThrow(
      ConflictException,
    );
    const focal = setup({ ticket: pothole({ status: 'In Progress' }) });
    await expect(focal.service.correctLocation(7, body, FOCAL)).rejects.toThrow(
      ForbiddenException,
    );
    const focalWo = setup({ activeWorkOrders: 1 });
    await expect(
      focalWo.service.correctLocation(7, body, FOCAL),
    ).rejects.toThrow(ForbiddenException);
    const ok = setup({});
    await expect(
      ok.service.correctLocation(7, body, FOCAL),
    ).resolves.toMatchObject({ ticketId: 7 });
  });

  it('rejects a missing reason or point before any lookup', async () => {
    const t = setup({});
    await expect(
      t.service.correctLocation(7, { ...body, reason: '' }, MEO),
    ).rejects.toThrow(new BadRequestException('A reason is required.'));
    await expect(
      t.service.correctLocation(7, { ...body, lat: 'x' }, MEO),
    ).rejects.toThrow(new BadRequestException('Choose a point on the map.'));
    expect(t.findContainingBarangay).not.toHaveBeenCalled();
  });
});

describe('TicketCorrectionsService.availability', () => {
  it("tells the buttons what is blocked, and lists each current category's office", async () => {
    const t = setup({ activeWorkOrders: 1 });
    const result = await t.service.availability(7, MEO);
    expect(result).toMatchObject({
      ticketId: 7,
      category: 'Pothole / Road Surface Damage',
      assignedOffice: 'MEO',
      blocked: null,
      officeChangeBlocked:
        'Ticket #7 has an active Work Order, and the new category belongs to the other office. Finish or cancel the Work Orders first.',
    });
    expect(result?.categories).toHaveLength(13);
    expect(result?.categories).toContainEqual({
      category: 'Localized Flooding',
      office: 'MDRRMO',
    });
  });

  it("gives Focal the reason it can't correct", async () => {
    const t = setup({ ticket: pothole({ status: 'Under Review' }) });
    expect((await t.service.availability(7, FOCAL))?.blocked).toBe(
      'Focal Personnel can only correct a ticket while it is still Reported; Ticket #7 is Under Review.',
    );
  });

  it("refuses operational Personnel another office's ticket (403), like Ticket Detail", async () => {
    const t = setup({ ticket: pothole({ assigned_office: 'MDRRMO' }) });
    await expect(t.service.availability(7, MEO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns null for an unknown ticket (404 in the controller)', async () => {
    const t = setup({ ticket: null });
    await expect(t.service.availability(7, MEO)).resolves.toBeNull();
  });
});

// Everything that lists, maps, suggests or exports tickets keeps using the
// ticket's current category and location; the report's originals are read
// only where they are shown as the citizen's (Ticket Detail, Focal Intake
// detail, the citizen's own report page) and written only at submission.
describe("the report's original category and pin stay out of ticket lists, maps and exports", () => {
  const read = (...p: string[]) =>
    readFileSync(join(__dirname, '..', ...p), 'utf8');
  const between = (source: string, start: string, end: string) =>
    source.slice(
      source.indexOf(start),
      source.indexOf(end, source.indexOf(start) + 1),
    );
  const ORIGINALS = /submitted_category|pin_geom|exif_geom|r\.geom/;

  it.each([
    [
      'the Ticket Queue',
      'admin/tickets.service.ts',
      'async getTicketsForAdmin(',
      'async getViewCounts(',
    ],
    [
      'the tickets CSV',
      'admin/tickets.service.ts',
      'async getTicketsForExport(',
      'async getTicketsGeo(',
    ],
    [
      'the admin map',
      'admin/tickets.service.ts',
      'async getTicketsGeo(',
      'async getTicketDetail(',
    ],
    [
      'the public map',
      'reports/reports.service.ts',
      'async getPublicHazardMapData(',
      'return {',
    ],
  ])('%s', (_label, file, start, end) => {
    const body = between(read(...file.split('/')), start, end);
    expect(body).toMatch(/t\.category/);
    expect(body).not.toMatch(ORIGINALS);
  });

  it.each([
    'admin/related-tickets.service.ts',
    'admin/dashboard.service.ts',
    'admin/barangay-insights.service.ts',
    'domain/operational-priority.service.ts',
  ])('%s', (file) => {
    expect(read(...file.split('/'))).not.toMatch(ORIGINALS);
  });
});
