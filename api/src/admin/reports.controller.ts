import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { OperationalStaffGuard } from '../common/guards/operational-staff.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { ReportsService } from './reports.service';

function csvFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

// Office-scoped CSVs over the caller's operational lists and ticket details.
// Original exports delegate their list parsers; the additional exports use
// validated calendar-day filters with the same resolveOfficeScope clamp.
// No attachment headers are set until serialization and required audit pass.
@UseGuards(AdminSessionGuard, OperationalStaffGuard)
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('tickets.csv')
  async ticketsCsv(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.ticketsCsv(query, admin);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('tickets')}"`,
    });
    return csv;
  }

  @Get('flagged.csv')
  async flaggedCsv(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.flaggedCsv(query, admin);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('flagged-reports')}"`,
    });
    return csv;
  }

  @Get('work-orders.csv')
  async workOrdersCsv(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.workOrdersCsv(query, admin);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('work-orders')}"`,
    });
    return csv;
  }
  @Get('submitted-reports.csv')
  async submittedReportsCsv(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.submittedReportsCsv(query, admin);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('submitted-reports')}"`,
    });
    return csv;
  }

  @Get('operational-assessments.csv')
  async operationalAssessmentsCsv(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.operationalAssessmentsCsv(query, admin);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('operational-assessments')}"`,
    });
    return csv;
  }

  @Get('priority-incidents.csv')
  async priorityIncidentsCsv(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.priorityIncidentsCsv(query, admin);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('priority-incidents')}"`,
    });
    return csv;
  }
}
