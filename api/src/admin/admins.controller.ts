import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';
import { AdminsService } from './admins.service';

// SystemAdminGuard must run after AdminSessionGuard (it reads
// req.adminSession, which only AdminSessionGuard populates) — every route
// here is System Administrator only, with no office-scoped fallback.
@UseGuards(AdminSessionGuard, SystemAdminGuard)
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  list() {
    return this.admins.list();
  }

  @Post()
  create(
    @Body('email') email: unknown,
    @Body('password') password: unknown,
    @Body('firstName') firstName: unknown,
    @Body('lastName') lastName: unknown,
    @Body('role') role: unknown,
    @Body('office') office: unknown,
  ) {
    return this.admins.create({ email, password, firstName, lastName, role, office });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body('role') role: unknown,
    @Body('office') office: unknown,
  ) {
    return this.admins.update(id, { role, office });
  }
}
