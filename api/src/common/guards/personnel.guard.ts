import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { RequestWithAdmin } from './admin-session.guard';
import { isFocalPersonnel, isOperationalPersonnel } from '../authz/admin-scope';

// Must run after AdminSessionGuard. Admits Personnel — operational
// (MEO/MDRRMO) and Focal alike — and rejects the System Administrator. Used
// by the one surface both kinds of Personnel share: merging tickets and
// moving reports (manuscript revision Phase 3, step 3d). The finer rule
// (own office for operational Personnel; Reported with no active Work Order
// for Focal) is checked per ticket by TicketGroupingService, the way
// TicketsService.reassignOffice checks Focal's Forward.
@Injectable()
export class PersonnelGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    const admin = req.adminSession;
    if (!admin || !(isOperationalPersonnel(admin) || isFocalPersonnel(admin))) {
      throw new ForbiddenException('Personnel access required.');
    }
    return true;
  }
}
