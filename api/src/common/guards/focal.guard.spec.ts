import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { FocalGuard } from './focal.guard';
import type { RequestWithAdmin } from './admin-session.guard';
import type { AdminSession } from '../../auth/session.service';

function makeContext(adminSession: AdminSession | undefined): ExecutionContext {
  const req = { adminSession } as unknown as RequestWithAdmin;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('FocalGuard', () => {
  const guard = new FocalGuard();

  it('allows a focal session through', () => {
    const ctx = makeContext({
      adminId: 1,
      email: 'a@b.com',
      adminName: 'A',
      office: 'MDRRMO',
      role: 'focal',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // The whole point of this guard: Focal Intake is a role-specific
  // operational workspace, not a super-admin view — system_admin does not
  // get it merely because it's an administrator, and officer/supervisor
  // (routine operational staff) don't get it either.
  it('rejects an officer session', () => {
    const ctx = makeContext({
      adminId: 2,
      email: 'a@b.com',
      adminName: 'A',
      office: 'MEO',
      role: 'officer',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a supervisor session', () => {
    const ctx = makeContext({
      adminId: 3,
      email: 'a@b.com',
      adminName: 'A',
      office: 'MDRRMO',
      role: 'supervisor',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a system_admin session — MIS does not inherit Focal Intake merely by being an administrator', () => {
    const ctx = makeContext({
      adminId: 4,
      email: 'a@b.com',
      adminName: 'A',
      office: null,
      role: 'system_admin',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no admin session at all', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
