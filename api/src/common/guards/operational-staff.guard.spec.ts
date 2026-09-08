import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { OperationalStaffGuard } from './operational-staff.guard';
import type { RequestWithAdmin } from './admin-session.guard';
import type { AdminSession } from '../../auth/session.service';

function makeContext(adminSession: AdminSession | undefined): ExecutionContext {
  const req = { adminSession } as unknown as RequestWithAdmin;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('OperationalStaffGuard', () => {
  const guard = new OperationalStaffGuard();

  it('allows an officer session through', () => {
    const ctx = makeContext({
      adminId: 1,
      email: 'a@b.com',
      adminName: 'A',
      office: 'MEO',
      role: 'officer',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows a supervisor session through', () => {
    const ctx = makeContext({
      adminId: 2,
      email: 'a@b.com',
      adminName: 'A',
      office: 'MDRRMO',
      role: 'supervisor',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // The whole point of this guard, per the Batch 1 design: system_admin no
  // longer has routine operational access, even though the old helpers used
  // to treat "not system_admin" as equivalent to "is operational staff."
  it('rejects a system_admin session (system/account administration, not operations)', () => {
    const ctx = makeContext({
      adminId: 3,
      email: 'a@b.com',
      adminName: 'A',
      office: null,
      role: 'system_admin',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // Focal carries office: 'MDRRMO' but is not operational staff — it must
  // be rejected the same way, not admitted because it has an office value.
  it('rejects a focal session, despite carrying office=MDRRMO', () => {
    const ctx = makeContext({
      adminId: 4,
      email: 'a@b.com',
      adminName: 'A',
      office: 'MDRRMO',
      role: 'focal',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no admin session at all', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
