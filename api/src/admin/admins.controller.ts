import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { AdminsService } from './admins.service';
import {
  AdminAccountService,
  SelfResetNotAllowedError,
  WeakPasswordError,
} from './admin-account.service';

// SystemAdminGuard must run after AdminSessionGuard (it reads
// req.adminSession, which only AdminSessionGuard populates) — every route
// here is System Administrator only, with no office-scoped fallback.
@UseGuards(AdminSessionGuard, SystemAdminGuard)
@Controller('admin/admins')
export class AdminsController {
  constructor(
    private readonly admins: AdminsService,
    private readonly account: AdminAccountService,
  ) {}

  @Get()
  list() {
    return this.admins.list();
  }

  @Post()
  create(
    @CurrentAdmin() actor: AdminSession,
    @Body('email') email: unknown,
    @Body('password') password: unknown,
    @Body('firstName') firstName: unknown,
    @Body('lastName') lastName: unknown,
    @Body('role') role: unknown,
    @Body('office') office: unknown,
  ) {
    return this.admins.create({ email, password, firstName, lastName, role, office }, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() actor: AdminSession,
    @Body('role') role: unknown,
    @Body('office') office: unknown,
  ) {
    return this.admins.update(id, { role, office }, actor);
  }

  // System Admin only (inherited from the class-level guard) — setting a
  // temporary password for another admin. Self-reset is rejected; use
  // "Change my password" (admin-account.controller.ts) for your own row.
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() actor: AdminSession,
    @Body('newPassword') newPassword: unknown,
  ) {
    try {
      await this.account.resetPassword(actor, id, newPassword);
    } catch (err) {
      if (err instanceof WeakPasswordError) {
        throw new BadRequestException(
          'Password must be at least 8 characters.',
        );
      }
      if (err instanceof SelfResetNotAllowedError) {
        throw new BadRequestException(
          'Use "Change my password" to update your own credentials.',
        );
      }
      throw err;
    }
    return { ok: true };
  }

  // System Admin only (inherited from the class-level guard). Blocks
  // deactivating/reactivating the last active system_admin — see
  // AdminsService.setActive.
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() actor: AdminSession,
  ) {
    return this.admins.setActive(id, false, actor);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() actor: AdminSession,
  ) {
    return this.admins.setActive(id, true, actor);
  }
}
