// Isolated memory only: no .env, real database, migration or seed runner.
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
  ReportExportQueries,
  parseReportExportFilters,
} = require('../src/admin/report-export-queries.ts');
const { ReportsService } = require('../src/admin/reports.service.ts');
const { AdminAuditService } = require('../dist/admin/admin-audit.service');
const {
  insertNewExportFixtures,
} = require('../scripts/lib/new-export-fixtures.ts');

async function main() {
  const memory = new PGlite();
  await memory.exec(`
    CREATE TYPE office AS ENUM ('MEO','MDRRMO');
    CREATE TYPE ticket_status AS ENUM ('Reported','Under Review','In Progress','Resolved','Rejected');
    CREATE TABLE admins (id int PRIMARY KEY,first_name text,last_name text,email text,role text,account_type text,is_focal boolean,office office,is_active boolean DEFAULT true);
    INSERT INTO admins(id,first_name,last_name,email,role,account_type,is_focal,office) VALUES
      (1,'MEO','Staff','meo@test','officer','PERSONNEL',false,'MEO'),
      (2,'MDRRMO','Staff','mdrrmo@test','officer','PERSONNEL',false,'MDRRMO'),
      (3,'Focal','Staff','focal@test','focal','PERSONNEL',true,'MDRRMO');
    CREATE TABLE barangays (id int PRIMARY KEY,name text); INSERT INTO barangays VALUES (1,'Fixture barangay');
    CREATE SEQUENCE fixture_ticket_ids START 10000;
    CREATE TABLE tickets (id int PRIMARY KEY DEFAULT nextval('fixture_ticket_ids'),status ticket_status DEFAULT 'Reported',assigned_office office DEFAULT 'MEO',
      initial_assigned_office office,category text DEFAULT 'Localized Flooding',barangay_id int DEFAULT 1,priority_index int DEFAULT 80,
      member_count int DEFAULT 1,created_at timestamptz DEFAULT '2026-01-01',updated_at timestamptz DEFAULT '2026-01-02',
      merged_into_ticket_id int,resolution_outcome text,resolved_at timestamptz,geom text DEFAULT 'point');
    INSERT INTO tickets(id,priority_index) VALUES (1,90),(7,80),(9,30);
    INSERT INTO tickets(id,priority_index,assigned_office) VALUES (2,100,'MDRRMO');
    INSERT INTO tickets(id,priority_index,merged_into_ticket_id) VALUES (3,100,1);
    INSERT INTO tickets(id,priority_index,status) VALUES (4,100,'Rejected'),(8,100,'Resolved');
    INSERT INTO tickets(id,priority_index,status,created_at) VALUES (5,90,'Under Review','2025-12-31'),(6,90,'In Progress','2025-12-31');
    CREATE TABLE citizens(id int PRIMARY KEY,first_name text,last_name text,email text);
    INSERT INTO citizens VALUES (1,'PRIVATE','CITIZEN','citizen1@porac.ph');
    CREATE SEQUENCE fixture_report_ids START 10000;
    CREATE TABLE reports(id int PRIMARY KEY DEFAULT nextval('fixture_report_ids'),ticket_id int,citizen_id int DEFAULT 1,
      tracking_reference text UNIQUE DEFAULT 'PRC-FIXTURE-' || currval('fixture_report_ids'),submitted_category text DEFAULT 'Pothole / Road Surface Damage',
      citizen_severity text DEFAULT 'High',flags text[] DEFAULT ARRAY['MISSING_METADATA'],severity_screening_status text DEFAULT 'NOT_REVIEWED',
      moderation_status text,created_at timestamptz DEFAULT '2026-01-01',title text DEFAULT 'PRIVATE_TITLE',description text DEFAULT 'PRIVATE_DESCRIPTION',
      image_url text,geom text,pin_geom text,severity_screening_remarks text DEFAULT 'PRIVATE_SCREENING_REMARKS');
    INSERT INTO reports(id,ticket_id,tracking_reference,created_at) VALUES
      (1,1,'PRC-before','2026-01-01T15:59:59.999999Z'),(10,1,'PRC-start','2026-01-01T16:00:00Z'),
      (11,1,'PRC-end','2026-01-02T15:59:59.999999Z'),(12,1,'PRC-after','2026-01-02T16:00:00Z'),
      (2,2,'PRC-other','2026-01-01T16:00:00Z'),(3,3,'PRC-merged','2026-01-01T16:00:00Z'),(4,4,'PRC-rejected','2026-01-01T16:00:00Z');
    CREATE TABLE operational_assessments(id serial PRIMARY KEY,ticket_id int NOT NULL UNIQUE,assessed_by_admin_id int,assessed_by_name text DEFAULT 'Recorded Staff',
      observed_conditions text DEFAULT '=PRIVATE_ASSESSMENT',safety_implications text DEFAULT 'Safety',operational_constraints text[] DEFAULT ARRAY['personnel'],
      operational_constraint_notes jsonb DEFAULT jsonb_build_object('personnel','None available'),recommended_action text DEFAULT 'Recommended',temporary_mitigation text DEFAULT 'Interim',
      deferment_reason text,referral_reason text,remarks text,actual_action text,supporting_evidence_url text,
      assessed_at timestamptz DEFAULT '2026-01-01T16:00:00Z',updated_by_admin_id int,updated_by_name text);
    INSERT INTO operational_assessments(ticket_id) VALUES (1),(2),(3),(5);
    CREATE TABLE work_orders(id serial PRIMARY KEY,ticket_id int,title text,notes text,assigned_office office,status text,created_by_admin_id int,
      completed_at timestamptz,cancelled_at timestamptz,cancelled_by_admin_id int,cancellation_reason text);
    INSERT INTO work_orders(ticket_id,status) VALUES (1,'pending'),(1,'in_progress'),(1,'completed'),(1,'cancelled'),(5,'cancelled');
    -- Only geometry equality is a stand-in. All export SQL/Drizzle paths are real.
    CREATE FUNCTION ST_Equals(text,text) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT $1=$2';
    CREATE TABLE hazard_information(id int,ticket_id int,hazard_context_type text,lookup_status text,susceptibility_code text,
      susceptibility_label text,query_geom text,superseded_at timestamptz,looked_up_at timestamptz);
    INSERT INTO hazard_information VALUES (1,5,'FLOOD','CLASSIFIED','MF','Moderate','point',NULL,now());
    CREATE TABLE admin_audit_events(id serial PRIMARY KEY,actor_admin_id int NOT NULL REFERENCES admins(id),actor_name text,actor_email text,actor_role text NOT NULL,
      actor_account_type text NOT NULL,actor_is_focal boolean,actor_office office,action_type text NOT NULL,target_type text NOT NULL,
      target_id int NOT NULL,target_summary text,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only audit'; END $$;
    CREATE TRIGGER fixture_append_only BEFORE UPDATE OR DELETE ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
  `);
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
  const db = drizzle(raw);
  const queries = new ReportExportQueries(db, raw);
  const audit = new AdminAuditService(db);
  const reports = new ReportsService({}, {}, {}, audit, queries);
  const meo = {
    adminId: 1,
    adminName: 'MEO Staff',
    email: 'meo@test',
    accountType: 'PERSONNEL',
    isFocal: false,
    office: 'MEO',
  };
  const mdrrmo = { ...meo, adminId: 2, office: 'MDRRMO' };
  let checks = 0;
  const ok = (label) => console.log(`ok ${++checks} - ${label}`);
  try {
    const filters = parseReportExportFilters(
      { dateFrom: '2026-01-02', dateTo: '2026-01-02' },
      meo,
      true,
    );
    const submitted = await queries.submitted(filters);
    assert.deepEqual(
      submitted.map((r) => r.tracking_reference),
      ['PRC-end', 'PRC-start', 'PRC-rejected'],
    );
    assert(
      submitted.every(
        (r) =>
          r.assigned_office === 'MEO' &&
          !('title' in r) &&
          !('severity_screening_remarks' in r),
      ),
    );
    assert.deepEqual(
      (await queries.submitted({ ...filters, office: 'MDRRMO' })).map(
        (r) => r.tracking_reference,
      ),
      ['PRC-other'],
    );
    ok(
      'real Drizzle submitted query: both offices, merged-away excluded, current/submitted categories, Manila start/end microseconds',
    );
    const assessed = await queries.assessments(
      parseReportExportFilters({}, meo),
    );
    assert.deepEqual(
      assessed.map((r) => r.ticket_id),
      [5, 1],
    );
    const one = assessed.find((r) => r.ticket_id === 1);
    assert.deepEqual(
      [one.pending, one.in_progress, one.completed, one.cancelled],
      [1, 1, 1, 1],
    );
    assert.deepEqual(
      (await queries.assessments(parseReportExportFilters({}, mdrrmo))).map(
        (r) => r.ticket_id,
      ),
      [2],
    );
    await assert.rejects(
      raw`INSERT INTO operational_assessments(ticket_id) VALUES(1)`,
      (e) => e.code === '23505',
    );
    assert.equal(
      (
        await queries.assessments(
          parseReportExportFilters({ dateFrom: '2026-01-03' }, meo),
        )
      ).length,
      0,
    );
    ok(
      'real Drizzle assessment query: one current record per ticket enforced, both offices, unassessed/merged excluded, four status counts and assessed date',
    );
    assert.deepEqual(
      (await queries.priority('MEO', 2)).map((r) => r.ticket_id),
      [5, 6],
    );
    assert.deepEqual(
      (await queries.priority('MEO', 20)).map((r) => r.ticket_id),
      [5, 6, 1, 7, 9],
    );
    assert.deepEqual(
      (await queries.priority('MDRRMO', 1)).map((r) => r.ticket_id),
      [2],
    );
    assert.equal(
      (await queries.priority('MEO', 1))[0].hazard_summary,
      'Flood: MF (Moderate)',
    );
    ok(
      'real priority query: active only, both offices, merged/Resolved/Rejected excluded, descending score then oldest then id, top N and hazard summary',
    );
    for (const actor of [meo, mdrrmo])
      for (const method of [
        'submittedReportsCsv',
        'operationalAssessmentsCsv',
        'priorityIncidentsCsv',
      ]) {
        const csv = await reports[method](
          { office: actor.office === 'MEO' ? 'MDRRMO' : 'MEO', top: '2' },
          actor,
        );
        assert(csv.includes(actor.office));
        if (method === 'submittedReportsCsv')
          for (const secret of [
            'PRIVATE',
            'CITIZEN',
            'image_url',
            'geom',
            'remarks',
          ])
            assert(!csv.includes(secret));
      }
    const events = await raw`SELECT * FROM admin_audit_events ORDER BY id`;
    assert.equal(events.length, 6);
    assert.deepEqual(
      events.slice(0, 3).map((r) => r.metadata.kind),
      ['submitted_reports', 'operational_assessments', 'priority_incidents'],
    );
    assert(
      events.every(
        (r) =>
          r.actor_is_focal === false &&
          r.target_type === 'export' &&
          r.target_id === r.actor_admin_id,
      ),
    );
    assert.equal(events[2].metadata.top, 2);
    assert(
      !JSON.stringify(events.map((e) => e.metadata)).includes(
        'PRIVATE_ASSESSMENT',
      ),
    );
    const view = await audit.list({
      actionType: 'report_exported',
      targetType: 'export',
    });
    assert.equal(view.total, 6);
    assert(view.events.every((e) => e.details.kind && e.details.rowCount > 0));
    await audit.logRequired({
      actor: { ...meo, adminId: 3 },
      actionType: 'report_exported',
      targetType: 'export',
      targetId: 3,
      targetSummary: 'Report export',
      metadata: { kind: 'submitted_reports', rowCount: 0 },
    });
    assert.equal(
      (
        await raw`SELECT actor_is_focal FROM admin_audit_events WHERE actor_admin_id=3`
      )[0].actor_is_focal,
      true,
    );
    ok(
      'real exports audit kinds/counts/top/clamped filters through drizzle, no assessment text; stored actor_is_focal including stale snapshot and safe audit view',
    );
    const before = (
      await raw`SELECT count(*)::int n FROM admin_audit_events`
    )[0].n;
    await raw`INSERT INTO tickets(id) SELECT generate_series(100,5099)`;
    await raw`INSERT INTO reports(id,ticket_id,tracking_reference) SELECT id,id,'PRC-bulk-'||id FROM tickets WHERE id BETWEEN 100 AND 5099`;
    await raw`INSERT INTO operational_assessments(ticket_id) SELECT id FROM tickets WHERE id BETWEEN 100 AND 5099`;
    for (const method of ['submittedReportsCsv', 'operationalAssessmentsCsv'])
      await assert.rejects(
        reports[method]({}, meo),
        (e) => e.getStatus() === 400 && e.message.includes('Too many rows'),
      );
    assert.equal(
      (await raw`SELECT count(*)::int n FROM admin_audit_events`)[0].n,
      before,
    );
    ok(
      'real over-limit queries refuse both heavy exports with plain 400 and no audit/file',
    );
    const fixtures = await raw.begin((tx) => insertNewExportFixtures(tx));
    assert.equal(fixtures.length, 2);
    for (const fixture of fixtures) {
      const f = {
        office: fixture.office,
        status: 'all',
        category: 'Pothole / Road Surface Damage',
      };
      const rows = await queries.submitted(f);
      assert.equal(rows.length, 4);
      assert(!rows.some((r) => r.ticket_id === fixture.ticketIds[4]));
      const assessment = await queries.assessments(f);
      assert.equal(assessment.length, 1);
      assert.equal(
        assessment[0].observed_conditions,
        fixture.assessedConditions,
      );
      assert.deepEqual(
        [
          assessment[0].pending,
          assessment[0].in_progress,
          assessment[0].completed,
          assessment[0].cancelled,
        ],
        [1, 1, 1, 1],
      );
    }
    ok(
      'insert-only E2E fixture writer also checked on drizzle-wrapped client, unique assessment, merged-away rows and completed/cancelled records',
    );
    console.log(`${checks} new export PGlite check groups passed`);
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
