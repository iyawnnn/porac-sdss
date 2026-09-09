import { GUARDS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'fs';
import { join } from 'path';
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

// Batch 4: GET 'geo' must be declared before GET ':reportId', or Nest's
// declaration-order route matching would swallow it as reportId='geo'
// (the exact trap TicketsController's bulk routes already document).
describe('FocalIntakeController route declaration order', () => {
  const controllerSource = readFileSync(
    join(__dirname, 'focal-intake.controller.ts'),
    'utf8',
  );

  it("declares 'geo' before ':reportId'", () => {
    const geoIndex = controllerSource.indexOf("@Get('geo')");
    const detailIndex = controllerSource.indexOf("@Get(':reportId')");
    expect(geoIndex).toBeGreaterThan(-1);
    expect(geoIndex).toBeLessThan(detailIndex);
  });
});
