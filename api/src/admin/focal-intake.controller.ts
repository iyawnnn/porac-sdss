import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { FocalGuard } from '../common/guards/focal.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { FocalIntakeService } from './focal-intake.service';
import { RelatedTicketsService } from './related-tickets.service';
import { validateReassignOffice } from './ticket-routing.rules';

// Focal's dedicated municipality-wide intake surface — never the
// operational Ticket Queue adapted to skip office scoping (see
// FocalIntakeService's own docblock). FocalGuard is the authorization
// boundary: officer/supervisor and system_admin are all rejected here,
// exactly as OperationalStaffGuard rejects focal on the operational
// controllers — neither guard is weakened by the other's existence.
@UseGuards(AdminSessionGuard, FocalGuard)
@Controller('admin/intake')
export class FocalIntakeController {
  constructor(
    private readonly intake: FocalIntakeService,
    private readonly related: RelatedTicketsService,
  ) {}

  @Get()
  list() {
    return this.intake.listIntake();
  }

  // Must stay declared above ':reportId' — Nest matches by declaration
  // order, and ':reportId' would otherwise swallow the literal 'geo'
  // segment first (same trap documented on TicketsController's bulk
  // routes).
  @Get('geo')
  geo() {
    return this.intake.listIntakeGeo();
  }

  @Get(':reportId')
  async detail(@Param('reportId', ParseIntPipe) reportId: number) {
    const detail = await this.intake.getIntakeDetail(reportId);
    if (!detail) throw new NotFoundException('Report not found.');
    return detail;
  }

  // Suggested related tickets for this report's ticket, both offices
  // (manuscript revision Phase 3, step 3c). Read-only; same 404 as above.
  @Get(':reportId/related-candidates')
  async relatedCandidates(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const related = await this.related.forReport(reportId, admin);
    if (!related) throw new NotFoundException('Report not found.');
    return related;
  }

  @Post(':reportId/acknowledge')
  async acknowledge(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('remarks') remarks: string | undefined,
  ) {
    return this.intake.acknowledge(reportId, admin, remarks);
  }

  // Focal severity screening (manuscript revision Phase 3, step 3f). It
  // replaced POST :reportId/screen, the old general screening action,
  // which is gone. The service validates status and remarks.
  @Post(':reportId/severity-screening')
  async screenSeverity(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('status') status: unknown,
    @Body('remarks') remarks: unknown,
  ) {
    return this.intake.screenSeverity(reportId, admin, { status, remarks });
  }

  // Focal Reassign and Refer of the report's ticket (manuscript revision
  // Phase 5, step 5a), which replaced POST :reportId/forward and
  // :reportId/escalate — both gone. Same rule and status codes as the
  // operational /admin/tickets/:id/reassign|refer; for Focal, 403 once the
  // ticket has left Reported or has an active Work Order.
  @Post(':reportId/reassign')
  async reassign(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('toOffice') toOffice: unknown,
    @Body('reason') reason: unknown,
  ) {
    return this.intake.reassign(
      reportId,
      admin,
      validateReassignOffice(toOffice),
      reason,
    );
  }

  @Post(':reportId/refer')
  async refer(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('agency') agency: unknown,
    @Body('reason') reason: unknown,
  ) {
    return this.intake.refer(reportId, admin, agency, reason);
  }
}
