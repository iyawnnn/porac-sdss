import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RequestWithAdmin } from './admin-session.guard';
import { isFocal } from '../authz/admin-scope';

// Must run after AdminSessionGuard (which populates req.adminSession) —
// used together via @UseGuards(AdminSessionGuard, FocalGuard). Gates the
// Focal Intake surface (municipality-wide report intake, acknowledgment,
// screening, forward, escalate) to role: 'focal' only. Deliberately does
// NOT extend to system_admin — this is a role-specific operational
// workspace, not a super-admin view, and MIS must not gain Focal Intake
// merely by being an administrator. Does not weaken OperationalStaffGuard:
// officer/supervisor are rejected here exactly as system_admin is.
@Injectable()
export class FocalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!req.adminSession || !isFocal(req.adminSession)) {
      throw new ForbiddenException('Focal Intake access required.');
    }
    return true;
  }
}
