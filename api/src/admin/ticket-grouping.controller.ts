import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { PersonnelGuard } from '../common/guards/personnel.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { TicketGroupingService } from './ticket-grouping.service';

// Staff Merge / Remove / Regroup (manuscript revision Phase 3, step 3d).
// Shared by operational Personnel (Ticket Detail) and Focal (Focal Intake),
// so the guard admits both and rejects the System Administrator; which
// tickets each may change is checked per ticket by the service.
@UseGuards(AdminSessionGuard, PersonnelGuard)
@Controller('admin/ticket-grouping')
export class TicketGroupingController {
  constructor(private readonly grouping: TicketGroupingService) {}

  @Post('merge')
  merge(
    @Body() body: Record<string, unknown>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.grouping.merge(body, admin);
  }

  @Post('remove-report')
  removeReport(
    @Body() body: Record<string, unknown>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.grouping.removeReport(body, admin);
  }

  @Post('regroup-report')
  regroupReport(
    @Body() body: Record<string, unknown>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.grouping.regroupReport(body, admin);
  }
}
