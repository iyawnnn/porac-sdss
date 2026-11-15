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
  { drizzle } = require('drizzle-orm/postgres-js');
const { demoBaseline } = require('./helpers/demo-baseline.cjs');
const {
  runDemoWorkflow,
  loadDemoActors,
  demoPoint,
  DEMO_IP,
} = require('../scripts/lib/demo-workflow.ts');
const {
  DemoMediaService,
  demoServices,
} = require('../scripts/lib/demo-services.ts');
const { seedDemoCitizens } = require('../scripts/lib/seed-demo-citizens.ts');
const { seedAdminAccount } = require('../scripts/lib/seed-admin-account.ts');
const { runBulkDemo } = require('../scripts/lib/bulk-demo.ts');
const { renderExifImage } = require('../../lib/utils/generate-exif-image.ts');
let checks = 0;
const ok = (s) => console.log('ok ' + ++checks + ' - ' + s);
async function main() {
  const memory = await demoBaseline(PGlite, postgis);
  let server, pg;
  const fetch = global.fetch;
  let fetches = 0,
    uploads = 0;
  try {
    server = new PGLiteSocketServer({ db: memory, port: 0, host: '127.0.0.1' });
    await server.start();
    pg = postgres(
      'postgres://postgres:postgres@' + server.getServerConn() + '/postgres',
      {
        max: 1,
        max_pipeline: 1,
        onnotice: () => {},
        debug: (_c, _q, params) =>
          assert(
            !params.some((v) => v instanceof Date),
            'JS Date passed to raw SQL',
          ),
      },
    );
    const db = drizzle(pg);
    global.fetch = () => {
      fetches++;
      return Promise.reject(Error('Live network forbidden in demo regression'));
    };
    const [schema] =
      await pg`SELECT to_regclass('report_acknowledgments') IS NULL contracted,to_regclass('config') IS NULL config_gone,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='admin_audit_events_append_only' AND tgenabled='O') audit_guard`;
    assert.deepEqual(schema, {
      contracted: true,
      config_gone: true,
      audit_guard: true,
    });
    ok(
      'real 0000-0050 SQL with PostGIS, final contraction and audit protection',
    );
    const media = new DemoMediaService(() => {
      uploads++;
      return Promise.resolve('/fixtures/demo-' + uploads + '.jpg');
    });
    await assert.rejects(
      () => runDemoWorkflow(pg, db, media),
      /needs active|needs the five/,
    );
    assert.equal(uploads, 0);
    ok('missing prerequisites refused before submission or media write');
    await seedDemoCitizens(pg, 'only-in-memory');
    await seedDemoCitizens(pg, 'only-in-memory');
    assert.equal((await pg`SELECT count(*)::int n FROM citizens`)[0].n, 5);
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='citizens' AND column_name='verified'`
      )[0].n,
      0,
    );
    ok(
      'citizen seed works twice on real schema without adding an obsolete column',
    );
    for (const [email, type, office, focal] of [
      ['meo@fixture.invalid', 'PERSONNEL', 'MEO', 'false'],
      ['mdrrmo@fixture.invalid', 'PERSONNEL', 'MDRRMO', 'false'],
      ['focal@fixture.invalid', 'PERSONNEL', 'MDRRMO', 'true'],
    ])
      await seedAdminAccount(db, [
        email,
        'only-in-memory',
        type,
        office,
        focal,
      ]);
    const result = await runDemoWorkflow(pg, db, media);
    assert.equal(result.submissions.length, 15);
    assert.equal(uploads, 15);
    assert.equal(
      (await pg`SELECT count(*)::int n FROM rate_limit_events`)[0].n,
      15,
    );
    const reports =
      await pg`SELECT id,tracking_reference,flags,ticket_id FROM reports ORDER BY id`;
    assert.equal(reports.length, 15);
    assert.equal(new Set(reports.map((r) => r.tracking_reference)).size, 15);
    assert(
      reports.every((r) => /^PRC-\d{4}-\d{6,}$/.test(r.tracking_reference)),
    );
    ok('fifteen actual submissions, references and real rate events');
    assert.equal(result.potholeRadiusM, 20);
    assert.match(
      result.suggestion,
      /^Possibly related to Ticket #\d+, 18 m away$/,
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM admin_audit_events WHERE action_type='ticket_merged'`
      )[0].n,
      1,
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM tickets WHERE merged_into_ticket_id IS NOT NULL`
      )[0].n,
      1,
    );
    ok(
      'real geography 18 m candidate, 22 m exclusion and one explicit audited staff merge',
    );
    for (const [i, flag] of [
      [4, 'LOCATION_MISMATCH'],
      [5, 'STALE_EVIDENCE'],
      [6, 'MISSING_METADATA'],
      [7, 'TIMESTAMP_ANOMALY'],
    ])
      assert(reports[i].flags.includes(flag));
    for (const i of [3, 8])
      assert(
        !reports[i].flags.some((f) =>
          [
            'LOCATION_MISMATCH',
            'STALE_EVIDENCE',
            'MISSING_METADATA',
            'TIMESTAMP_ANOMALY',
          ].includes(f),
        ),
      );
    ok(
      'four accepted flagged-evidence cases plus 40 m/three-day-pothole and no-GPS controls',
    );
    assert.equal(
      (await pg`SELECT count(*)::int n FROM acknowledgments`)[0].n,
      15,
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM reports WHERE severity_screening_status='NO_CONCERN_NOTED'`
      )[0].n,
      15,
    );
    ok(
      'real Focal screening and ticket-level acknowledgment for every submission',
    );
    const orderStates =
      await pg`SELECT status,count(*)::int n FROM work_orders GROUP BY status ORDER BY status`;
    assert.deepEqual(
      orderStates
        .map((x) => [x.status, x.n])
        .sort((a, b) => a[0].localeCompare(b[0])),
      [
        ['cancelled', 1],
        ['completed', 1],
        ['in_progress', 1],
        ['pending', 1],
      ],
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM work_orders w JOIN operational_assessments a ON a.ticket_id=w.ticket_id
      JOIN admins staff ON staff.id=a.assessed_by_admin_id WHERE a.created_at<=w.created_at AND jsonb_typeof(a.operational_constraints->'selected')='array'`
      )[0].n,
      4,
    );
    ok(
      'assessment precedes every Work Order; pending/in-progress/completed/cancelled real lifecycle',
    );
    const outcomes =
      await pg`SELECT resolution_outcome FROM tickets WHERE resolution_outcome IS NOT NULL ORDER BY resolution_outcome`;
    assert.deepEqual(outcomes.map((x) => x.resolution_outcome).sort(), [
      'EXTERNAL_REFERRAL',
      'MUNICIPAL_ACTION_COMPLETED',
    ]);
    const feedback =
      await pg`SELECT feedback_type FROM resolution_feedback ORDER BY feedback_type`;
    assert.deepEqual(
      feedback.map((x) => x.feedback_type),
      ['CONFIRMED', 'DISPUTED'],
    );
    const routes =
      await pg`SELECT action_type,reason FROM routing_actions ORDER BY id`;
    assert.equal(routes.filter((r) => r.action_type === 'REASSIGN').length, 2);
    assert.equal(routes.filter((r) => r.action_type === 'REFER').length, 2);
    assert(routes.every((r) => r.reason.trim()));
    ok(
      'both resolution outcomes, two citizens confirm/dispute, Focal and operational reasoned routing',
    );
    const hazard =
      await pg`SELECT lookup_status FROM hazard_information WHERE superseded_at IS NULL ORDER BY lookup_status`;
    assert.deepEqual(
      hazard.map((x) => x.lookup_status).sort(),
      ['CLASSIFIED', 'NO_CLASSIFICATION', 'TEMPORARILY_UNAVAILABLE'].sort(),
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM hazard_information WHERE ticket_id=${result.pendingHazardTicketId}`
      )[0].n,
      0,
    );
    const rain =
      await pg`SELECT status,rainfall_mm FROM rainfall_context WHERE superseded_at IS NULL ORDER BY status`;
    assert.deepEqual(
      rain.map((x) => [x.status, x.rainfall_mm]),
      [
        ['CURRENT', 0],
        ['UNAVAILABLE', null],
      ],
    );
    assert.equal(fetches, 0);
    ok(
      'real hazard/rainfall persistence: all four hazard states and zero versus unavailable, no live fetch',
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM notifications WHERE type='report_received'`
      )[0].n,
      15,
    );
    for (const action of [
      'report_acknowledged',
      'report_severity_screened',
      'operational_assessment_created',
      'work_order_created',
      'work_order_cancelled',
      'ticket_status_advanced',
      'ticket_reassigned',
      'ticket_referral_noted',
      'ticket_merged',
    ])
      assert(
        (
          await pg`SELECT count(*)::int n FROM admin_audit_events WHERE action_type=${action}`
        )[0].n > 0,
      );
    const auditBefore = await pg`SELECT * FROM admin_audit_events ORDER BY id`;
    await assert.rejects(
      () => pg`UPDATE admin_audit_events SET actor_name=actor_name`,
      /append.only/i,
    );
    await assert.rejects(
      () => pg`DELETE FROM admin_audit_events`,
      /append.only/i,
    );
    assert.deepEqual(
      await pg`SELECT * FROM admin_audit_events ORDER BY id`,
      auditBefore,
    );
    ok(
      'notifications and audit through real services; immutable audit rows preserved',
    );
    await assert.rejects(() => runDemoWorkflow(pg, db, media), /not empty/);
    assert.equal(uploads, 15);
    assert.equal((await pg`SELECT count(*)::int n FROM reports`)[0].n, 15);
    assert.deepEqual(
      await pg`SELECT * FROM admin_audit_events ORDER BY id`,
      auditBefore,
    );
    ok('repeat/non-empty invocation refuses before media or database writes');
    const actors = await loadDemoActors(pg),
      svc = demoServices(pg, db, media);
    let index = 0;
    const extra = async (citizen) => {
      const point = await demoPoint(pg, 2300 + index * 100),
        image = await renderExifImage({ ...point, variant: 900 + index++ });
      return svc.reports.submit(
        citizen,
        DEMO_IP,
        {
          ...point,
          title: 'Offline quota regression',
          description: 'Rate limits remain enabled.',
          category: 'Pothole / Road Surface Damage',
          citizenSeverity: 'Low',
        },
        image,
      );
    };
    await assert.rejects(
      () =>
        svc.orders.create(
          {
            ticketId: result.submissions[2].ticketId,
            title: 'Must refuse without assessment',
            notes: null,
            assignedAdminId: null,
            dueDate: null,
          },
          actors.meo,
        ),
      /assessment/i,
    );
    await assert.rejects(
      () => runBulkDemo(pg, db, media, { append: false, count: 3 }),
      /not empty/,
    );
    await assert.rejects(
      () => runBulkDemo(pg, db, media, { append: true, count: 6 }),
      /insufficient/,
    );
    const volume = await runBulkDemo(pg, db, media, { append: true, count: 3 });
    assert.equal(volume.length, 3);
    const volumeRows = await pg`
      SELECT t.member_count, t.merged_into_ticket_id
      FROM reports r JOIN tickets t ON t.id=r.ticket_id
      WHERE r.id=ANY(${volume.map((x) => x.reportId)}::int[])
    `;
    assert.equal(volumeRows.length, volume.length);
    assert(
      volumeRows.every(
        (x) => x.member_count === 1 && x.merged_into_ticket_id === null,
      ),
    );
    await assert.rejects(
      () => runBulkDemo(pg, db, media, { append: true, count: 3 }),
      /already exists/,
    );
    ok(
      'no-assessment Work Order refused; optional explicit bulk append uses real submissions, quota preflight and repeat refusal',
    );
    await assert.rejects(
      () => extra(actors.citizens[0]),
      /Too many reports from your account/,
    );
    await extra(actors.citizens[1]);
    await extra(actors.citizens[2]);
    await assert.rejects(
      () => extra(actors.citizens[3]),
      /Too many reports from this network/,
    );
    assert.equal(
      (await pg`SELECT count(*)::int n FROM rate_limit_events`)[0].n,
      20,
    );
    ok(
      'real 5/account and 20/IP limits refuse excess submissions without recording them',
    );
    console.log(checks + ' demo workflow PGlite groups passed');
  } finally {
    global.fetch = fetch;
    if (pg) await pg.end({ timeout: 2 });
    if (server) await server.stop();
    await memory.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
