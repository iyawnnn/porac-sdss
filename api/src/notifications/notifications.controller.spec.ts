import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { AdminSession, CitizenSession } from '../auth/session.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import {
  CitizenNotificationsController,
  NotificationsController,
} from './notifications.controller';
import type { NotificationsService } from './notifications.service';

const admin = {
  adminId: 1,
  office: 'MEO',
  accountType: 'PERSONNEL',
  isFocal: false,
} as AdminSession;
const adminPrincipal = {
  type: 'admin',
  adminId: 1,
  office: 'MEO',
  accountType: 'PERSONNEL',
  isFocal: false,
};
const citizen = { citizenId: 9 } as CitizenSession;
const citizenPrincipal = { type: 'citizen', citizenId: 9 };

function makeService() {
  return {
    listForPrincipal: jest
      .fn()
      .mockResolvedValue({ items: [{ id: 1 }], nextCursor: null }),
    getUnreadCount: jest.fn().mockResolvedValue(3),
    markRead: jest.fn().mockResolvedValue(undefined),
    markAllRead: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService & Record<string, jest.Mock>;
}

describe('notification controllers are pinned to one session audience (IAN-27)', () => {
  it('guards the staff feed with the admin session only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificationsController),
    ).toEqual([AdminSessionGuard]);
  });

  it('guards the citizen feed with the citizen session only', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CitizenNotificationsController),
    ).toEqual([CitizenSessionGuard]);
  });
});

describe('NotificationsController (staff)', () => {
  it('GET / parses before/limit and defaults status to all', async () => {
    const service = makeService();
    const controller = new NotificationsController(service);
    await expect(
      controller.list(admin, { before: '42', limit: '5' }),
    ).resolves.toEqual({ items: [{ id: 1 }], nextCursor: null });
    expect(service.listForPrincipal).toHaveBeenCalledWith(adminPrincipal, {
      before: 42,
      limit: 5,
      status: 'all',
      type: undefined,
    });
  });

  it('GET / passes recognized status and type filters, and maps unknown status to all', async () => {
    const service = makeService();
    const controller = new NotificationsController(service);
    await controller.list(admin, { status: 'unread', type: 'ticket_critical' });
    expect(service.listForPrincipal).toHaveBeenLastCalledWith(
      adminPrincipal,
      expect.objectContaining({ status: 'unread', type: 'ticket_critical' }),
    );
    await controller.list(admin, { status: 'garbage' });
    expect(service.listForPrincipal).toHaveBeenLastCalledWith(
      adminPrincipal,
      expect.objectContaining({ status: 'all' }),
    );
  });

  it('count, mark-read and read-all use the admin principal', async () => {
    const service = makeService();
    const controller = new NotificationsController(service);
    await expect(controller.unreadCount(admin)).resolves.toEqual({ count: 3 });
    await expect(controller.markRead(admin, 7)).resolves.toEqual({ ok: true });
    expect(service.markRead).toHaveBeenCalledWith(adminPrincipal, 7);
    await expect(controller.markAllRead(admin)).resolves.toEqual({ ok: true });
    expect(service.markAllRead).toHaveBeenCalledWith(adminPrincipal);
  });
});

describe('CitizenNotificationsController', () => {
  it('every route uses the citizen principal', async () => {
    const service = makeService();
    const controller = new CitizenNotificationsController(service);
    await controller.list(citizen, { limit: '10' });
    expect(service.listForPrincipal).toHaveBeenCalledWith(
      citizenPrincipal,
      expect.objectContaining({ limit: 10 }),
    );
    await expect(controller.unreadCount(citizen)).resolves.toEqual({
      count: 3,
    });
    expect(service.getUnreadCount).toHaveBeenCalledWith(citizenPrincipal);
    await controller.markRead(citizen, 4);
    expect(service.markRead).toHaveBeenCalledWith(citizenPrincipal, 4);
    await controller.markAllRead(citizen);
    expect(service.markAllRead).toHaveBeenCalledWith(citizenPrincipal);
  });
});
