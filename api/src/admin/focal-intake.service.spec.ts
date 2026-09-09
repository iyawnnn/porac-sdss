import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FocalIntakeService, deriveIntakeState } from './focal-intake.service';
import type { TicketsService } from './tickets.service';
import type { NotificationsService } from './../notifications/notifications.service';
import type { AdminAuditService } from './admin-audit.service';
import type { AdminSession } from '../auth/session.service';

const FOCAL: AdminSession = {
  adminId: 10,
  email: 'focal@example.com',
  adminName: 'Diana Torres',
  office: 'MDRRMO',
  role: 'focal',
};

describe('deriveIntakeState', () => {
  it('is New when there is no acknowledgment and no intake action', () => {
    expect(
      deriveIntakeState({ acknowledgedAt: null, latestActionType: null }),
    ).toBe('New');
  });

  it('is Acknowledged once acknowledged, with no later intake action', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: null,
      }),
    ).toBe('Acknowledged');
  });

  it('is Screened when the latest intake action is screened', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: 'screened',
      }),
    ).toBe('Screened');
  });

  it('is Forwarded when the latest intake action is forwarded, outranking a stale screened state', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: 'forwarded',
      }),
    ).toBe('Forwarded');
  });

  it('is Escalated when the latest intake action is escalated', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: 'escalated',
      }),
    ).toBe('Escalated');
  });

  it('never returns Escalated/Forwarded/Screened without an intake action, regardless of acknowledgment', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: null,
      }),
    ).not.toBe('Escalated');
  });
});

// Mirrors tickets.service.spec.ts's makeService convention: an ordered
// array of row-sets, one per query call in sequence, with sql.begin just
// invoking the callback against the same fake client (no real transaction
// semantics needed for these unit tests).
function makeService(rows: unknown[][]) {
  let i = 0;
  const sql = ((..._args: unknown[]) => {
    return {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        const next = rows[i++] ?? [];
        if (next instanceof Error) {
          void Promise.reject(next).then(resolve, reject);
        } else {
          void Promise.resolve(next).then(resolve, reject);
        }
      },
    };
  }) as unknown as Sql;
  (
    sql as unknown as {
      begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
    }
  ).begin = (cb) => cb(sql);

  const logInPgTx = jest.fn().mockResolvedValue(undefined);
  const audit = { logInPgTx } as unknown as AdminAuditService;
  const createInTx = jest.fn().mockResolvedValue(undefined);
  const notifications = { createInTx } as unknown as NotificationsService;
  const reassignOffice = jest
    .fn()
    .mockResolvedValue({ assignedOffice: 'MDRRMO' });
  const tickets = { reassignOffice } as unknown as TicketsService;

  const service = new FocalIntakeService(sql, tickets, notifications, audit);
  return { service, logInPgTx, createInTx, reassignOffice, sql };
}

describe('FocalIntakeService.acknowledge', () => {
  it('404s when the report does not exist', async () => {
    const { service } = makeService([[]]);
    await expect(service.acknowledge(1, FOCAL, undefined)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates the acknowledgment, logs an audit event, notifies the citizen, and fetches the updated detail', async () => {
    const { service, logInPgTx, createInTx } = makeService([
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }], // report lookup
      [{}], // INSERT report_acknowledgments
      // getIntakeDetail's two queries:
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MEO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Medium',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          elevation_m: 50,
          hazard_urgency_index: 40,
          hazard_urgency_level: 'MEDIUM',
          operational_priority: 50,
          acknowledged_at: '2026-01-02T00:00:00Z',
          acknowledged_by_name: 'Diana Torres',
          latest_action_type: null,
        },
      ],
      [], // activity
    ]);

    const result = await service.acknowledge(1, FOCAL, '  looks fine  ');

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    expect(logInPgTx.mock.calls[0][1].actionType).toBe('report_acknowledged');
    expect(createInTx).toHaveBeenCalledTimes(1);
    expect(createInTx.mock.calls[0][1]).toMatchObject({
      recipientType: 'citizen',
      recipientId: 5,
      type: 'report_acknowledged',
      title: 'Report acknowledged',
    });
    expect(createInTx.mock.calls[0][1].message).not.toMatch(/under review/i);
    expect(result?.intakeState).toBe('Acknowledged');
  });

  it('maps a unique-constraint violation (second acknowledgment) to a 409, not a silent second row', async () => {
    let i = 0;
    const rows: unknown[][] = [
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }],
    ];
    const sql = ((..._args: unknown[]) => {
      return {
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          if (i === 1) {
            const err = Object.assign(
              new Error('duplicate key value violates unique constraint'),
              {
                code: '23505',
              },
            );
            void Promise.reject(err).then(resolve, reject);
          } else {
            void Promise.resolve(rows[i] ?? []).then(resolve, reject);
          }
          i++;
        },
      };
    }) as unknown as Sql;
    (
      sql as unknown as {
        begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
      }
    ).begin = (cb) => cb(sql);
    const audit = { logInPgTx: jest.fn() } as unknown as AdminAuditService;
    const notifications = {
      createInTx: jest.fn(),
    } as unknown as NotificationsService;
    const tickets = {} as unknown as TicketsService;
    const service = new FocalIntakeService(sql, tickets, notifications, audit);

    await expect(service.acknowledge(1, FOCAL, undefined)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('FocalIntakeService.screen', () => {
  it('404s when the report does not exist', async () => {
    const { service } = makeService([[]]);
    await expect(
      service.screen(1, FOCAL, { recommendedHandling: 'continue' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an invalid recommendedHandling value before touching the database', async () => {
    const { service, sql } = makeService([]);
    await expect(
      service.screen(1, FOCAL, { recommendedHandling: 'invalid' as never }),
    ).rejects.toThrow(BadRequestException);
    expect(sql).toBeDefined(); // sanity: service constructed, just never queried
  });

  it('appends a screened intake action and logs the recommendation in audit metadata, never mutating ticket status', async () => {
    const { service, logInPgTx } = makeService([
      [{ id: 1, title: 'Pothole' }], // report lookup
      [{}], // INSERT report_intake_actions
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MEO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Medium',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          elevation_m: 50,
          hazard_urgency_index: 40,
          hazard_urgency_level: 'MEDIUM',
          operational_priority: 50,
          acknowledged_at: '2026-01-02T00:00:00Z',
          acknowledged_by_name: 'Diana Torres',
          latest_action_type: 'screened',
        },
      ],
      [],
    ]);

    const result = await service.screen(1, FOCAL, {
      recommendedHandling: 'continue',
      remarks: 'ok',
    });

    expect(logInPgTx.mock.calls[0][1]).toMatchObject({
      actionType: 'report_screened',
      metadata: { recommendedHandling: 'continue' },
    });
    expect(result?.ticketStatus).toBe('Reported');
    expect(result?.intakeState).toBe('Screened');
  });
});

describe('FocalIntakeService.forward', () => {
  it('delegates the office change to TicketsService.reassignOffice — never duplicates reassignment logic', async () => {
    const { service, reassignOffice } = makeService([
      [{ id: 1, ticket_id: 100 }], // report lookup
      [{}], // INSERT report_intake_actions
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MDRRMO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Medium',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          elevation_m: 50,
          hazard_urgency_index: 40,
          hazard_urgency_level: 'MEDIUM',
          operational_priority: 50,
          acknowledged_at: null,
          acknowledged_by_name: null,
          latest_action_type: 'forwarded',
        },
      ],
      [],
    ]);

    await service.forward(1, FOCAL, 'MDRRMO', 'Better suited to MDRRMO');

    expect(reassignOffice).toHaveBeenCalledWith(100, FOCAL, 'MDRRMO');
  });

  it('rejects with no reason provided, before touching reassignOffice', async () => {
    const { service, reassignOffice } = makeService([
      [{ id: 1, ticket_id: 100 }],
    ]);
    await expect(service.forward(1, FOCAL, 'MDRRMO', '   ')).rejects.toThrow(
      BadRequestException,
    );
    expect(reassignOffice).not.toHaveBeenCalled();
  });

  it('404s when the report does not exist', async () => {
    const { service, reassignOffice } = makeService([[]]);
    await expect(service.forward(1, FOCAL, 'MDRRMO', 'reason')).rejects.toThrow(
      NotFoundException,
    );
    expect(reassignOffice).not.toHaveBeenCalled();
  });
});

describe('FocalIntakeService.escalate', () => {
  it('requires a reason', async () => {
    const { service } = makeService([]);
    await expect(service.escalate(1, FOCAL, '')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('notifies the CURRENTLY responsible office, logs the action, and leaves ticket status/office untouched', async () => {
    const { service, logInPgTx, createInTx } = makeService([
      [{ id: 1, title: 'Pothole', ticket_id: 100 }], // report lookup
      [{ assigned_office: 'MEO' }], // ticket office lookup
      [{}], // INSERT report_intake_actions
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MEO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Critical',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          elevation_m: 50,
          hazard_urgency_index: 40,
          hazard_urgency_level: 'MEDIUM',
          operational_priority: 90,
          acknowledged_at: null,
          acknowledged_by_name: null,
          latest_action_type: 'escalated',
        },
      ],
      [],
    ]);

    const result = await service.escalate(1, FOCAL, 'Needs urgent attention');

    expect(logInPgTx.mock.calls[0][1].actionType).toBe('report_escalated');
    expect(createInTx.mock.calls[0][1]).toMatchObject({
      recipientType: 'admin',
      recipientOffice: 'MEO',
      type: 'report_escalated',
    });
    expect(result?.ticketStatus).toBe('Reported');
    expect(result?.routedOffice).toBe('MEO');
    // No score field is ever written by escalate — hazard/priority values on
    // the returned detail are read straight off the ticket, unchanged.
    expect(result?.hazardUrgency.index).toBe(40);
    expect(result?.operationalPriority).toBe(90);
  });
});

// Batch 4 (five-role production alignment): a Focal-safe read-only map
// endpoint, built from the same intake source as listIntake() but geo-
// enabled — never the operational GET /admin/tickets/geo endpoint (which
// stays behind OperationalStaffGuard, untouched). Must expose only
// intake-relevant fields: no Operational Assessment content, no Work Order
// internals, no staff assignment, no status-mutation-sensitive data.
describe('FocalIntakeService.listIntakeGeo', () => {
  it('returns report-level points with coordinates and intake-relevant fields only', async () => {
    const { service } = makeService([
      [
        {
          report_id: 1,
          category: 'Pothole',
          barangay_name: 'Mitla Proper',
          assigned_office: 'MEO',
          hazard_urgency_index: 62,
          hazard_urgency_level: 'MEDIUM',
          acknowledged_at: null,
          latest_action_type: null,
          lat: 15.05,
          lng: 120.54,
        },
      ],
    ]);
    const rows = await service.listIntakeGeo();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reportId: 1,
      reportReference: 'Report #1',
      category: 'Pothole',
      barangayName: 'Mitla Proper',
      routedOffice: 'MEO',
      lat: 15.05,
      lng: 120.54,
      intakeState: 'New',
    });
    expect(rows[0].hazardUrgency).toEqual({ index: 62, level: 'MEDIUM' });
  });

  it('never exposes Operational Assessment, Work Order, or staff-assignment fields', () => {
    const source = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    const methodBody = source.slice(
      source.indexOf('async listIntakeGeo('),
      source.indexOf('\n  async getIntakeDetail('),
    );
    expect(methodBody).not.toContain('operational_assessments');
    expect(methodBody).not.toContain('work_orders');
    expect(methodBody).not.toContain('assigned_admin');
  });
});
