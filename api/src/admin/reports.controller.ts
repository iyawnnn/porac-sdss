import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { ReportsService } from './reports.service';

function csvFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

// Read-only CSV export over data the caller could already see via
// GET /admin/tickets and GET /admin/work-orders — same AdminSessionGuard,
// same office scoping (resolveOfficeScope, applied inside
// TicketsService.parseTicketQuery / WorkOrdersService.parseQuery), just
// reshaped as a downloadable file instead of a paginated JSON response.
@UseGuards(AdminSessionGuard)
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
}
