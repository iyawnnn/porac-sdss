import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestWithAdmin } from './admin-session.guard';
import { isSystemAdmin } from '../authz/admin-scope';

// Must run after AdminSessionGuard (which populates req.adminSession) —
// used together via @UseGuards(AdminSessionGuard, SystemAdminGuard), never
// on its own. Office-scoped admins (officer/supervisor) are rejected
// outright here rather than clamped, since admin-management endpoints have
// no office-scoped equivalent to fall back to.
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!req.adminSession || !isSystemAdmin(req.adminSession)) {
      throw new ForbiddenException('System Administrator access required.');
    }
    return true;
  }
}
