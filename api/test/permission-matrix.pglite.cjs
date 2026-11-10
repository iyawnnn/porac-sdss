// Full real AppModule + migration/PostGIS baseline, isolated from env files
// and all external network. Admission probes are separate from handler tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const {
  isolateEnvironment,
  createPermissionApp,
  SECRET,
  CRON_SECRET,
  PROBE_HEADER,
} = require('./helpers/permission-test-app.cjs');
const {
  validatePolicy,
  assertConditionCoverage,
} = require('./helpers/permission-route-catalog.cjs');
const policy = require('./permissions/route-policy.json');
const moduleRoot = process.env.PGLITE_MODULE_ROOT;
const load = createRequire(path.resolve(moduleRoot, 'package.json'));
const { PGlite } = load('@electric-sql/pglite');
const { postgis } = load('@electric-sql/pglite-postgis');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const supertest = require('supertest');
const { SignJWT } = require('jose');
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
  CITIZEN_REAUTH_COOKIE,
} = require('../src/auth/session.service.ts');
let groups = 0;
const ok = (message) => console.log('ok ' + ++groups + ' - ' + message);

async function main() {
  validatePolicy(policy);
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
    const otherCitizen = await makeActor('citizen');
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
    async function notification(actor, office) {
      const [row] =
        await pg`INSERT INTO notifications(recipient_type,recipient_id,recipient_office,type,title,message) VALUES(${actor?.kind === 'citizen' ? 'citizen' : 'admin'},${actor?.id ?? null},${office ?? null},'status_updated',${'Private notice ' + ++serial},'PRIVATE_NOTICE') RETURNING id,title`;
      return row;
    }
    const notices = {};
    for (const name of policy.actors.filter((a) => a !== 'anonymous'))
      notices[name] = await notification(actors[name]);
    const own = await fixture(),
      foreign = await fixture('MDRRMO'),
      theirs = await fixture('MEO', 'Resolved', 1, otherCitizen);
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
      if (options.probe) req = req.set('x-permission-probe', PROBE_HEADER);
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
    const done = new Set();
    ok(
      'real 0000-0050/PostGIS baseline, real AppModule/DiscoveryService, isolated local adapters and live guards',
    );
    let cells = 0;
    for (const row of policy.routes)
      for (const kind of policy.actors) {
        let actor = actors[kind];
        // Real logout must not revoke the shared fixture used by later cells.
        if (
          actor &&
          row.key.endsWith('/logout') &&
          (kind === 'citizen') === row.key.includes('/citizens/')
        )
          actor = await makeActor(kind);
        let [method, url] = row.key.split(' ');
        url = url
          .replace(':provider', 'google')
          .replace(':ref', 'PRC-2000-000001')
          .replace(/:reportId\b/g, String(own.reports[0].id))
          .replace(
            /:id\b/g,
            String(
              row.controller === 'NotificationsController'
                ? (notices[kind]?.id ?? 2147483000)
                : own.id,
            ),
          );
        const response = await request(method, url, actor, { probe: true });
        const expected = row.expected[kind];
        status(
          response,
          ['ADMIT', 'PUBLIC', '200'].includes(expected)
            ? 200
            : expected === 'REDIRECT'
              ? 302
              : Number(expected),
          row.key + ' / ' + kind,
        );
        if (
          row.execution === 'probe' &&
          ['ADMIT', 'PUBLIC'].includes(expected)
        ) {
          assert.equal(
            response.body.permissionProbe,
            row.key,
            'Handler execution must not be confused with admission',
          );
          assert.equal(
            response.body.admin,
            row.guards.includes('AdminSessionGuard') ? actor.id : null,
          );
          assert.equal(
            response.body.citizen,
            row.guards.includes('CitizenSessionGuard') ? actor.id : null,
          );
        }
        if (expected === '401')
          assert.deepEqual(response.body, {
            message: 'Unauthorized',
            statusCode: 401,
          });
        cells++;
      }
    assert.equal(cells, 564);
    ok(
      '94 independent route rows x six identities = 564 HTTP admission/inline-auth cells, no guard overrides',
    );

    const context = {
      pg,
      db,
      app,
      test,
      sessions,
      actors,
      otherCitizen,
      own,
      foreign,
      theirs,
      fixture,
      notification,
      notices,
      makeActor,
      request,
      status,
      password,
      done,
    };
    await boundaries(context);
    assertConditionCoverage(policy, done);
    ok(
      'every policy-declared conditional boundary executed; no unclassified routes or conditions',
    );
    console.log(groups + ' permission groups passed; ' + cells + ' base cells');
    if (process.env.PERMISSION_REPORT_FILE)
      fs.writeFileSync(
        process.env.PERMISSION_REPORT_FILE,
        JSON.stringify(
          {
            groups,
            cells,
            routes: test.routes.length,
            conditions: [...done].sort(),
          },
          null,
          2,
        ),
      );
  } finally {
    if (app) await app.close();
    if (pg) await pg.end({ timeout: 2 });
    if (server) await server.stop();
    if (memory) await memory.close();
    isolation.restore();
  }
}

async function boundaries(c) {
  const {
    pg,
    actors,
    own,
    foreign,
    theirs,
    otherCitizen,
    fixture,
    notification,
    makeActor,
    request,
    status,
    done,
  } = c;
  const tables = (
    await pg`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'spatial_ref_sys' ORDER BY tablename`
  ).map((r) => r.tablename);
  async function fingerprint() {
    const result = {};
    for (const table of tables)
      result[table] = (
        await pg`SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) hash FROM ${pg(table)} r`
      )[0].hash;
    return result;
  }
  async function denied(method, url, actor, body, expected = 403) {
    const before = await fingerprint();
    const res = await request(method, url, actor, { body });
    status(res, expected, method + ' ' + url + ' / denied ' + actor.kind);
    assert.deepEqual(
      await fingerprint(),
      before,
      'Denied write changed resource/history/audit: ' + url,
    );
    return res;
  }
  async function allowed(method, url, actor, body) {
    const res = await request(method, url, actor, { body });
    assert(
      [200, 201].includes(res.status),
      method + ' ' + url + ': ' + res.status + ' ' + JSON.stringify(res.body),
    );
    return res;
  }
  async function skipped(url, actor, body) {
    const before = await fingerprint();
    const res = await allowed('POST', url, actor, body);
    assert.deepEqual(res.body.ok, []);
    assert.equal(res.body.skipped.length, 1);
    assert.equal(res.body.skipped[0].id, body.ticketIds[0]);
    assert.match(res.body.skipped[0].reason, /access|office/i);
    assert.deepEqual(
      await fingerprint(),
      before,
      'Bulk refusal changed records',
    );
  }
  async function assessment(t, actor) {
    return allowed('POST', `/admin/tickets/${t.id}/assessment`, actor, {
      assessedConditions: 'Private field observation',
      safetyImplications: 'PRIVATE_SAFETY',
      operationalConstraints: ['manpower'],
      recommendedAction: 'Private action',
      interimMitigation: 'Private mitigation',
    });
  }
  async function workOrder(t, actor) {
    await assessment(t, actor);
    const res = await allowed('POST', '/admin/work-orders', actor, {
      ticketId: t.id,
      title: 'Private Work Order ' + t.id,
      notes: 'PRIVATE_WORK_ORDER',
      assignedAdminId: actor.id,
    });
    return res.body.workOrder ?? res.body;
  }
  const officeTicket = { meo: own, mdrrmo: foreign },
    orders = {};
  for (const kind of ['meo', 'mdrrmo'])
    orders[kind] = await workOrder(officeTicket[kind], actors[kind]);
  const auditPrefix =
    await pg`SELECT id,to_jsonb(e) snapshot FROM admin_audit_events e ORDER BY id`;
  assert(auditPrefix.length > 0, 'Real workflow must produce audit records');
  ok(
    'both offices can assess and create real Work Orders on their own tickets',
  );

  for (const kind of ['meo', 'mdrrmo']) {
    const actor = actors[kind],
      ownTicket = officeTicket[kind],
      other = officeTicket[kind === 'meo' ? 'mdrrmo' : 'meo'];
    for (const office of ['MEO', 'MDRRMO', 'all']) {
      const queue = await allowed(
        'GET',
        '/admin/tickets?office=' + office,
        actor,
      );
      assert(queue.body.tickets.some((t) => t.id === ownTicket.id));
      assert(
        queue.body.tickets.every(
          (t) => t.assigned_office === actor.claims.office,
        ),
      );
      const geo = await allowed(
        'GET',
        '/admin/tickets/geo?office=' + office,
        actor,
      );
      assert(geo.body.some((t) => t.id === ownTicket.id));
      assert(geo.body.every((t) => t.assigned_office === actor.claims.office));
      const list = await allowed(
        'GET',
        '/admin/work-orders?office=' + office,
        actor,
      );
      assert(list.body.workOrders.some((w) => w.ticket_id === ownTicket.id));
      assert(
        list.body.workOrders.every(
          (w) => w.assigned_office === actor.claims.office,
        ),
      );
    }
    for (const suffix of ['', '/priority-context', '/related-candidates'])
      status(
        await request('GET', `/admin/tickets/${other.id}${suffix}`, actor),
        403,
        'Foreign ticket read',
      );
    status(
      await request(
        'GET',
        `/admin/work-orders/${orders[kind === 'meo' ? 'mdrrmo' : 'meo'].id}`,
        actor,
      ),
      403,
      'Foreign Work Order read',
    );
  }
  done.add('ticket-office');
  done.add('work-order-office');
  ok(
    'MEO/MDRRMO list and geo filters clamp to own office; foreign detail/context/Work Order reads refuse',
  );

  for (const kind of ['meo', 'mdrrmo']) {
    const actor = actors[kind],
      otherKind = kind === 'meo' ? 'mdrrmo' : 'meo',
      other = officeTicket[otherKind],
      wo = orders[otherKind];
    for (const [tail, body] of [
      ['assessment', { assessedConditions: 'Private unauthorized assessment' }],
      ['status', {}],
      ['return-to-review', { reason: 'Invalid referral found' }],
      ['reassign', { toOffice: actor.claims.office, reason: 'Office test' }],
      ['refer', { agency: 'Outside fixture agency', reason: 'Office test' }],
      ['reject', { reason: 'Office test' }],
      ['hazard-information/retry', {}],
      ['rainfall-context/refresh', {}],
    ])
      await denied('POST', `/admin/tickets/${other.id}/${tail}`, actor, body);
    await skipped('/admin/tickets/bulk/advance-status', actor, {
      ticketIds: [other.id],
    });
    await skipped('/admin/tickets/bulk/reassign', actor, {
      ticketIds: [other.id],
      toOffice: actor.claims.office,
      reason: 'Office test',
    });
    await denied('POST', '/admin/work-orders', actor, {
      ticketId: other.id,
      title: 'Unauthorized',
    });
    await skipped('/admin/work-orders/bulk', actor, {
      ticketIds: [other.id],
      title: 'Unauthorized',
    });
    await denied('PATCH', `/admin/work-orders/${wo.id}`, actor, {
      title: 'Unauthorized',
    });
    await denied('POST', `/admin/work-orders/${wo.id}/status`, actor, {
      status: 'in_progress',
    });
    await denied('POST', `/admin/work-orders/${wo.id}/cancel`, actor, {
      reason: 'Unauthorized',
    });
    for (const [tail, body] of [
      [
        'category',
        {
          category: 'Damaged Manhole Cover',
          reason: 'Office test',
        },
      ],
      ['location', { lat: 15.0735, lng: 120.5407, reason: 'Office test' }],
    ])
      await denied(
        'POST',
        `/admin/ticket-corrections/${other.id}/${tail}`,
        actor,
        body,
      );
    const a = await fixture(other.office, 'Reported', 2),
      b = await fixture(other.office);
    for (const [action, body] of [
      [
        'merge',
        { survivorTicketId: a.id, mergedTicketId: b.id, reason: 'Office test' },
      ],
      ['remove-report', { reportId: a.reports[0].id, reason: 'Office test' }],
      [
        'regroup-report',
        { reportId: a.reports[0].id, toTicketId: b.id, reason: 'Office test' },
      ],
    ])
      await denied('POST', '/admin/ticket-grouping/' + action, actor, body);
  }
  done.add('foreign-writes');
  ok(
    'both-office write refusals cover ticket/bulk/context/assessment/Work Order/grouping/correction paths without resource/history/audit changes',
  );

  for (const kind of ['focal', 'systemAdmin']) {
    for (const method of ['POST', 'PATCH']) {
      const url =
        method === 'POST'
          ? '/admin/work-orders'
          : '/admin/work-orders/' + orders.meo.id;
      await denied(method, url, actors[kind], {
        ticketId: own.id,
        title: 'Forbidden role',
      });
    }
    for (const tail of ['status', 'cancel'])
      await denied(
        'POST',
        `/admin/work-orders/${orders.meo.id}/${tail}`,
        actors[kind],
        { status: 'in_progress', reason: 'Forbidden role' },
      );
    await denied('POST', `/admin/tickets/${own.id}/assessment`, actors[kind], {
      assessedConditions: 'Forbidden role',
    });
  }
  ok(
    'Focal and System Admin cannot create/edit/cancel Work Orders or assessments; no writes/audit',
  );

  const grouped = [];
  for (const action of ['merge', 'remove-report', 'regroup-report']) {
    // MEO is outside the Focal account's MDRRMO office. This positive
    // control prevents an office-only check masquerading as the state rule.
    const ma = await fixture('MEO', 'Reported', 2),
      mb = await fixture('MEO');
    const meoBody =
      action === 'merge'
        ? { survivorTicketId: ma.id, mergedTicketId: mb.id }
        : action === 'remove-report'
          ? { reportId: ma.reports[0].id }
          : { reportId: ma.reports[0].id, toTicketId: mb.id };
    await allowed('POST', '/admin/ticket-grouping/' + action, actors.focal, {
      ...meoBody,
      reason: 'Municipality-wide intake review',
    });
    const a = await fixture('MDRRMO', 'Reported', 2),
      b = await fixture('MDRRMO');
    const body =
      action === 'merge'
        ? { survivorTicketId: a.id, mergedTicketId: b.id }
        : action === 'remove-report'
          ? { reportId: a.reports[0].id }
          : { reportId: a.reports[0].id, toTicketId: b.id };
    const res = await allowed(
      'POST',
      '/admin/ticket-grouping/' + action,
      actors.focal,
      { ...body, reason: 'Reviewed related fixture' },
    );
    grouped.push(res.body);
    for (const state of ['Under Review', 'active-work-order']) {
      const from = await fixture(
          'MDRRMO',
          state === 'Under Review' ? state : 'Reported',
          2,
        ),
        to = await fixture('MDRRMO');
      if (state === 'active-work-order') await workOrder(from, actors.mdrrmo);
      const bad =
        action === 'merge'
          ? { survivorTicketId: from.id, mergedTicketId: to.id }
          : action === 'remove-report'
            ? { reportId: from.reports[0].id }
            : { reportId: from.reports[0].id, toTicketId: to.id };
      await denied('POST', '/admin/ticket-grouping/' + action, actors.focal, {
        ...bad,
        reason: 'Review fixture',
      });
    }
  }
  assert.equal(grouped.length, 3);
  done.add('focal-grouping');
  ok(
    'existing Focal merge/remove/regroup allowed on eligible Reported tickets; Under Review/active-Work-Order actions refuse unchanged',
  );

  for (const action of ['reassign', 'refer', 'category', 'location']) {
    const reported = await fixture();
    const url = (t) =>
      ['reassign', 'refer'].includes(action)
        ? `/admin/intake/${t.reports[0].id}/${action}`
        : `/admin/ticket-corrections/${t.id}/${action}`;
    const body = {
      reason: 'Intake review',
      ...(action === 'reassign'
        ? { toOffice: 'MDRRMO' }
        : action === 'refer'
          ? { agency: 'Outside fixture agency' }
          : action === 'category'
            ? { category: 'Damaged Manhole Cover' }
            : { lat: 15.0735, lng: 120.5407 }),
    };
    await allowed('POST', url(reported), actors.focal, body);
    for (const state of ['Under Review', 'active-work-order']) {
      const t = await fixture(
        'MDRRMO',
        state === 'Under Review' ? state : 'Reported',
      );
      if (state === 'active-work-order') await workOrder(t, actors.mdrrmo);
      await denied('POST', url(t), actors.focal, body);
    }
  }
  const intake = await allowed('GET', '/admin/intake', actors.focal);
  assert(intake.body.some((r) => r.reportId === own.reports[0].id));
  assert(intake.body.some((r) => r.reportId === foreign.reports[0].id));
  const ackTicket = await fixture();
  await allowed(
    'POST',
    `/admin/intake/${ackTicket.reports[0].id}/acknowledge`,
    actors.focal,
    { remarks: 'PRIVATE_ACK_REMARK' },
  );
  await allowed(
    'POST',
    `/admin/intake/${ackTicket.reports[0].id}/severity-screening`,
    actors.focal,
    { status: 'NO_CONCERN_NOTED', remarks: 'PRIVATE_SCREENING' },
  );
  const dashboard = await allowed(
    'GET',
    '/admin/focal-dashboard',
    actors.focal,
  );
  assert.equal(typeof dashboard.body.newReports, 'number');
  done.add('focal-intake');
  done.add('focal-correction');
  ok(
    'municipality-wide Focal intake, acknowledgment and screening; current initial-state routing/correction permissions preserved',
  );

  const merged = await fixture(),
    survivor = await fixture();
  await allowed('POST', '/admin/ticket-grouping/merge', actors.meo, {
    survivorTicketId: survivor.id,
    mergedTicketId: merged.id,
    reason: 'Confirmed related report',
  });
  const queue = await allowed('GET', '/admin/tickets', actors.meo);
  assert(!queue.body.tickets.some((t) => t.id === merged.id));
  const geo = await allowed('GET', '/admin/tickets/geo', actors.meo);
  assert(!geo.body.some((t) => t.id === merged.id));
  await denied(
    'POST',
    `/admin/tickets/${merged.id}/assessment`,
    actors.meo,
    { assessedConditions: 'Merged fixture' },
    409,
  );
  ok(
    'merged-away records leave active queues/map and refuse operational writes',
  );

  const flagged = {};
  for (const kind of ['meo', 'mdrrmo']) {
    const t = await fixture(actors[kind].claims.office);
    flagged[kind] = t;
    await pg`UPDATE reports SET flags=ARRAY['LOCATION_MISMATCH']::text[] WHERE id=${t.reports[0].id}`;
    await pg`UPDATE tickets SET flagged=true WHERE id=${t.id}`;
    const priority = await fixture(actors[kind].claims.office);
    await pg`UPDATE reports SET citizen_severity='Critical' WHERE ticket_id=${priority.id}`;
    await pg`UPDATE tickets SET created_at=${new Date(Date.now() - 8 * 86400000).toISOString()}::timestamptz WHERE id=${priority.id}`;
  }
  // Different office populations and nonempty flagged/priority fixtures
  // prevent equal empty results from making scope assertions pass.
  for (let i = 0; i < 7; i++) await fixture('MDRRMO');
  await allowed('GET', '/admin/tickets', actors.meo);
  for (const kind of ['meo', 'mdrrmo']) {
    const actor = actors[kind],
      other = officeTicket[kind === 'meo' ? 'mdrrmo' : 'meo'];
    const directory = await allowed(
      'GET',
      '/admin/admins/directory?office=all',
      actor,
    );
    assert(directory.body.some((a) => a.id === actor.id));
    assert(
      directory.body.every(
        (a) => a.office === actor.claims.office && a.is_focal === false,
      ),
    );
    const dashboardOwn = await allowed(
      'GET',
      '/admin/dashboard?office=' + actor.claims.office,
      actor,
    );
    const dashboardOther = await allowed(
      'GET',
      '/admin/dashboard?office=' + other.office,
      actor,
    );
    assert.deepEqual(dashboardOther.body.kpis, dashboardOwn.body.kpis);
    for (const endpoint of [
      '/admin/moderation',
      '/admin/moderation/stats',
      '/admin/barangay-insights',
      '/admin/barangays/geo',
    ]) {
      const a = await allowed(
        'GET',
        endpoint + '?office=' + actor.claims.office,
        actor,
      );
      const b = await allowed(
        'GET',
        endpoint + '?office=' + other.office,
        actor,
      );
      assert.deepEqual(
        b.body,
        a.body,
        endpoint + ' accepted a foreign office filter',
      );
      if (endpoint === '/admin/moderation') {
        assert(JSON.stringify(b.body).includes(flagged[kind].reports[0].title));
        assert(
          !JSON.stringify(b.body).includes(
            flagged[kind === 'meo' ? 'mdrrmo' : 'meo'].reports[0].title,
          ),
        );
      }
    }
    for (const name of [
      'tickets',
      'flagged',
      'work-orders',
      'submitted-reports',
      'operational-assessments',
      'priority-incidents',
    ]) {
      const a = await allowed(
        'GET',
        `/admin/reports/${name}.csv?office=${actor.claims.office}`,
        actor,
      );
      const b = await allowed(
        'GET',
        `/admin/reports/${name}.csv?office=${other.office}`,
        actor,
      );
      assert.equal(
        b.text,
        a.text,
        'Export accepted a foreign office filter: ' + name,
      );
      assert(
        b.text.trim().split(/\r?\n/).length > 1,
        'Export must exercise seeded rows: ' + name,
      );
      assert(
        !b.text.includes(other.reports[0].title),
        'Foreign report title in export',
      );
    }
  }
  done.add('office-lists');
  done.add('office-exports');
  ok(
    'dashboard, maps, directory, moderation, insights and all six CSVs clamp foreign office filters through real services',
  );

  const citizen = actors.citizen;
  await allowed(
    'POST',
    `/admin/intake/${own.reports[0].id}/acknowledge`,
    actors.focal,
    { remarks: 'PRIVATE_ACK_REMARK' },
  );
  await allowed(
    'POST',
    `/admin/intake/${own.reports[0].id}/severity-screening`,
    actors.focal,
    { status: 'NO_CONCERN_NOTED', remarks: 'PRIVATE_SCREENING' },
  );
  const detail = await allowed(
    'GET',
    `/reports/mine/${own.reports[0].id}`,
    citizen,
  );
  const detailText = JSON.stringify(detail.body);
  const privateKeys = new Set([
    'workorders',
    'operationalassessment',
    'hazardinformation',
    'rainfallcontext',
    'severityscreeningstatus',
    'severityscreeningremarks',
    'assessedconditions',
    'safetyimplications',
    'acknowledgedbyname',
    'screenedbyname',
  ]);
  function noPrivateFields(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert(
        !privateKeys.has(key.toLowerCase().replace(/_/g, '')),
        'Internal citizen response field: ' + key,
      );
      noPrivateFields(item);
    }
  }
  noPrivateFields(detail.body);
  for (const privateValue of [
    'PRIVATE_WORK_ORDER',
    'PRIVATE_SAFETY',
    'PRIVATE_SCREENING',
    'PRIVATE_ACK_REMARK',
  ])
    assert(!detailText.includes(privateValue));
  for (const value of [theirs.reports[0].id, 2147483000])
    status(
      await request('GET', `/reports/mine/${value}`, citizen),
      404,
      'Other/missing report detail',
    );
  const refs =
    await pg`SELECT id,tracking_reference FROM reports WHERE id IN(${own.reports[0].id},${theirs.reports[0].id})`;
  const ownRef = refs.find(
      (r) => r.id === own.reports[0].id,
    ).tracking_reference,
    otherRef = refs.find(
      (r) => r.id === theirs.reports[0].id,
    ).tracking_reference;
  assert.equal(
    (await allowed('GET', '/reports/mine/by-reference/' + ownRef, citizen)).body
      .id,
    own.reports[0].id,
  );
  const missingRef = await request(
      'GET',
      '/reports/mine/by-reference/PRC-2000-999999',
      citizen,
    ),
    wrongRef = await request(
      'GET',
      '/reports/mine/by-reference/' + otherRef,
      citizen,
    );
  status(missingRef, 404, 'Missing reference');
  status(wrongRef, 404, 'Foreign reference');
  assert.deepEqual(wrongRef.body, missingRef.body);
  for (const action of ['confirm-resolution', 'dispute'])
    await denied(
      'POST',
      `/reports/mine/${theirs.reports[0].id}/${action}`,
      citizen,
      { reason: 'Private dispute' },
      404,
    );
  const resolved = await fixture('MEO', 'Resolved', 2);
  await pg`UPDATE reports SET citizen_id=${otherCitizen.id} WHERE id=${resolved.reports[1].id}`;
  await allowed(
    'POST',
    `/reports/mine/${resolved.reports[0].id}/confirm-resolution`,
    citizen,
  );
  await allowed(
    'POST',
    `/reports/mine/${resolved.reports[1].id}/dispute`,
    otherCitizen,
    { reason: 'Still needs attention' },
  );
  assert.equal(
    (
      await pg`SELECT count(*)::int n FROM resolution_feedback WHERE ticket_id=${resolved.id}`
    )[0].n,
    2,
  );
  done.add('citizen-ownership');
  ok(
    'citizen own/other/missing detail/reference/feedback boundaries and independent real two-citizen feedback',
  );

  await fixture('MDRRMO', 'Reported', 1, otherCitizen);
  const map = await allowed('GET', '/public-map', citizen);
  const keys = [
    'barangay_name',
    'category',
    'key',
    'lat',
    'lng',
    'own_report_id',
    'reported_at',
    'status',
  ];
  const ownIds = new Set(
    (await pg`SELECT id FROM reports WHERE citizen_id=${citizen.id}`).map(
      (r) => r.id,
    ),
  );
  assert(map.body.tickets.length > 0);
  assert(
    map.body.tickets.some((row) => row.own_report_id === null),
    'Seeded foreign public report must stay anonymous',
  );
  for (const row of map.body.tickets) {
    assert.deepEqual(Object.keys(row).sort(), keys);
    assert(row.own_report_id === null || ownIds.has(row.own_report_id));
    assert(Math.abs(row.lat * 1000 - Math.round(row.lat * 1000)) < 1e-6);
    assert(Math.abs(row.lng * 1000 - Math.round(row.lng * 1000)) < 1e-6);
  }
  assert(map.body.tickets.some((r) => r.own_report_id === own.reports[0].id));
  assert(!JSON.stringify(map.body).includes('PRIVATE_'));
  done.add('public-map-privacy');
  ok(
    'actual public-map query preserves exact allowlist, approximate coordinates and owner-only report links',
  );

  const peer = await makeActor('meo');
  const saved = await allowed('POST', '/admin/saved-views', actors.meo, {
    name: 'Personal fixture',
    query: 'office=MDRRMO',
  });
  assert(
    !(await allowed('GET', '/admin/saved-views', peer)).body.some(
      (v) => v.id === saved.body.id,
    ),
  );
  await denied(
    'DELETE',
    `/admin/saved-views/${saved.body.id}`,
    peer,
    undefined,
    404,
  );
  await allowed('DELETE', `/admin/saved-views/${saved.body.id}`, actors.meo);
  done.add('saved-view-ownership');
  ok('saved views remain personal even between two staff in the same office');

  const direct = await notification(actors.meo),
    citizenNotice = await notification(citizen),
    foreignNotice = await notification(otherCitizen);
  const meoOffice = await notification(null, 'MEO'),
    mdOffice = await notification(null, 'MDRRMO');
  for (const kind of ['meo', 'mdrrmo', 'focal', 'systemAdmin']) {
    const list = await allowed('GET', '/notifications?limit=100', actors[kind]);
    const text = JSON.stringify(list.body);
    if (kind === 'meo')
      assert(text.includes(meoOffice.title) && text.includes(direct.title));
    if (kind === 'mdrrmo') assert(text.includes(mdOffice.title));
    if (kind !== 'meo')
      assert(!text.includes(meoOffice.title) && !text.includes(direct.title));
    if (kind !== 'mdrrmo') assert(!text.includes(mdOffice.title));
    assert(!text.includes(citizenNotice.title));
  }
  const citizenList = await allowed('GET', '/notifications', citizen);
  assert(JSON.stringify(citizenList.body).includes(citizenNotice.title));
  assert(!JSON.stringify(citizenList.body).includes(foreignNotice.title));
  await denied(
    'POST',
    `/notifications/${foreignNotice.id}/read`,
    citizen,
    undefined,
    404,
  );
  done.add('notification-scope');
  ok(
    'real notification scope includes direct/own-office records only and refuses foreign mark-read without writes',
  );

  await sessionBoundaries(c, { allowed, denied, fingerprint });
  const preserved =
    await pg`SELECT id,to_jsonb(e) snapshot FROM admin_audit_events e WHERE id<=${auditPrefix.at(-1).id} ORDER BY id`;
  assert.deepEqual(
    preserved,
    auditPrefix,
    'Existing workflow audit values changed',
  );
  const [auditGuard] =
    await pg`SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgenabled='O') present`;
  assert(auditGuard.present);
  ok(
    'successful and refused permission scenarios preserve earlier audit rows and the real append-only trigger',
  );
}

async function sessionBoundaries(c, helpers) {
  const {
    pg,
    actors,
    makeActor,
    request,
    status,
    sessions,
    test,
    done,
    password,
  } = c;
  const { allowed } = helpers;
  const both =
    actors.meo.cookieName +
    '=' +
    actors.meo.token +
    '; ' +
    actors.citizen.cookieName +
    '=' +
    actors.citizen.token;
  const me = await request('GET', '/auth/me', null, { cookie: both });
  status(me, 200, 'Dual sessions');
  assert.equal(me.body.admin.adminId, actors.meo.id);
  assert.equal(me.body.citizen.citizenId, actors.citizen.id);
  const newestAdmin = await c.notification(actors.meo),
    newestCitizen = await c.notification(actors.citizen);
  const preferred = await request('GET', '/notifications?limit=100', null, {
    cookie: both,
  });
  status(
    preferred,
    200,
    'Notifications prefer the valid admin when both cookies exist',
  );
  assert(JSON.stringify(preferred.body).includes(newestAdmin.title));
  assert(!JSON.stringify(preferred.body).includes(newestCitizen.title));
  const fallback = await request('GET', '/notifications', null, {
    cookie:
      SESSION_COOKIE +
      '=malformed; ' +
      actors.citizen.cookieName +
      '=' +
      actors.citizen.token,
  });
  status(fallback, 200, 'Invalid admin cookie falls back to valid citizen');
  assert(JSON.stringify(fallback.body).includes(newestCitizen.title));
  assert(!JSON.stringify(fallback.body).includes(newestAdmin.title));
  for (const kind of ['meo', 'citizen']) {
    const a = await makeActor(kind),
      audience = kind === 'citizen' ? 'citizen' : 'admin';
    const endpoint =
      kind === 'citizen' ? '/reports/mine' : '/admin/account/password';
    const method = kind === 'citizen' ? 'GET' : 'POST';
    const sign = (claims, iat, exp, aud = audience) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience(aud)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(new TextEncoder().encode(SECRET));
    const now = Math.floor(Date.now() / 1000);
    const missingClaims = {
      ...a.claims,
      [kind === 'citizen' ? 'citizenId' : 'adminId']: 2147483000,
    };
    for (const token of [
      'malformed',
      await sign(a.claims, now - 120, now - 60),
      await sign(
        a.claims,
        now,
        now + 3600,
        audience === 'admin' ? 'citizen' : 'admin',
      ),
      await sign(missingClaims, now, now + 3600),
    ]) {
      const res = await request(method, endpoint, null, {
        cookie: a.cookieName + '=' + token,
        probe: true,
      });
      status(res, 401, 'Invalid/expired/wrong-audience/missing-account token');
      assert.deepEqual(res.body, { message: 'Unauthorized', statusCode: 401 });
    }
    const table = kind === 'citizen' ? 'citizens' : 'admins';
    await pg.unsafe(
      `UPDATE ${table} SET session_valid_after=$1::timestamptz WHERE id=$2`,
      [new Date((now + 1) * 1000).toISOString(), a.id],
    );
    status(
      await request(method, endpoint, a, { probe: true }),
      401,
      'Revoked session',
    );
    const fresh = await makeActor(kind);
    fresh.token = await sign(fresh.claims, now - 120, now + 3600);
    const logout = audience === 'admin' ? '/admin/logout' : '/citizens/logout';
    await allowed('POST', logout, fresh);
    status(
      await request('GET', '/auth/me', fresh),
      401,
      'Logout revokes copied cookie',
    );
    status(
      await request('POST', logout, null, {
        cookie: fresh.cookieName + '=malformed',
      }),
      200,
      'Invalid logout remains tolerant',
    );
  }
  const inactive = await makeActor('meo');
  await pg`UPDATE admins SET is_active=false WHERE id=${inactive.id}`;
  status(await request('GET', '/auth/me', inactive), 401, 'Inactive admin');
  done.add('session-cookies');
  ok(
    'dual-cookie resolution, fallback, invalid/expired/revoked/missing accounts, deactivation and tolerant real logout',
  );

  const a = await makeActor('citizen'),
    b = await makeActor('citizen');
  const security = await allowed('GET', '/citizens/account/security', a);
  assert(!JSON.stringify(security.body).includes(b.claims.email));
  const ownReauth = await sessions.signReauth(a.claims.citizenId),
    otherReauth = await sessions.signReauth(b.claims.citizenId);
  const unlink = (token) =>
    request('DELETE', '/citizens/account/identities/google', a, {
      probe: true,
      cookie:
        a.cookieName +
        '=' +
        a.token +
        '; ' +
        CITIZEN_REAUTH_COOKIE +
        '=' +
        token,
    });
  status(await unlink(otherReauth), 428, 'Reauth must belong to same citizen');
  const accepted = await unlink(ownReauth);
  status(accepted, 200, 'Matching fresh reauth admits');
  assert(accepted.body.permissionProbe);
  const [beforeOther] =
    await pg`SELECT to_jsonb(c) snapshot FROM citizens c WHERE id=${b.id}`;
  const newPassword = 'Another-offline-fixture-only-456!';
  await allowed('POST', '/citizens/account/password', a, {
    currentPassword: password,
    newPassword,
    citizenId: b.id,
  });
  const [afterOther] =
    await pg`SELECT to_jsonb(c) snapshot FROM citizens c WHERE id=${b.id}`;
  assert.deepEqual(
    afterOther,
    beforeOther,
    'Forged body citizenId changed another account',
  );
  assert(
    await bcrypt.compare(
      newPassword,
      (await pg`SELECT password_hash FROM citizens WHERE id=${a.id}`)[0]
        .password_hash,
    ),
  );
  done.add('account-ownership');
  done.add('recent-reauth');
  ok(
    'citizen account identity and matching recent-reauth requirement (428 otherwise) use real guards',
  );

  const quota = await makeActor('citizen');
  for (let i = 0; i < 30; i++)
    status(
      await request('GET', '/reports/mine/by-reference/PRC-2000-999999', quota),
      404,
      'Reference quota admission',
    );
  status(
    await request('GET', '/reports/mine/by-reference/PRC-2000-999999', quota),
    429,
    'Reference quota enforced',
  );
  status(
    await request('GET', '/reports/mine/by-reference/PRC-2000-999999', b),
    404,
    'Other citizen has independent quota',
  );
  done.add('reference-rate');
  for (let i = 0; i < 10; i++)
    status(
      await request('GET', '/auth/google', null, { ip: '198.19.0.1' }),
      302,
      'OAuth quota admission',
    );
  status(
    await request('GET', '/auth/google', null, { ip: '198.19.0.1' }),
    429,
    'OAuth quota enforced',
  );
  done.add('oauth-rate');
  ok(
    'real OAuth and reference throttles reach 429 at their existing limits without bypasses',
  );

  for (const row of policy.routes.filter((r) =>
    r.key.startsWith('POST /cron/'),
  )) {
    const [method, url] = row.key.split(' ');
    status(
      await request(method, url, actors.systemAdmin, {
        probe: true,
        headers: { authorization: 'Bearer wrong' },
      }),
      401,
      'Staff role cannot replace cron secret',
    );
    for (const headers of [
      { authorization: 'Bearer ' + CRON_SECRET },
      { 'x-cron-secret': CRON_SECRET },
    ]) {
      const res = await request(method, url, null, { probe: true, headers });
      status(res, 200, 'Valid cron secret admits');
      assert(res.body.permissionProbe);
    }
  }
  done.add('cron-secret');
  ok(
    'all cron routes require independent secret; valid-secret admission probes execute no maintenance jobs',
  );

  for (const mode of ['link', 'reauth']) {
    const denied = await request(
      'GET',
      '/auth/google?mode=' + mode,
      actors.meo,
    );
    status(denied, 302, 'OAuth mode requires citizen');
    assert.equal(denied.headers.location, 'http://web.fixture.invalid/login');
    const valid = await request('GET', '/auth/google?mode=' + mode, b);
    status(valid, 302, 'Authenticated OAuth mode');
    assert(
      valid.headers.location.startsWith('https://provider.fixture.invalid/'),
    );
  }
  const callback = await request(
    'GET',
    '/auth/google/callback?code=unused&state=invalid',
    b,
  );
  status(callback, 302, 'Invalid OAuth state');
  assert(callback.headers.location.includes('oauth_failed'));
  assert.equal(test.profiles.size, 0);
  const oauthCitizen = await makeActor('citizen');
  const profile = {
    subject: 'offline-permission-provider-subject',
    email: oauthCitizen.claims.email,
    firstName: 'Offline',
    lastName: 'Provider',
  };
  test.profiles.set('offline-link', profile);
  function cookieFrom(response, name) {
    const cookie = (response.headers['set-cookie'] ?? []).find((value) =>
      value.startsWith(name + '='),
    );
    assert(cookie, 'Expected session/state cookie: ' + name);
    return cookie.split(';')[0];
  }
  async function startOAuth(mode, actor) {
    const res = await request(
      'GET',
      '/auth/google' + (mode ? '?mode=' + mode : ''),
      actor,
    );
    status(res, 302, 'OAuth start');
    return {
      state: new URL(res.headers.location).searchParams.get('state'),
      nonce: cookieFrom(res, 'ac_oauth_state_google'),
    };
  }
  const link = await startOAuth('link', oauthCitizen);
  const boundCookie =
    oauthCitizen.cookieName + '=' + oauthCitizen.token + '; ' + link.nonce;
  const linked = await request(
    'GET',
    '/auth/google/callback?code=offline-link&state=' +
      encodeURIComponent(link.state),
    null,
    { cookie: boundCookie },
  );
  status(linked, 302, 'Valid bound OAuth link');
  assert.equal(
    linked.headers.location,
    'http://web.fixture.invalid/account?linked=google',
  );
  assert.equal(
    (
      await pg`SELECT citizen_id FROM citizen_identities WHERE provider_subject=${profile.subject}`
    )[0].citizen_id,
    oauthCitizen.id,
  );
  const replay = await request(
    'GET',
    '/auth/google/callback?code=offline-link&state=' +
      encodeURIComponent(link.state),
    null,
    { cookie: boundCookie },
  );
  status(replay, 302, 'OAuth replay');
  assert(replay.headers.location.includes('oauth_failed'));
  const mismatch = await startOAuth('link', oauthCitizen);
  const mismatched = await request(
    'GET',
    '/auth/google/callback?code=offline-link&state=' +
      encodeURIComponent(mismatch.state),
    null,
    { cookie: b.cookieName + '=' + b.token + '; ' + mismatch.nonce },
  );
  status(mismatched, 302, 'OAuth state/session binding');
  assert(mismatched.headers.location.includes('oauth_failed'));
  assert.equal(
    (
      await pg`SELECT count(*)::int n FROM citizen_identities WHERE citizen_id=${b.id}`
    )[0].n,
    0,
  );
  const login = await startOAuth('', null);
  const loggedIn = await request(
    'GET',
    '/auth/google/callback?code=offline-link&state=' +
      encodeURIComponent(login.state),
    null,
    { cookie: login.nonce },
  );
  status(loggedIn, 302, 'Bound provider login');
  const providerMe = await request('GET', '/auth/me', null, {
    cookie: cookieFrom(loggedIn, CITIZEN_SESSION_COOKIE),
  });
  status(providerMe, 200, 'Provider-issued citizen session');
  assert.equal(providerMe.body.citizen.citizenId, oauthCitizen.id);
  assert.equal(providerMe.body.admin, null);
  const reauth = await startOAuth('reauth', oauthCitizen);
  const proved = await request(
    'GET',
    '/auth/google/callback?code=offline-link&state=' +
      encodeURIComponent(reauth.state),
    null,
    {
      cookie:
        oauthCitizen.cookieName +
        '=' +
        oauthCitizen.token +
        '; ' +
        reauth.nonce,
    },
  );
  status(proved, 302, 'Valid provider reauthentication');
  assert.equal(
    proved.headers.location,
    'http://web.fixture.invalid/account?reauth=google',
  );
  const unlinked = await request(
    'DELETE',
    '/citizens/account/identities/google',
    null,
    {
      cookie:
        oauthCitizen.cookieName +
        '=' +
        oauthCitizen.token +
        '; ' +
        cookieFrom(proved, CITIZEN_REAUTH_COOKIE),
    },
  );
  status(unlinked, 200, 'Real unlink with fresh matching proof');
  assert.equal(
    (
      await pg`SELECT count(*)::int n FROM citizen_identities WHERE citizen_id=${oauthCitizen.id}`
    )[0].n,
    0,
  );
  done.add('oauth-purpose');
  ok(
    'OAuth login/link/reauth and invalid callback state execute real controller/session logic with local provider adapter',
  );

  for (const endpoint of ['/admin/login', '/citizens/login'])
    status(
      await request('POST', endpoint, null, {
        body: { email: 'absent@fixture.invalid', password: 'incorrect' },
      }),
      401,
      'Public login still validates credentials',
    );
  const missing = await request('POST', '/citizens/forgot-password', null, {
    body: { email: 'absent-reset@fixture.invalid' },
  });
  const existing = await request('POST', '/citizens/forgot-password', null, {
    body: { email: b.claims.email },
  });
  status(missing, 200, 'Missing account reset');
  status(existing, 200, 'Existing account reset');
  assert.deepEqual(existing.body, missing.body);
  const validLogin = await request('POST', '/citizens/login', null, {
    body: { email: b.claims.email, password },
  });
  status(validLogin, 200, 'Valid local credentials');
  assert(test.deliveries.every((d) => d.args[0].endsWith('@fixture.invalid')));
  done.add('public-credentials');
  ok(
    'public admission does not bypass credential checks; password-reset enumeration resistance and local-only email adapter',
  );
}

main().catch((error) => {
  console.error(
    error.stack?.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]') ??
      'Offline permission check failed',
  );
  process.exitCode = 1;
});
