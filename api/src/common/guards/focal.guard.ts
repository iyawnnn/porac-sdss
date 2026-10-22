import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RequestWithAdmin } from './admin-session.guard';
import { isFocalPersonnel } from '../authz/admin-scope';

// Must run after AdminSessionGuard (which populates req.adminSession) —
// used together via @UseGuards(AdminSessionGuard, FocalGuard). Gates the
// Focal Intake surface (municipality-wide report intake, acknowledgment,
// screening, forward, escalate) to Focal Personnel only (PERSONNEL with
// isFocal). Deliberately does NOT extend to the System Administrator —
// this is a Focal-specific workspace, not a super-admin view, and the
// System Administrator must not gain Focal Intake merely by being an
// administrator. Does not weaken OperationalStaffGuard: operational
// Personnel are rejected here exactly as the System Administrator is.
@Injectable()
export class FocalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!req.adminSession || !isFocalPersonnel(req.adminSession)) {
      throw new ForbiddenException('Focal Intake access required.');
    }
    return true;
  }
}
