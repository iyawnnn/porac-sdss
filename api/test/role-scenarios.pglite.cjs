// Role scenarios run real HTTP handlers, without admission probes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const {
  isolateEnvironment,
  createPermissionApp,
} = require('./helpers/permission-test-app.cjs');
const policy = require('./permissions/route-policy.json');
const moduleRoot = process.env.PGLITE_MODULE_ROOT;
const load = createRequire(path.resolve(moduleRoot, 'package.json'));
const { PGlite } = load('@electric-sql/pglite');
const { postgis } = load('@electric-sql/pglite-postgis');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const supertest = require('supertest');
const bcrypt = require('bcryptjs');
require('reflect-metadata');
// Nest DI needs TypeScript decorator metadata; esbuild/tsx omits it.
require('ts-node').register({
  project: path.join(__dirname, '../tsconfig.json'),
  transpileOnly: true,
});
const { demoBaseline } = require('./helpers/demo-baseline.cjs');
const { admins, citizens } = require('../src/db/schema.ts');
const {
  SessionService,
  SESSION_COOKIE,
  CITIZEN_SESSION_COOKIE,
} = require('../src/auth/session.service.ts');
let groups = 0;
const ok = (message) => console.log('ok ' + ++groups + ' - ' + message);

async function main() {
  const isolation = isolateEnvironment();
  let memory, server, pg, app;
  try {
    memory = await demoBaseline(PGlite, postgis);
    server = new PGLiteSocketServer({ db: memory, host: '127.0.0.1', port: 0 });
    await server.start();
    const port = Number(server.getServerConn().split(':').at(-1));
    assert(![3000, 3001].includes(port));
    isolation.allowedPorts.add(port);
    pg = postgres({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      username: 'postgres',
      password: 'postgres',
      max: 1,
      max_pipeline: 1,
      onnotice: () => {},
      debug: (_id, _q, params) =>
        assert(
          !params.some((p) => p instanceof Date),
          'Raw SQL received JS Date',
        ),
    });
    const db = drizzle(pg);
    // Required by ConfigModule validation only; PG/DB are injected with the
    // already guarded memory socket. No inherited database URL survives.
    process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
    const test = await createPermissionApp(pg, db, policy);
    app = test.app;
    await app.listen(0, '127.0.0.1');
    isolation.allowedPorts.add(app.getHttpServer().address().port);
    const sessions = app.get(SessionService);
    const password = 'Offline-permission-fixture-only-123!';
    const passwordHash = await bcrypt.hash(password, 4);
    let serial = 0,
      requests = 0;
    const actors = { anonymous: null };
    async function makeActor(kind) {
      const email = `permission-${++serial}@fixture.invalid`;
      if (kind === 'citizen') {
        const [row] = await db
          .insert(citizens)
          .values({
            email,
            passwordHash,
            firstName: 'Offline',
            lastName: 'Citizen',
          })
          .returning();
        const claims = {
          citizenId: row.id,
          citizenName: 'Offline Citizen',
          email,
        };
        return {
          kind,
          id: row.id,
          claims,
          cookieName: CITIZEN_SESSION_COOKIE,
          token: await sessions.signCitizenSession(claims),
        };
      }
      const accountType = kind === 'systemAdmin' ? 'SYSTEM_ADMIN' : 'PERSONNEL';
      const office =
        kind === 'systemAdmin' ? null : kind === 'meo' ? 'MEO' : 'MDRRMO';
      const isFocal = kind === 'focal';
      const [row] = await db
        .insert(admins)
        .values({
          email,
          passwordHash,
          firstName: 'Offline',
          lastName: kind,
          accountType,
          office,
          isFocal,
          role:
            kind === 'systemAdmin'
              ? 'system_admin'
              : isFocal
                ? 'focal'
                : 'officer',
        })
        .returning();
      const claims = {
        adminId: row.id,
        adminName: 'Offline ' + kind,
        email,
        accountType,
        office,
        isFocal,
      };
      return {
        kind,
        id: row.id,
        claims,
        cookieName: SESSION_COOKIE,
        token: await sessions.signAdminSession(claims),
      };
    }
    for (const kind of policy.actors.filter((a) => a !== 'anonymous'))
      actors[kind] = await makeActor(kind);
    const [barangay] =
      await pg`SELECT id FROM barangays WHERE ST_Covers(geom,ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326)) LIMIT 1`;
    assert(barangay, 'Reference point outside actual barangay polygons');
    async function fixture(
      office = 'MEO',
      status = 'Reported',
      count = 1,
      owner = actors.citizen,
    ) {
      const category =
        office === 'MEO'
          ? 'Pothole / Road Surface Damage'
          : 'Localized Flooding';
      const created = new Date(Date.now() - 86400000).toISOString();
      const [ticket] =
        await pg`INSERT INTO tickets(category,barangay_id,status,assigned_office,initial_assigned_office,member_count,geom,created_at) VALUES(${category},${barangay.id},${status},${office},${office},${count},ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326),${created}::timestamptz) RETURNING id`;
      const reports = [];
      for (let i = 0; i < count; i++) {
        const title = 'Private fixture ' + ++serial;
        const [report] =
          await pg`INSERT INTO reports(ticket_id,citizen_id,title,description,citizen_severity,submitted_category,image_url,geom,pin_geom,flags,created_at) VALUES(${ticket.id},${owner.id},${title},'PRIVATE_DESCRIPTION','High',${category},'https://image.fixture.invalid/private.jpg',ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326),ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326),ARRAY[]::text[],${created}::timestamptz) RETURNING id`;
        reports.push({ id: report.id, title });
      }
      return { id: ticket.id, reports, category, office, status };
    }
    function request(method, url, actor, options = {}) {
      const client = supertest(app.getHttpServer());
      let req = client[method.toLowerCase()](url)
        .set(
          'x-forwarded-for',
          options.ip ??
            `198.18.${Math.floor(++requests / 250)}.${(requests % 250) + 1}`,
        )
        .timeout({ response: 20000, deadline: 30000 });
      const cookie =
        options.cookie ?? (actor ? actor.cookieName + '=' + actor.token : '');
      if (cookie) req = req.set('Cookie', cookie);
      for (const [key, value] of Object.entries(options.headers ?? {}))
        req = req.set(key, value);
      if (options.body !== undefined) req = req.send(options.body);
      return req;
    }
    function status(response, expected, label) {
      assert.equal(
        response.status,
        expected,
        `${label}: ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    await require('./helpers/role-scenarios.cjs')({
      pg,
      app,
      sessions,
      actors,
      fixture,
      makeActor,
      request,
      status,
      ok,
    });
    console.log(groups + ' role scenario groups passed');
  } finally {
    if (app) await app.close();
    if (pg) await pg.end({ timeout: 2 });
    if (server) await server.stop();
    if (memory) await memory.close();
    isolation.restore();
  }
}
main().catch((error) => {
  console.error(
    error.stack?.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]') ??
      'Offline scenario failure',
  );
  process.exitCode = 1;
});
