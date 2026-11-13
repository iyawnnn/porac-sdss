import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { CurrentCitizen } from '../common/decorators/current-citizen.decorator';
import type { AdminSession, CitizenSession } from '../auth/session.service';
import {
  NotificationsService,
  type NotificationPrincipal,
} from './notifications.service';

interface ListQuery {
  before?: string;
  limit?: string;
  status?: string;
  type?: string;
}

const listOptions = (
  q: ListQuery,
): Parameters<NotificationsService['listForPrincipal']>[1] => ({
  before: q.before ? Number(q.before) : undefined,
  limit: q.limit ? Number(q.limit) : undefined,
  // Unrecognized value falls back to 'all' — same silent-default
  // convention every other admin list endpoint already uses.
  status: q.status === 'unread' || q.status === 'read' ? q.status : 'all',
  type: q.type || undefined,
});

const adminPrincipal = (s: AdminSession): NotificationPrincipal => ({
  type: 'admin',
  adminId: s.adminId,
  office: s.office,
  accountType: s.accountType,
  isFocal: s.isFocal,
});

const citizenPrincipal = (s: CitizenSession): NotificationPrincipal => ({
  type: 'citizen',
  citizenId: s.citizenId,
});

// One controller per audience (IAN-27). The old shared route picked the
// admin cookie whenever both were present, so a citizen page in a browser
// that also held a staff session read — and marked read — staff
// notifications. Each shell now calls its own path behind its own guard.
@UseGuards(AdminSessionGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminSession, @Query() q: ListQuery) {
    return this.notifications.listForPrincipal(
      adminPrincipal(admin),
      listOptions(q),
    );
  }

  @Get('unread-count')
  async unreadCount(@CurrentAdmin() admin: AdminSession) {
    return {
      count: await this.notifications.getUnreadCount(adminPrincipal(admin)),
    };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentAdmin() admin: AdminSession,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notifications.markRead(adminPrincipal(admin), id);
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentAdmin() admin: AdminSession) {
    await this.notifications.markAllRead(adminPrincipal(admin));
    return { ok: true };
  }
}

@UseGuards(CitizenSessionGuard)
@Controller('citizens/notifications')
export class CitizenNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentCitizen() citizen: CitizenSession, @Query() q: ListQuery) {
    return this.notifications.listForPrincipal(
      citizenPrincipal(citizen),
      listOptions(q),
    );
  }

  @Get('unread-count')
  async unreadCount(@CurrentCitizen() citizen: CitizenSession) {
    return {
      count: await this.notifications.getUnreadCount(citizenPrincipal(citizen)),
    };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentCitizen() citizen: CitizenSession,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.notifications.markRead(citizenPrincipal(citizen), id);
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentCitizen() citizen: CitizenSession) {
    await this.notifications.markAllRead(citizenPrincipal(citizen));
    return { ok: true };
  }
}
