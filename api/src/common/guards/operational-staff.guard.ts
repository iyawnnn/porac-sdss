import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RequestWithAdmin } from './admin-session.guard';
import { isOperationalPersonnel } from '../authz/admin-scope';

// Must run after AdminSessionGuard (which populates req.adminSession) —
// used together via @UseGuards(AdminSessionGuard, OperationalStaffGuard).
// Gates the routine operational admin surfaces (Ticket Queue, Work Orders,
// Dashboard, Barangay Insights, Moderation/Flagged, Reports & Exports, the
// staff directory) to operational Personnel only (PERSONNEL, not Focal).
// Batch 1 (five-role RBAC) correction: Focal Personnel (office-bearing but
// not operational) and the System Administrator (account administration
// only) are both rejected here — neither gets the old "not operational
// falls through to something wider" treatment. See
// api/src/common/authz/admin-scope.ts's isOperationalPersonnel.
@Injectable()
export class OperationalStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!req.adminSession || !isOperationalPersonnel(req.adminSession)) {
      throw new ForbiddenException('Operational staff access required.');
    }
    return true;
  }
}
