import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RequestWithAdmin } from './admin-session.guard';
import { isOperationalStaff } from '../authz/admin-scope';

// Must run after AdminSessionGuard (which populates req.adminSession) —
// used together via @UseGuards(AdminSessionGuard, OperationalStaffGuard).
// Gates the routine operational admin surfaces (Ticket Queue, Work Orders,
// Dashboard, Barangay Insights, Moderation/Flagged, Reports & Exports, the
// staff directory) to officer/supervisor only. Batch 1 (five-role RBAC)
// correction: focal (office-bearing but not operational) and system_admin
// (system/account administration only) are both rejected here — neither
// gets the old "not officer/supervisor falls through to something wider"
// treatment. See api/src/common/authz/admin-scope.ts's isOperationalStaff.
@Injectable()
export class OperationalStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!req.adminSession || !isOperationalStaff(req.adminSession)) {
      throw new ForbiddenException('Operational staff access required.');
    }
    return true;
  }
}
