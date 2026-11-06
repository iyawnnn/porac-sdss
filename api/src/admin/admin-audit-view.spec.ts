import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from '../contracts/admin-audit';
import {
  AUDIT_DETAIL_ALLOWLIST,
  auditDetails,
  auditItem,
  type AuditStoredRow,
} from './admin-audit-view';
import { AdminAuditService, auditDateBounds } from './admin-audit.service';
import { AdminAuditController } from './admin-audit.controller';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { ALL_CATEGORIES } from '../contracts/schemas';

const sensitive = [
  'SECRET_REASON',
  'SECRET_REMARKS',
  'SECRET_TITLE',
  'citizen@secret.test',
  '15.123456',
  '120.123456',
  '987654321',
  'SECRET_CANCELLATION',
  'SECRET_DESCRIPTION',
];
const row: AuditStoredRow & { target_summary: string; actor_email: string } = {
  id: 1,
  created_at: '2026-11-05T15:59:00.000Z',
  action_type: 'admin_role_updated',
  target_type: 'ticket',
  target_id: 123,
  actor_admin_id: 8,
  actor_name: 'Recorded Staff',
  actor_role: 'officer',
  actor_account_type: 'PERSONNEL',
  actor_is_focal: false,
  actor_office: 'MEO',
  actor_email: sensitive[3],
  target_summary: sensitive.join(' '),
  metadata: {
    reason: sensitive[0],
    remarks: sensitive[1],
    title: sensitive[2],
    email: sensitive[3],
    lat: sensitive[4],
    lng: sensitive[5],
    assignedAdminId: 987654321,
    cancellationReason: sensitive[7],
    description: sensitive[8],
    from: { accountType: 'PERSONNEL', office: 'MEO', isFocal: false },
    to: { accountType: 'PERSONNEL', office: 'MDRRMO', isFocal: true },
    sessionsEnded: true,
  },
};

describe('audit response privacy boundary', () => {
  it.each(AUDIT_ACTIONS)(
    '%s returns exactly the safe shape without any sensitive string',
    (action) => {
      const item = auditItem({ ...row, action_type: action });
      expect(Object.keys(item).sort()).toEqual([
        'action',
        'actor',
        'created_at',
        'details',
        'id',
        'target_id',
        'target_label',
        'target_type',
      ]);
      expect(Object.keys(item.actor).sort()).toEqual([
        'account_type',
        'display_label',
        'id',
        'is_focal',
        'name',
      ]);
      expect(item.created_at).toBe('2026-11-05T15:59:00.000Z');
      expect(item.target_label).toBe('Ticket #123');
      const json = JSON.stringify(item);
      for (const value of sensitive) expect(json).not.toContain(value);
      for (const value of Object.values(item.details))
        expect(
          value === null ||
            ['string', 'number', 'boolean'].includes(typeof value),
        ).toBe(true);
    },
  );

  it('strictly pins the complete allow-list', () => {
    expect(AUDIT_DETAIL_ALLOWLIST).toMatchSnapshot();
    expect(Object.keys(AUDIT_DETAIL_ALLOWLIST).sort()).toEqual(
      [...AUDIT_ACTIONS].sort(),
    );
  });

  it('keeps only structured values, flattened account changes and safe counts', () => {
    expect(auditItem(row).details).toEqual({
      from_accountType: 'PERSONNEL',
      to_accountType: 'PERSONNEL',
      from_office: 'MEO',
      to_office: 'MDRRMO',
      from_isFocal: false,
      to_isFocal: true,
      sessionsEnded: true,
    });
    expect(
      auditDetails('ticket_merged', {
        movedReportIds: [1, 2],
        reason: 'secret',
      }),
    ).toEqual({ moved_reports_count: 2 });
    expect(
      auditDetails('ticket_merged', { movedReportIds: ['secret'] }),
    ).toEqual({});
    expect(
      auditDetails('ticket_status_advanced', {
        from: 'Reported',
        to: 'Resolved',
        outcome: 'EXTERNAL_REFERRAL',
      }),
    ).toEqual({
      from: 'Reported',
      to: 'Resolved',
      outcome: 'EXTERNAL_REFERRAL',
    });
    expect(
      auditDetails('ticket_category_corrected', {
        oldValue: 'Localized Flooding',
        newValue: 'Uneven Sidewalk',
      }),
    ).toEqual({ oldValue: 'LOCALIZED_FLOODING', newValue: 'UNEVEN_SIDEWALK' });
    expect(
      auditDetails('ticket_reassigned', {
        from: 'SECRET_REASON',
        to: { office: 'MEO' },
        unknown: 'MEO',
      }),
    ).toEqual({});
    expect(auditDetails('unknown', row.metadata)).toEqual({});
    expect(auditDetails('__proto__', row.metadata)).toEqual({});
    expect(
      auditDetails('admin_created', {
        accountType: 'A'.repeat(100),
        office: 'citizen@secret.test',
        isFocal: 'true',
      }),
    ).toEqual({});
  });

  it('uses live staff names without falling back to a stored summary or email', () => {
    expect(
      auditItem({ ...row, target_type: 'admin', target_name: 'Live Staff' })
        .target_label,
    ).toBe('Live Staff');
    expect(auditItem({ ...row, target_type: 'admin' }).target_label).toBe(
      'Staff — name not recorded',
    );
  });

  it('maps every current and legacy category to a short code without admitting arbitrary text', () => {
    for (const category of ALL_CATEGORIES) {
      expect(
        auditDetails('ticket_category_corrected', { oldValue: category })
          .oldValue,
      ).toMatch(/^[A-Z][A-Z_]{0,39}$/);
    }
    expect(
      auditItem({ ...row, action_type: 'reason: PRIVATE EMAIL@TEST' }).action,
    ).toBe('unknown');
  });

  it.each([
    [true, 'officer', 'MDRRMO', 'PERSONNEL', 'Focal Personnel'],
    [false, 'focal', 'MDRRMO', 'PERSONNEL', 'MDRRMO Personnel'],
    [null, 'focal', null, 'PERSONNEL', 'Focal Personnel'],
    [false, 'system_admin', null, 'SYSTEM_ADMIN', 'System Administrator/MIS'],
    [null, 'system_admin', null, 'SYSTEM_ADMIN', 'System Administrator/MIS'],
    [null, 'officer', 'MEO', 'PERSONNEL', 'MEO Personnel'],
    [null, 'supervisor', 'MDRRMO', 'PERSONNEL', 'MDRRMO Personnel'],
    [null, 'officer', null, 'PERSONNEL', 'Personnel — office not recorded'],
  ] as const)(
    'recorded Focal=%s role=%s office=%s account=%s gives %s',
    (focal, role, office, account, label) => {
      expect(
        auditItem({
          ...row,
          actor_is_focal: focal,
          actor_role: role,
          actor_office: office,
          actor_account_type: account,
        }).actor.display_label,
      ).toBe(label);
    },
  );
});

describe('audit filters and unchanged authorization', () => {
  const service = new AdminAuditService({} as PostgresJsDatabase);
  it('uses Manila calendar boundaries, including the final day at microsecond precision', () => {
    expect(auditDateBounds('2026-11-05', '2026-11-05')).toEqual({
      from: '2026-11-04T16:00:00.000Z',
      until: '2026-11-05T16:00:00.000Z',
    });
    const day5 = auditDateBounds('2026-11-05', '2026-11-05');
    expect('2026-11-05T15:59:00.000Z' < day5.until!).toBe(true);
    expect('2026-11-05T16:00:00.000Z' < day5.until!).toBe(false);
  });
  it.each([
    '2026-02-30',
    '2026-13-01',
    'nonsense',
    '2026-1-05',
    '2026-11-05T00:00:00Z',
  ])('rejects invalid calendar date %s with 400', (value) => {
    for (const key of ['from', 'to'])
      expect(() => service.parseFilters({ [key]: value })).toThrow(
        BadRequestException,
      );
  });
  it('rejects reversed ranges, invalid ids and an id without its type', () => {
    expect(() =>
      service.parseFilters({ from: '2026-11-06', to: '2026-11-05' }),
    ).toThrow('From date must be on or before to date.');
    expect(() => service.parseFilters({ targetId: '12' })).toThrow(
      'Choose a target type',
    );
    expect(() => service.parseFilters({ actorAdminId: 'nan' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.parseFilters({ targetType: 'ticket', targetId: '-1' }),
    ).toThrow(BadRequestException);
    expect(
      service.parseFilters({
        actorAdminId: '8',
        targetType: 'ticket',
        targetId: '123',
        limit: '100',
      }),
    ).toMatchObject({
      actorAdminId: 8,
      targetType: 'ticket',
      targetId: 123,
      limit: 100,
    });
  });
  it('keeps every action filterable, with an exhaustive nonblank label map', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual(
      [...AUDIT_ACTIONS].sort(),
    );
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABELS[action]).toMatch(/\S/);
      expect(service.parseFilters({ actionType: action }).actionType).toBe(
        action,
      );
    }
    expect(AUDIT_ACTION_LABELS.report_escalated).toContain('(retired)');
    expect(AUDIT_ACTION_LABELS.report_screened).toContain('(retired)');
  });
  it('pins both controller guards and refuses Personnel including Focal', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminAuditController)).toEqual([
      AdminSessionGuard,
      SystemAdminGuard,
    ]);
    for (const isFocal of [false, true]) {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            adminSession: {
              accountType: 'PERSONNEL',
              office: 'MDRRMO',
              isFocal,
            },
          }),
        }),
      } as unknown as ExecutionContext;
      expect(() => new SystemAdminGuard().canActivate(context)).toThrow();
    }
  });
});
