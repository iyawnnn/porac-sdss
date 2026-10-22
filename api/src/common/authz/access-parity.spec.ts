import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AdminSession } from '../../auth/session.service';
import { AdminsService } from '../../admin/admins.service';
import type { AdminAuditService } from '../../admin/admin-audit.service';
import { notifications } from '../../db/schema';
import {
  NotificationsService,
  type NotificationPrincipal,
} from '../../notifications/notifications.service';
import { FocalGuard } from '../guards/focal.guard';
import { OperationalStaffGuard } from '../guards/operational-staff.guard';
import { SystemAdminGuard } from '../guards/system-admin.guard';
import {
  assertOfficeAccess,
  isFocalPersonnel,
  isOperationalPersonnel,
  isSystemAdmin,
  resolveOfficeScope,
} from './admin-scope';

// Manuscript revision Phase 2, step 2e: access must stay EXACTLY the same
// after every decision moved from admins.role to account_type / office /
// is_focal. Each role x office combination that exists today is mapped
// with migration 0039's mapping, and every permission helper, guard and
// scope function must give the same decision as the old role-based logic,
// which is copied below as the reference (it is no longer in the app).

type OldRole = 'officer' | 'supervisor' | 'focal' | 'system_admin';
type Office = 'MEO' | 'MDRRMO';
interface OldAdmin {
  role: OldRole;
  office: Office | null;
}

// ---- The old logic, copied from api/src/common/authz/admin-scope.ts and
// ---- the guards/services as they were before step 2e.
const old = {
  isSystemAdmin: (a: OldAdmin) => a.role === 'system_admin',
  isFocal: (a: OldAdmin) => a.role === 'focal',
  isOperationalStaff: (a: OldAdmin) =>
    a.role === 'officer' || a.role === 'supervisor',
  resolveOfficeScope(a: OldAdmin): Office {
    if (!old.isOperationalStaff(a) || !a.office) {
      throw new ForbiddenException('Operational access required.');
    }
    return a.office;
  },
  assertOfficeAccess(a: OldAdmin, resourceOffice: Office): void {
    if (!old.isOperationalStaff(a) || a.office !== resourceOffice) {
      throw new ForbiddenException(
        "You do not have access to this office's data.",
      );
    }
  },
  // NotificationsService.scopeFilter's office-wide condition.
  notificationOfficeWide: (a: OldAdmin) =>
    old.isOperationalStaff(a) && a.office ? a.office : null,
};

// ---- Migration 0039's mapping.
function mapped(
  a: OldAdmin,
): Pick<AdminSession, 'accountType' | 'isFocal' | 'office'> {
  return {
    accountType: a.role === 'system_admin' ? 'SYSTEM_ADMIN' : 'PERSONNEL',
    isFocal: a.role === 'focal',
    office: a.role === 'focal' ? 'MDRRMO' : a.office,
  };
}

// Every role x office combination that exists today. A legacy focal with no
// office is included because 0039 moves it to MDRRMO; old focal decisions
// never depended on office, so its decisions must not change either.
const COMBINATIONS: [string, OldAdmin][] = [
  ['officer MEO', { role: 'officer', office: 'MEO' }],
  ['officer MDRRMO', { role: 'officer', office: 'MDRRMO' }],
  ['supervisor MEO', { role: 'supervisor', office: 'MEO' }],
  ['supervisor MDRRMO', { role: 'supervisor', office: 'MDRRMO' }],
  ['focal MDRRMO', { role: 'focal', office: 'MDRRMO' }],
  ['focal (legacy, no office)', { role: 'focal', office: null }],
  ['system_admin', { role: 'system_admin', office: null }],
];

const REQUESTED: (Office | 'all' | undefined)[] = [
  undefined,
  'all',
  'MEO',
  'MDRRMO',
];
const OFFICES: Office[] = ['MEO', 'MDRRMO'];

// The decision a call makes: its result, or the exception it throws.
function decide(fn: () => unknown) {
  try {
    return { result: fn() ?? 'ok' };
  } catch (err) {
    const e = err as Error;
    return { threw: e.constructor.name, message: e.message };
  }
}

function guardAllows(
  guard: { canActivate(ctx: ExecutionContext): boolean },
  adminSession: unknown,
) {
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ adminSession }) }),
  } as unknown as ExecutionContext;
  return decide(() => guard.canActivate(ctx));
}

const render = (query: unknown) =>
  new PgDialect().sqlToQuery(query as Parameters<PgDialect['sqlToQuery']>[0]);

describe('access parity: account_type / office / is_focal vs the old role logic', () => {
  describe.each(COMBINATIONS)('%s', (_label, oldAdmin) => {
    const admin = mapped(oldAdmin);
    const session = { adminId: 1, email: 'a@x', adminName: 'A', ...admin };

    it('isSystemAdmin / isFocalPersonnel / isOperationalPersonnel match', () => {
      expect(isSystemAdmin(admin)).toBe(old.isSystemAdmin(oldAdmin));
      expect(isFocalPersonnel(admin)).toBe(old.isFocal(oldAdmin));
      expect(isOperationalPersonnel(admin)).toBe(
        old.isOperationalStaff(oldAdmin),
      );
    });

    it('resolveOfficeScope gives the same office or the same rejection for every requested office', () => {
      for (const requested of REQUESTED) {
        expect(decide(() => resolveOfficeScope(admin, requested))).toEqual(
          decide(() => old.resolveOfficeScope(oldAdmin)),
        );
      }
    });

    it('assertOfficeAccess passes or rejects exactly as before, for both offices', () => {
      for (const office of OFFICES) {
        expect(decide(() => assertOfficeAccess(admin, office))).toEqual(
          decide(() => old.assertOfficeAccess(oldAdmin, office)),
        );
      }
    });

    it('SystemAdminGuard / FocalGuard / OperationalStaffGuard allow and reject the same', () => {
      const allowed = (ok: boolean, message: string) =>
        ok ? { result: true } : { threw: 'ForbiddenException', message };
      expect(guardAllows(new SystemAdminGuard(), session)).toEqual(
        allowed(
          old.isSystemAdmin(oldAdmin),
          'System Administrator access required.',
        ),
      );
      expect(guardAllows(new FocalGuard(), session)).toEqual(
        allowed(old.isFocal(oldAdmin), 'Focal Intake access required.'),
      );
      expect(guardAllows(new OperationalStaffGuard(), session)).toEqual(
        allowed(
          old.isOperationalStaff(oldAdmin),
          'Operational staff access required.',
        ),
      );
    });

    it('sees the same notifications (office-wide rows only for operational staff)', () => {
      const service = new NotificationsService({} as PostgresJsDatabase);
      const principal: NotificationPrincipal = {
        type: 'admin',
        adminId: 1,
        ...admin,
      };
      const officeWide = old.notificationOfficeWide(oldAdmin);
      const reference = and(
        eq(notifications.recipientType, 'admin'),
        officeWide
          ? or(
              eq(notifications.recipientId, 1),
              eq(notifications.recipientOffice, officeWide),
            )
          : eq(notifications.recipientId, 1),
      );
      const scope = (
        service as unknown as {
          scopeFilter(p: NotificationPrincipal): unknown;
        }
      ).scopeFilter(principal);
      expect(render(scope)).toEqual(render(reference));
    });
  });

  // The staff directory (work-order assignee picker): same callers allowed,
  // and the same rows listed, for every combination as caller and as row.
  it('the staff directory lists the same accounts to the same callers', async () => {
    const rows = COMBINATIONS.map(([label, a], i) => ({
      id: i + 1,
      firstName: label,
      lastName: 'X',
      email: `${i + 1}@x`,
      ...mapped(a),
    }));
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            // The office part of the WHERE comes from resolveOfficeScope
            // (compared above); every row is returned here so the
            // account-kind filter is what this compares.
            orderBy: () => Promise.resolve(rows),
          }),
        }),
      }),
    } as unknown as PostgresJsDatabase;
    const service = new AdminsService(db, {} as AdminAuditService);

    for (const [, caller] of COMBINATIONS) {
      const result = await service
        .listDirectory(mapped(caller), undefined)
        .then((list) => list.map((r) => r.id))
        .catch((err: Error) => err.constructor.name);
      const expected = old.isOperationalStaff(caller)
        ? COMBINATIONS.map(([, a], i) => [a, i + 1] as const)
            .filter(([a]) => old.isOperationalStaff(a))
            .map(([, id]) => id)
        : 'ForbiddenException';
      expect(result).toEqual(expected);
    }
  });

  describe('Focal Personnel keeps intake/screening only', () => {
    const focal = mapped({ role: 'focal', office: 'MDRRMO' });
    const session = { adminId: 3, email: 'f@x', adminName: 'F', ...focal };

    it('is Personnel on MDRRMO with is_focal', () => {
      expect(focal).toEqual({
        accountType: 'PERSONNEL',
        isFocal: true,
        office: 'MDRRMO',
      });
    });

    it('is allowed Focal Intake (FocalGuard)', () => {
      expect(guardAllows(new FocalGuard(), session)).toEqual({ result: true });
    });

    it('is denied Work Orders and every other operational surface (OperationalStaffGuard)', () => {
      expect(guardAllows(new OperationalStaffGuard(), session)).toEqual({
        threw: 'ForbiddenException',
        message: 'Operational staff access required.',
      });
    });

    it('is denied the MDRRMO operational queue, despite office MDRRMO (resolveOfficeScope)', () => {
      expect(() => resolveOfficeScope(focal, 'MDRRMO')).toThrow(
        ForbiddenException,
      );
      expect(() => resolveOfficeScope(focal, undefined)).toThrow(
        ForbiddenException,
      );
    });

    it('is denied assessments and every MDRRMO ticket/report/work-order action (assertOfficeAccess)', () => {
      expect(() => assertOfficeAccess(focal, 'MDRRMO')).toThrow(
        ForbiddenException,
      );
      expect(() => assertOfficeAccess(focal, 'MEO')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('the System Administrator keeps account administration only', () => {
    const systemAdmin = mapped({ role: 'system_admin', office: null });
    const session = {
      adminId: 4,
      email: 's@x',
      adminName: 'S',
      ...systemAdmin,
    };

    it('is SYSTEM_ADMIN with no office and not Focal', () => {
      expect(systemAdmin).toEqual({
        accountType: 'SYSTEM_ADMIN',
        isFocal: false,
        office: null,
      });
    });

    it('is allowed admin management (SystemAdminGuard)', () => {
      expect(guardAllows(new SystemAdminGuard(), session)).toEqual({
        result: true,
      });
    });

    it('is denied Focal Intake and every operational surface', () => {
      expect(guardAllows(new FocalGuard(), session)).toMatchObject({
        threw: 'ForbiddenException',
      });
      expect(guardAllows(new OperationalStaffGuard(), session)).toMatchObject({
        threw: 'ForbiddenException',
      });
      expect(() => resolveOfficeScope(systemAdmin, 'all')).toThrow(
        ForbiddenException,
      );
      for (const office of OFFICES) {
        expect(() => assertOfficeAccess(systemAdmin, office)).toThrow(
          ForbiddenException,
        );
      }
    });
  });
});
