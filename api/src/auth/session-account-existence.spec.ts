import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SignJWT } from 'jose';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import {
  SessionService,
  SESSION_COOKIE,
  CITIZEN_SESSION_COOKIE,
  type AdminSession,
  type CitizenSession,
} from './session.service';
import type { Env } from '../config/env';

// Test-only transport probes, not the permission matrix. Real guards and JWT
// verification use an isolated account lookup; no AppModule/env/database loads.
@Controller('session-regression')
class SessionProbeController {
  @Get('admin')
  @UseGuards(AdminSessionGuard)
  admin() {
    return { ok: true };
  }
  @Get('citizen')
  @UseGuards(CitizenSessionGuard)
  citizen() {
    return { ok: true };
  }
}
const secret = 'session-regression-only-key-at-least-32-bytes';
const admin: AdminSession = {
  adminId: 17,
  email: 'admin@fixture.invalid',
  adminName: 'Test admin',
  accountType: 'PERSONNEL',
  office: 'MEO',
  isFocal: false,
};
const citizen: CitizenSession = {
  citizenId: 23,
  email: 'citizen@fixture.invalid',
  citizenName: 'Test citizen',
};
const activeAdmin = {
  sessionValidAfter: null,
  isActive: true,
  accountType: admin.accountType,
  office: admin.office,
  isFocal: admin.isFocal,
};
const issuedAt = Math.floor(Date.now() / 1000) - 60;

describe('account existence uses the normal invalid-session response', () => {
  let app: INestApplication<App>,
    sessions: SessionService,
    row: object | undefined;
  const select = jest.fn(() => ({
    from: () => ({ where: () => Promise.resolve(row ? [row] : []) }),
  }));
  beforeAll(async () => {
    const config = { get: () => secret } as unknown as ConfigService<Env, true>;
    sessions = new SessionService(config, {
      select,
    } as unknown as PostgresJsDatabase);
    const module = await Test.createTestingModule({
      controllers: [SessionProbeController],
      providers: [
        AdminSessionGuard,
        CitizenSessionGuard,
        { provide: SessionService, useValue: sessions },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    select.mockClear();
    row = undefined;
  });
  const token = (kind: 'admin' | 'citizen') =>
    new SignJWT({ ...(kind === 'admin' ? admin : citizen) })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(kind)
      .setIssuedAt(issuedAt)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));
  for (const kind of ['admin', 'citizen'] as const) {
    const cookie = kind === 'admin' ? SESSION_COOKIE : CITIZEN_SESSION_COOKIE;
    const valid = () =>
      kind === 'admin' ? { ...activeAdmin } : { sessionValidAfter: null };
    const get = (value?: string) => {
      const req = request(app.getHttpServer()).get(
        '/session-regression/' + kind,
      );
      return value ? req.set('Cookie', cookie + '=' + value) : req;
    };
    async function invalid(value: string, queries: number) {
      const anonymous = await get();
      expect(anonymous.status).toBe(401);
      const response = await get(value);
      expect(response.status).toBe(401);
      expect(response.body).toEqual(anonymous.body);
      expect(response.body).toEqual({
        message: 'Unauthorized',
        statusCode: 401,
      });
      expect(select).toHaveBeenCalledTimes(queries);
    }
    it(
      kind +
        ': a signed token for a missing row is indistinguishable from an invalid session',
      async () => {
        row = undefined;
        await invalid(await token(kind), 1);
      },
    );
    it(
      kind + ': an existing valid row keeps working with exactly one lookup',
      async () => {
        row = valid();
        const response = await get(await token(kind));
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
        expect(select).toHaveBeenCalledTimes(1);
      },
    );
    it(
      kind +
        ': a token older than session_valid_after uses the same 401 and one lookup',
      async () => {
        row = {
          ...valid(),
          sessionValidAfter: new Date((issuedAt + 1) * 1000),
        };
        await invalid(await token(kind), 1);
      },
    );
    it(
      kind + ': a token newer than session_valid_after still works',
      async () => {
        row = {
          ...valid(),
          sessionValidAfter: new Date((issuedAt - 1) * 1000),
        };
        expect((await get(await token(kind))).status).toBe(200);
        expect(select).toHaveBeenCalledTimes(1);
      },
    );
    it(
      kind + ': malformed, expired and wrong-audience tokens keep the same 401',
      async () => {
        row = valid();
        await invalid('invalid-token', 0);
        const expired = await new SignJWT({
          ...(kind === 'admin' ? admin : citizen),
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setAudience(kind)
          .setIssuedAt(issuedAt)
          .setExpirationTime(issuedAt + 1)
          .sign(new TextEncoder().encode(secret));
        await invalid(expired, 0);
        await invalid(await token(kind === 'admin' ? 'citizen' : 'admin'), 0);
      },
    );
  }
  it('admin deactivation remains a generic 401 with one lookup', async () => {
    row = { ...activeAdmin, isActive: false };
    const response = await request(app.getHttpServer())
      .get('/session-regression/admin')
      .set('Cookie', SESSION_COOKIE + '=' + (await token('admin')));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
    expect(select).toHaveBeenCalledTimes(1);
  });
  it('preserves the different existing subsecond revocation boundaries', async () => {
    row = {
      ...activeAdmin,
      sessionValidAfter: new Date(issuedAt * 1000 + 500),
    };
    const a = await request(app.getHttpServer())
      .get('/session-regression/admin')
      .set('Cookie', SESSION_COOKIE + '=' + (await token('admin')));
    expect(a.status).toBe(200);
    row = { sessionValidAfter: new Date(issuedAt * 1000 + 500) };
    const c = await request(app.getHttpServer())
      .get('/session-regression/citizen')
      .set('Cookie', CITIZEN_SESSION_COOKIE + '=' + (await token('citizen')));
    expect(c.status).toBe(401);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
