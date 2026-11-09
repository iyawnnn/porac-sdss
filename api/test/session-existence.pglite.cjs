// Real migration/PostGIS baseline; memory only, no env file or API server.
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { createRequire } = require('node:module');
require('reflect-metadata');
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, '../tsconfig.json');
require('tsx/cjs');
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite'),
  { postgis } = load('@electric-sql/pglite-postgis'),
  { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres'),
  { drizzle } = require('drizzle-orm/postgres-js'),
  { eq } = require('drizzle-orm'),
  { SignJWT } = require('jose');
const { demoBaseline } = require('./helpers/demo-baseline.cjs');
const { admins, citizens } = require('../src/db/schema.ts');
const {
  SessionService,
  SESSION_COOKIE,
  CITIZEN_SESSION_COOKIE,
} = require('../src/auth/session.service.ts');
const {
  AdminSessionGuard,
} = require('../src/common/guards/admin-session.guard.ts');
const {
  CitizenSessionGuard,
} = require('../src/common/guards/citizen-session.guard.ts');
const secret = 'offline-session-regression-only-at-least-32-bytes';
const issuedAt = Math.floor(Date.now() / 1000) - 120;
let groups = 0;
const ok = (s) => console.log('ok ' + ++groups + ' - ' + s);
async function main() {
  const memory = await demoBaseline(PGlite, postgis);
  let server, pg;
  const queries = [];
  try {
    server = new PGLiteSocketServer({ db: memory, host: '127.0.0.1', port: 0 });
    await server.start();
    const port = Number(server.getServerConn().split(':').at(-1));
    assert(![3000, 3001].includes(port));
    pg = postgres({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      username: 'postgres',
      password: 'postgres',
      max: 1,
      max_pipeline: 1,
      onnotice: () => {},
      debug: (_id, q, p) => {
        assert(!p.some((x) => x instanceof Date), 'JS Date passed to raw SQL');
        queries.push(q);
      },
    });
    const db = drizzle(pg),
      sessions = new SessionService({ get: () => secret }, db);
    const guards = {
      admin: new AdminSessionGuard(sessions),
      citizen: new CitizenSessionGuard(sessions),
    };
    const sign = (kind, payload) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience(kind)
        .setIssuedAt(issuedAt)
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(secret));
    const actors = [];
    for (const [office, isFocal, accountType, role] of [
      ['MEO', false, 'PERSONNEL', 'officer'],
      ['MDRRMO', false, 'PERSONNEL', 'officer'],
      ['MDRRMO', true, 'PERSONNEL', 'focal'],
      [null, false, 'SYSTEM_ADMIN', 'system_admin'],
    ]) {
      const [a] = await db
        .insert(admins)
        .values({
          firstName: 'Offline',
          lastName: 'Staff',
          email: 'session-' + actors.length + '@fixture.invalid',
          passwordHash: 'unused-test-hash',
          office,
          isFocal,
          accountType,
          role,
        })
        .returning();
      const claims = {
        adminId: a.id,
        email: a.email,
        adminName: 'Offline Staff',
        office,
        isFocal,
        accountType,
      };
      actors.push({ id: a.id, claims, token: await sign('admin', claims) });
    }
    const [c] = await db
      .insert(citizens)
      .values({
        firstName: 'Offline',
        lastName: 'Citizen',
        email: 'session-citizen@fixture.invalid',
        passwordHash: 'unused-test-hash',
      })
      .returning();
    const citizenClaims = {
        citizenId: c.id,
        email: c.email,
        citizenName: 'Offline Citizen',
      },
      citizenToken = await sign('citizen', citizenClaims),
      admin = actors[0];
    ok(
      'real 0000-0050/PostGIS baseline and account rows through drizzle, without seed commands',
    );
    async function check(kind, token, allowed, queryCount = 1) {
      const req = {
        cookies: token
          ? {
              [kind === 'admin' ? SESSION_COOKIE : CITIZEN_SESSION_COOKIE]:
                token,
            }
          : {},
      };
      const ctx = { switchToHttp: () => ({ getRequest: () => req }) };
      queries.length = 0;
      if (allowed) {
        assert.equal(await guards[kind].canActivate(ctx), true);
        assert(req[kind === 'admin' ? 'adminSession' : 'citizenSession']);
      } else
        await assert.rejects(
          () => guards[kind].canActivate(ctx),
          (e) => {
            assert.equal(e.getStatus?.(), 401);
            assert.deepEqual(e.getResponse(), {
              message: 'Unauthorized',
              statusCode: 401,
            });
            return true;
          },
        );
      assert.equal(
        queries.length,
        queryCount,
        'Account verification changed query count: ' + kind,
      );
    }
    for (const a of actors) await check('admin', a.token, true);
    ok('all four valid staff identities stay valid with exactly one SELECT');
    await check('citizen', citizenToken, true);
    ok('valid citizen stays valid with exactly one SELECT');
    const missing = [];
    for (const kind of ['admin', 'citizen']) {
      const claims =
        kind === 'admin'
          ? { ...admin.claims, adminId: 2147483000 }
          : { ...citizenClaims, citizenId: 2147483000 };
      try {
        await check(kind, await sign(kind, claims), false);
      } catch (error) {
        missing.push(kind);
        console.error(
          'Missing-account regression failed:',
          kind,
          error.message,
        );
      }
    }
    assert.deepEqual(
      missing,
      [],
      'Both missing-account tokens must use the normal 401',
    );
    ok(
      'missing admin and citizen both rejected by real guards with the generic 401 and one SELECT',
    );
    await db
      .update(admins)
      .set({ isActive: false })
      .where(eq(admins.id, admin.id));
    await check('admin', admin.token, false);
    await db
      .update(admins)
      .set({ isActive: true })
      .where(eq(admins.id, admin.id));
    ok(
      'admin deactivation remains a generic 401 without needing a revocation timestamp',
    );
    await db
      .update(admins)
      .set({ sessionValidAfter: new Date((issuedAt + 1) * 1000) })
      .where(eq(admins.id, admin.id));
    await db
      .update(citizens)
      .set({ sessionValidAfter: new Date((issuedAt + 1) * 1000) })
      .where(eq(citizens.id, c.id));
    await check('admin', admin.token, false);
    await check('citizen', citizenToken, false);
    ok('both pre-session_valid_after tokens remain invalid, one SELECT each');
    await db
      .update(admins)
      .set({ sessionValidAfter: new Date(issuedAt * 1000 + 500) })
      .where(eq(admins.id, admin.id));
    await db
      .update(citizens)
      .set({ sessionValidAfter: new Date(issuedAt * 1000 + 500) })
      .where(eq(citizens.id, c.id));
    await check('admin', admin.token, true);
    await check('citizen', citizenToken, false);
    ok(
      'existing admin whole-second and citizen millisecond boundary behavior preserved',
    );
    await db
      .update(admins)
      .set({ sessionValidAfter: new Date((issuedAt - 1) * 1000) })
      .where(eq(admins.id, admin.id));
    await db
      .update(citizens)
      .set({ sessionValidAfter: new Date((issuedAt - 1) * 1000) })
      .where(eq(citizens.id, c.id));
    await check('admin', admin.token, true);
    await check('citizen', citizenToken, true);
    ok('tokens after session_valid_after remain valid');
    // These unreferenced fixtures have no audit records; deletion is memory-only.
    await db.delete(admins).where(eq(admins.id, admin.id));
    await check('admin', admin.token, false);
    ok(
      'previously valid admin token becomes the same 401 after its actual account deletion',
    );
    await db.delete(citizens).where(eq(citizens.id, c.id));
    await check('citizen', citizenToken, false);
    ok(
      'previously valid citizen token becomes the same 401 after its actual account deletion',
    );
    for (const kind of ['admin', 'citizen']) {
      await check(kind, undefined, false, 0);
      await check(kind, 'malformed-token', false, 0);
      await check(
        kind,
        kind === 'admin' ? citizenToken : admin.token,
        false,
        0,
      );
    }
    assert.equal(
      (await pg`SELECT count(*)::int n FROM admin_audit_events`)[0].n,
      0,
    );
    ok(
      'invalid/missing/wrong-audience cookies keep the same 401, zero queries; verification writes no audit',
    );
    console.log(groups + ' session existence groups passed');
  } finally {
    if (pg) await pg.end({ timeout: 2 });
    if (server) await server.stop();
    await memory.close();
  }
}
main().catch((e) => {
  console.error(
    e.stack?.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]') ||
      'Offline session check failed',
  );
  process.exitCode = 1;
});
