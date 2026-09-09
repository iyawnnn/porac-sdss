import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { OperationalStaffGuard } from '../common/guards/operational-staff.guard';
import { BarangayInsightsController } from './barangay-insights.controller';
import { DashboardController } from './dashboard.controller';
import { ModerationController } from './moderation.controller';
import { ReportsController } from './reports.controller';
import { SavedViewsController } from './saved-views.controller';
import { TicketsController } from './tickets.controller';
import { WorkOrdersController } from './work-orders.controller';
import { AdminDirectoryController } from './admin-directory.controller';

// Batch 1 (five-role RBAC): every routine operational admin surface must
// require OperationalStaffGuard (officer/supervisor only) in addition to
// AdminSessionGuard, so focal and system_admin are rejected outright rather
// than relying on each service method's own resolveOfficeScope/
// assertOfficeAccess call as the only line of defense. This is the
// controller-wiring half of that defense-in-depth — the guard's own logic
// is unit-tested in operational-staff.guard.spec.ts.
const OPERATIONAL_CONTROLLERS = [
  BarangayInsightsController,
  DashboardController,
  ModerationController,
  ReportsController,
  SavedViewsController,
  TicketsController,
  WorkOrdersController,
  AdminDirectoryController,
];

describe('Operational controllers require OperationalStaffGuard', () => {
  it.each(OPERATIONAL_CONTROLLERS)(
    '%s applies AdminSessionGuard + OperationalStaffGuard at the class level',
    (Controller) => {
      const guards =
        (Reflect.getMetadata(GUARDS_METADATA, Controller) as
          unknown[] | undefined) ?? [];
      expect(guards).toContain(AdminSessionGuard);
      expect(guards).toContain(OperationalStaffGuard);
    },
  );
});
