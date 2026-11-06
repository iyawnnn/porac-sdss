import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { FocalGuard } from '../common/guards/focal.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { FocalDashboardService } from './focal-dashboard.service';

@UseGuards(AdminSessionGuard, FocalGuard)
@Controller('admin/focal-dashboard')
export class FocalDashboardController {
  constructor(private readonly dashboard: FocalDashboardService) {}

  @Get()
  counts(@CurrentAdmin() admin: AdminSession) {
    return this.dashboard.counts(admin);
  }

  @Get('reports')
  reports(
    @CurrentAdmin() admin: AdminSession,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dashboard.reports(admin, page, pageSize);
  }
}
