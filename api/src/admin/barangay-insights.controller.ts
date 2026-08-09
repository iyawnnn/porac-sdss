import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { resolveOfficeScope } from '../common/authz/admin-scope';
import { BarangayInsightsService } from './barangay-insights.service';

function parseOfficeParam(value: string | undefined): 'MEO' | 'MDRRMO' | 'all' | undefined {
  return value === 'all' || value === 'MEO' || value === 'MDRRMO' ? value : undefined;
}

// Read-only, no extra guard beyond AdminSessionGuard — safe because every
// count is office-scoped via resolveOfficeScope (BarangayInsightsService),
// the same clamp GET /admin/dashboard and GET /admin/tickets already use.
// Barangay identity itself isn't office-owned (unlike a ticket or work
// order), so any admin may view any barangay's profile; only the
// ticket-derived numbers on it are office-scoped.
@UseGuards(AdminSessionGuard)
@Controller('admin/barangay-insights')
export class BarangayInsightsController {
  constructor(private readonly barangayInsights: BarangayInsightsService) {}

  @Get()
  async list(
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const office = resolveOfficeScope(admin, parseOfficeParam(officeParam));
    const barangays = await this.barangayInsights.listInsights(office);
    return { office: office ?? 'ALL', barangays };
  }

  @Get(':id')
  getProfile(
    @Param('id', ParseIntPipe) id: number,
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const office = resolveOfficeScope(admin, parseOfficeParam(officeParam));
    return this.barangayInsights.getProfile(id, office);
  }
}
