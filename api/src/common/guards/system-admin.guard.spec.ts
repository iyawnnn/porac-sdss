import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SystemAdminGuard } from './system-admin.guard';
import type { RequestWithAdmin } from './admin-session.guard';
import type { AdminSession } from '../../auth/session.service';

function makeContext(adminSession: AdminSession | undefined): ExecutionContext {
  const req = { adminSession } as unknown as RequestWithAdmin;
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('SystemAdminGuard', () => {
  const guard = new SystemAdminGuard();

  it('allows a system_admin session through', () => {
    const ctx = makeContext({ adminId: 1, email: 'a@b.com', adminName: 'A', office: null, role: 'system_admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects an officer session (office-scoped, not system-wide)', () => {
    const ctx = makeContext({ adminId: 2, email: 'a@b.com', adminName: 'A', office: 'MEO', role: 'officer' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects a supervisor session (office-scoped, not system-wide)', () => {
    const ctx = makeContext({ adminId: 3, email: 'a@b.com', adminName: 'A', office: 'MDRRMO', role: 'supervisor' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no admin session at all', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
