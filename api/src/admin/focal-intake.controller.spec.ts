import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { FocalGuard } from '../common/guards/focal.guard';
import { OperationalStaffGuard } from '../common/guards/operational-staff.guard';
import { FocalIntakeController } from './focal-intake.controller';

// FocalIntakeController must require FocalGuard, never OperationalStaffGuard
// — Focal Intake is a role-specific workspace, not something officer/
// supervisor or system_admin can reach by being operational staff/an admin.
describe('FocalIntakeController guards', () => {
  it('applies AdminSessionGuard + FocalGuard at the class level, and never OperationalStaffGuard', () => {
    const guards: unknown[] =
      (Reflect.getMetadata(GUARDS_METADATA, FocalIntakeController) as
        unknown[] | undefined) ?? [];
    expect(guards).toContain(AdminSessionGuard);
    expect(guards).toContain(FocalGuard);
    expect(guards).not.toContain(OperationalStaffGuard);
  });
});
