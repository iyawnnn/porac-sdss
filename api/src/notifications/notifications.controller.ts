import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CITIZEN_SESSION_COOKIE,
  SESSION_COOKIE,
  SessionService,
} from '../auth/session.service';
import { NotificationsService, type NotificationPrincipal } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly sessions: SessionService,
  ) {}

  // Serves both shells from one controller — mirrors auth.controller.ts's
  // GET auth/me exactly (try the admin cookie, fall back to the citizen
  // cookie, 401 if neither) rather than inventing a new combined guard.
  private async resolvePrincipal(req: Request): Promise<NotificationPrincipal> {
    const adminToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (adminToken) {
      const session = await this.sessions.verifyAdminSession(adminToken);
      if (session) {
        return { type: 'admin', adminId: session.adminId, office: session.office };
      }
    }

    const citizenToken = req.cookies?.[CITIZEN_SESSION_COOKIE] as string | undefined;
    if (citizenToken) {
      const session = await this.sessions.verifyCitizenSession(citizenToken);
      if (session) {
        return { type: 'citizen', citizenId: session.citizenId };
      }
    }

    throw new UnauthorizedException();
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const principal = await this.resolvePrincipal(req);
    return this.notifications.listForPrincipal(principal, {
      before: before ? Number(before) : undefined,
      limit: limit ? Number(limit) : undefined,
      // Unrecognized value falls back to 'all' — same silent-default
      // convention every other admin list endpoint already uses.
      status: status === 'unread' || status === 'read' ? status : 'all',
      type: type || undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    const principal = await this.resolvePrincipal(req);
    const count = await this.notifications.getUnreadCount(principal);
    return { count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const principal = await this.resolvePrincipal(req);
    await this.notifications.markRead(principal, id);
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Req() req: Request) {
    const principal = await this.resolvePrincipal(req);
    await this.notifications.markAllRead(principal);
    return { ok: true };
  }
}
