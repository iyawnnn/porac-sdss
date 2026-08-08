import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { AdminsService } from './admins.service';

// Separate controller (not a route on AdminsController) so this stays
// reachable by MEO/MDRRMO admins — AdminsController stacks SystemAdminGuard
// at the class level, which would reject them outright. Sharing the
// 'admin/admins' path prefix is safe: AdminsController has no matching GET
// route for ':something', so 'admin/admins/directory' only ever resolves
// here.
@UseGuards(AdminSessionGuard)
@Controller('admin/admins')
export class AdminDirectoryController {
  constructor(private readonly admins: AdminsService) {}

  @Get('directory')
  directory(
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const requestedOffice =
      officeParam === 'all' || officeParam === 'MEO' || officeParam === 'MDRRMO'
        ? officeParam
        : undefined;
    return this.admins.listDirectory(admin, requestedOffice);
  }
}
