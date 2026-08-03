import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE, CITIZEN_SESSION_COOKIE } from '../auth/session.service';
import { NotificationsController } from './notifications.controller';
import type { NotificationsService } from './notifications.service';

function makeReq(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

describe('NotificationsController.resolvePrincipal (via each route)', () => {
  function makeController(sessions: {
    verifyAdminSession: jest.Mock;
    verifyCitizenSession: jest.Mock;
  }) {
    const notifications = {
      listForPrincipal: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getUnreadCount: jest.fn().mockResolvedValue(0),
      markRead: jest.fn().mockResolvedValue(undefined),
      markAllRead: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const controller = new NotificationsController(
      notifications,
      sessions as unknown as ConstructorParameters<typeof NotificationsController>[1],
    );
    return { controller, notifications };
  }

  it('resolves an admin principal from the admin cookie without checking the citizen cookie', async () => {
    const verifyAdminSession = jest.fn().mockResolvedValue({ adminId: 5, office: 'MEO' });
    const verifyCitizenSession = jest.fn();
    const { controller, notifications } = makeController({
      verifyAdminSession,
      verifyCitizenSession,
    });

    await controller.unreadCount(makeReq({ [SESSION_COOKIE]: 'admin-token' }));

    expect(verifyAdminSession).toHaveBeenCalledWith('admin-token');
    expect(verifyCitizenSession).not.toHaveBeenCalled();
    expect(notifications.getUnreadCount).toHaveBeenCalledWith({
      type: 'admin',
      adminId: 5,
      office: 'MEO',
    });
  });

  it('falls back to the citizen cookie when there is no admin cookie', async () => {
    const verifyAdminSession = jest.fn();
    const verifyCitizenSession = jest.fn().mockResolvedValue({ citizenId: 9 });
    const { controller, notifications } = makeController({
      verifyAdminSession,
      verifyCitizenSession,
    });

    await controller.unreadCount(makeReq({ [CITIZEN_SESSION_COOKIE]: 'citizen-token' }));

    expect(verifyAdminSession).not.toHaveBeenCalled();
    expect(verifyCitizenSession).toHaveBeenCalledWith('citizen-token');
    expect(notifications.getUnreadCount).toHaveBeenCalledWith({ type: 'citizen', citizenId: 9 });
  });

  it('falls back to the citizen cookie when the admin cookie is present but invalid', async () => {
    const verifyAdminSession = jest.fn().mockResolvedValue(null);
    const verifyCitizenSession = jest.fn().mockResolvedValue({ citizenId: 9 });
    const { controller, notifications } = makeController({
      verifyAdminSession,
      verifyCitizenSession,
    });

    await controller.unreadCount(
      makeReq({ [SESSION_COOKIE]: 'bad-token', [CITIZEN_SESSION_COOKIE]: 'citizen-token' }),
    );

    expect(notifications.getUnreadCount).toHaveBeenCalledWith({ type: 'citizen', citizenId: 9 });
  });

  it('throws UnauthorizedException when neither cookie is present', async () => {
    const { controller } = makeController({
      verifyAdminSession: jest.fn(),
      verifyCitizenSession: jest.fn(),
    });

    await expect(controller.unreadCount(makeReq({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when both cookies are present but invalid', async () => {
    const { controller } = makeController({
      verifyAdminSession: jest.fn().mockResolvedValue(null),
      verifyCitizenSession: jest.fn().mockResolvedValue(null),
    });

    await expect(
      controller.unreadCount(
        makeReq({ [SESSION_COOKIE]: 'bad', [CITIZEN_SESSION_COOKIE]: 'bad' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('NotificationsController routes', () => {
  function makeAuthedController() {
    const notifications = {
      listForPrincipal: jest.fn().mockResolvedValue({ items: [{ id: 1 }], nextCursor: null }),
      getUnreadCount: jest.fn().mockResolvedValue(3),
      markRead: jest.fn().mockResolvedValue(undefined),
      markAllRead: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const sessions = {
      verifyAdminSession: jest.fn().mockResolvedValue({ adminId: 1, office: 'MEO' }),
      verifyCitizenSession: jest.fn(),
    };
    const controller = new NotificationsController(
      notifications,
      sessions as unknown as ConstructorParameters<typeof NotificationsController>[1],
    );
    const req = makeReq({ [SESSION_COOKIE]: 'admin-token' });
    return { controller, notifications, req };
  }

  it('GET / delegates to listForPrincipal with before/limit parsed from query params', async () => {
    const { controller, notifications, req } = makeAuthedController();

    const result = await controller.list(req, '42', '5');

    expect(notifications.listForPrincipal).toHaveBeenCalledWith(
      { type: 'admin', adminId: 1, office: 'MEO' },
      { before: 42, limit: 5 },
    );
    expect(result).toEqual({ items: [{ id: 1 }], nextCursor: null });
  });

  it('GET /unread-count returns { count }', async () => {
    const { controller, req } = makeAuthedController();
    await expect(controller.unreadCount(req)).resolves.toEqual({ count: 3 });
  });

  it('POST /:id/read delegates to markRead with the parsed id', async () => {
    const { controller, notifications, req } = makeAuthedController();
    await expect(controller.markRead(req, 7)).resolves.toEqual({ ok: true });
    expect(notifications.markRead).toHaveBeenCalledWith(
      { type: 'admin', adminId: 1, office: 'MEO' },
      7,
    );
  });

  it('POST /read-all delegates to markAllRead', async () => {
    const { controller, notifications, req } = makeAuthedController();
    await expect(controller.markAllRead(req)).resolves.toEqual({ ok: true });
    expect(notifications.markAllRead).toHaveBeenCalledWith({
      type: 'admin',
      adminId: 1,

      office: 'MEO',
    });
  });
});

describe('office-targeted admin notifications', () => {
  it('returns a new citizen report notification to an authorized admin', async () => {
    const notification = {
      id: 41,
      recipientType: 'admin',
      recipientOffice: 'MEO',
      type: 'new_citizen_report',
      title: 'New citizen report',
      message: 'Pothole report in Poblacion - Ticket #12, Report #41.',
      href: '/admin/tickets/12',
      readAt: null,
      createdAt: new Date(),
    };
    const notifications = {
      listForPrincipal: jest.fn().mockResolvedValue({ items: [notification], nextCursor: null }),
      getUnreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    } as unknown as NotificationsService;
    const sessions = {
      verifyAdminSession: jest.fn().mockResolvedValue({ adminId: 7, office: 'MEO' }),
      verifyCitizenSession: jest.fn(),
    };
    const controller = new NotificationsController(
      notifications,
      sessions as unknown as ConstructorParameters<typeof NotificationsController>[1],
    );

    await expect(controller.list(makeReq({ [SESSION_COOKIE]: 'admin-token' }))).resolves.toEqual({
      items: [notification],
      nextCursor: null,
    });
  });
});
