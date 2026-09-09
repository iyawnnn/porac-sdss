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
import {
  FocalIntakeService,
  type ScreeningRecommendation,
} from './focal-intake.service';

// Focal's dedicated municipality-wide intake surface — never the
// operational Ticket Queue adapted to skip office scoping (see
// FocalIntakeService's own docblock). FocalGuard is the authorization
// boundary: officer/supervisor and system_admin are all rejected here,
// exactly as OperationalStaffGuard rejects focal on the operational
// controllers — neither guard is weakened by the other's existence.
@UseGuards(AdminSessionGuard, FocalGuard)
@Controller('admin/intake')
export class FocalIntakeController {
  constructor(private readonly intake: FocalIntakeService) {}

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

  @Post(':reportId/acknowledge')
  async acknowledge(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('remarks') remarks: string | undefined,
  ) {
    return this.intake.acknowledge(reportId, admin, remarks);
  }

  @Post(':reportId/screen')
  async screen(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('remarks') remarks: string | undefined,
    @Body('recommendedHandling') recommendedHandling: ScreeningRecommendation,
  ) {
    return this.intake.screen(reportId, admin, {
      remarks,
      recommendedHandling,
    });
  }

  @Post(':reportId/forward')
  async forward(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('toOffice') toOffice: 'MEO' | 'MDRRMO',
    @Body('reason') reason: string,
  ) {
    return this.intake.forward(reportId, admin, toOffice, reason);
  }

  @Post(':reportId/escalate')
  async escalate(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('reason') reason: string,
  ) {
    return this.intake.escalate(reportId, admin, reason);
  }
}
