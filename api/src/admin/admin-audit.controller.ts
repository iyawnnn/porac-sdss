import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';
import { AdminAuditService } from './admin-audit.service';

// System Administrator only, same as AdminsController — the safest minimal
// policy for a log that can span every office's tickets/reports (see
// admin-audit.service.ts's ADR-style comment and the top-level report for
// why office-scoped partial access was rejected).
@UseGuards(AdminSessionGuard, SystemAdminGuard)
@Controller('admin/activity-log')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.audit.list(this.audit.parseFilters(query));
  }
}
