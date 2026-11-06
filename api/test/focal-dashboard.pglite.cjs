// Isolated memory only: no env files, database runners, migrations or seeds.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
require('reflect-metadata');
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, '../tsconfig.json');
require('tsx/cjs');
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const {
  FocalDashboardService,
} = require('../src/admin/focal-dashboard.service.ts');
const {
  deriveIntakeState,
  needsSeverityScreening,
} = require('../src/admin/focal-intake.service.ts');
const focal = { accountType: 'PERSONNEL', isFocal: true, office: 'MDRRMO' };

async function main() {
  const memory = new PGlite();
  await memory.exec(`
    CREATE TYPE office AS ENUM ('MEO','MDRRMO');
    CREATE TABLE barangays(id int PRIMARY KEY,name text);
    INSERT INTO barangays VALUES(1,'Fixture');
    CREATE TABLE tickets(id int PRIMARY KEY,barangay_id int DEFAULT 1,category text DEFAULT 'Fixture',
      status text DEFAULT 'Reported',assigned_office office DEFAULT 'MEO',priority_index int DEFAULT 50,merged_into_ticket_id int);
    CREATE TABLE reports(id int PRIMARY KEY,ticket_id int,tracking_reference text DEFAULT 'REF',
      created_at timestamptz DEFAULT now()-interval '100 hours',severity_screening_status text DEFAULT 'NOT_REVIEWED',severity_screened_at timestamptz);
    CREATE TABLE report_acknowledgments(report_id int UNIQUE,acknowledged_at timestamptz);
    CREATE TABLE report_intake_actions(id serial PRIMARY KEY,report_id int,action_type text,created_at timestamptz);
  `);
  // There is deliberately no Work Order table: any accidental read must fail.
  const server = new PGLiteSocketServer({
    db: memory,
    port: 0,
    host: '127.0.0.1',
  });
  await server.start();
  const raw = postgres(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    {
      max: 1,
      debug: (_c, _q, params) =>
        assert(!params.some((p) => p instanceof Date), 'Raw JS Date parameter'),
    },
  );
  let checks = 0;
  const ok = (label) => console.log(`ok ${++checks} - ${label}`);
  try {
    await drizzle(raw).transaction(async (db) => {
      const sql = db.session.client;
      const service = new FocalDashboardService(sql);
      const empty = {
        newReports: 0,
        unacknowledged: 0,
        needsScreening: 0,
        forwardedOrEscalated: 0,
        medianAcknowledgmentHours30d: null,
      };
      assert.deepEqual(await service.counts(focal), empty);
      assert.deepEqual(await service.reports(focal), {
        items: [],
        total: 0,
        page: 1,
        pageSize: 6,
      });
      ok('empty counts, null median and empty page');
      await sql`INSERT INTO tickets(id,assigned_office,status,merged_into_ticket_id) VALUES
        (1,'MEO','Reported',NULL),(2,'MDRRMO','Under Review',NULL),(3,'MEO','Resolved',NULL),
        (4,'MDRRMO','Rejected',NULL),(5,'MEO','Reported',1),(6,'MDRRMO','In Progress',NULL)`;
      await sql`INSERT INTO reports(id,ticket_id) VALUES(1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(7,1)`;
      await sql`INSERT INTO report_acknowledgments VALUES
        (1,now()-interval '99 hours'),(2,now()-interval '97 hours'),(3,now()),(5,now())`;
      // 1,3,100 -> median 3, unlike mean. Both offices and terminal statuses count.
      const expected = {
        newReports: 6,
        unacknowledged: 3,
        needsScreening: 4,
        forwardedOrEscalated: 0,
        medianAcknowledgmentHours30d: 3,
      };
      assert.deepEqual(await service.counts(focal), expected);
      assert.deepEqual(
        await service.counts({ ...focal, office: 'MEO' }),
        expected,
      );
      const first = await service.reports(focal, '1', '2');
      const second = await service.reports(focal, '2', '2');
      const third = await service.reports(focal, '3', '2');
      assert.equal(first.total, 6);
      assert.deepEqual(
        [...first.items, ...second.items, ...third.items].map(
          (r) => r.reportId,
        ),
        [7, 6, 4, 3, 2, 1],
      );
      assert.deepEqual(await service.reports(focal, '4', '2'), {
        total: 6,
        page: 4,
        pageSize: 2,
        items: [],
      });
      assert.deepEqual(
        Object.keys(first.items[0]).sort(),
        [
          'reportId',
          'reportReference',
          'category',
          'barangayName',
          'routedOffice',
          'operationalPriority',
          'submittedAt',
          'intakeState',
          'needsScreening',
        ].sort(),
      );
      ok(
        'municipality-wide report units, merged exclusion, odd median, stable ties, disjoint pages, total beyond end and narrow response',
      );
      await sql`INSERT INTO report_acknowledgments VALUES (6,now()-interval '90 hours')`;
      assert.equal(
        (await service.counts(focal)).medianAcknowledgmentHours30d,
        6.5,
      );
      await sql`INSERT INTO reports(id,ticket_id,created_at) VALUES (8,1,now()-interval '40 days'),(9,1,now()-interval '40 days')`;
      await sql`INSERT INTO report_acknowledgments VALUES(8,now()-interval '30 days'),(9,now()-interval '30 days'-interval '1 microsecond')`;
      assert.equal(
        (await service.counts(focal)).medianAcknowledgmentHours30d,
        10,
      );
      await sql`INSERT INTO reports(id,ticket_id,created_at) VALUES(10,1,now())`;
      await sql`INSERT INTO report_acknowledgments VALUES(10,now()+interval '1 microsecond')`;
      assert.equal(
        (await service.counts(focal)).medianAcknowledgmentHours30d,
        10,
      );
      ok(
        'even median, exact 30-day inclusion, older and future acknowledgment exclusion',
      );
      // Retired screened actions count for nothing; later screening beats routing,
      // routing wins ties, and the latest action uses id to break timestamp ties.
      await sql`INSERT INTO report_intake_actions(report_id,action_type,created_at) VALUES
        (4,'screened',now()),(7,'forwarded',now()-interval '2 hours'),
        (6,'forwarded',now()-interval '2 hours'),(6,'escalated',now()-interval '2 hours')`;
      await sql`UPDATE reports SET severity_screening_status='NO_CONCERN_NOTED',severity_screened_at=now()-interval '1 hour' WHERE id=7`;
      await sql`UPDATE reports SET severity_screening_status='NO_CONCERN_NOTED',severity_screened_at=now()-interval '2 hours' WHERE id=6`;
      const page = await service.reports(focal, '1', '50');
      const facts =
        await sql`SELECT r.id,t.id ticket_id,t.status,t.merged_into_ticket_id,ra.acknowledged_at,
        r.severity_screening_status,r.severity_screened_at,latest.action_type,latest.created_at action_at
        FROM reports r JOIN tickets t ON t.id=r.ticket_id LEFT JOIN report_acknowledgments ra ON ra.report_id=r.id
        LEFT JOIN LATERAL(SELECT action_type,created_at FROM report_intake_actions WHERE report_id=r.id
          AND action_type IN ('forwarded','escalated') ORDER BY created_at DESC,id DESC LIMIT 1) latest ON true
        WHERE t.merged_into_ticket_id IS NULL`;
      const states = facts.map((r) =>
        deriveIntakeState({
          acknowledgedAt: r.acknowledged_at,
          latestActionType: r.action_type,
          latestActionAt: r.action_at,
          severityScreeningStatus: r.severity_screening_status,
          severityScreenedAt: r.severity_screened_at,
        }),
      );
      const counts = await service.counts(focal);
      assert.equal(
        counts.unacknowledged,
        states.filter((s) => s === 'New').length,
      );
      assert.equal(
        counts.forwardedOrEscalated,
        states.filter((s) => ['Forwarded', 'Escalated'].includes(s)).length,
      );
      assert.equal(
        counts.needsScreening,
        facts.filter((r) =>
          needsSeverityScreening({
            ticketId: r.ticket_id,
            ticketStatus: r.status,
            mergedIntoTicketId: r.merged_into_ticket_id,
            severityScreeningStatus: r.severity_screening_status,
          }),
        ).length,
      );
      assert.equal(
        page.items.find((r) => r.reportId === 7).intakeState,
        'Screened',
      );
      assert.equal(
        page.items.find((r) => r.reportId === 6).intakeState,
        'Escalated',
      );
      assert.equal(page.items.find((r) => r.reportId === 4).intakeState, 'New');
      ok(
        'SQL aggregates reconcile with intake derivation, including screening/action order and history-only screened events',
      );
      // Work Orders are not a data source even when they exist and are numerous.
      await sql`CREATE TABLE work_orders(id int,ticket_id int,notes text)`;
      await sql`INSERT INTO work_orders SELECT n,1,'PRIVATE' FROM generate_series(1,100) n`;
      assert.deepEqual(await service.counts(focal), counts);
      assert.deepEqual(await service.reports(focal, '1', '50'), page);
      assert(!JSON.stringify({ counts, page }).includes('PRIVATE'));
      ok('Work Order data cannot influence counts, pages or response fields');
      for (const admin of [
        { ...focal, isFocal: false },
        { ...focal, accountType: 'SYSTEM_ADMIN' },
      ]) {
        await assert.rejects(service.counts(admin), /Focal access required/);
        await assert.rejects(service.reports(admin), /Focal access required/);
      }
      await assert.rejects(service.reports(focal, '1', '51'), /Paging values/);
      ok('non-Focal callers and oversize pages refused');
    });
    console.log(`${checks} Focal dashboard PGlite groups passed`);
  } finally {
    await raw.end();
    await server.stop();
    await memory.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
