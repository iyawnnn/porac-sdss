// Disposable, in-memory rows only. No .env, migration runner or seed runner.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
require('reflect-metadata');
require('tsx/cjs');
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { TicketsService } = require('../dist/admin/tickets.service');
const { ModerationService } = require('../dist/admin/moderation.service');
const { WorkOrdersService } = require('../dist/admin/work-orders.service');
const { ReportsService } = require('../dist/admin/reports.service');
const { AdminAuditService } = require('../dist/admin/admin-audit.service');
const { EXPORT_LIMIT_MESSAGE } = require('../dist/admin/export-limit');
const { insertExportFixtures } = require('../scripts/lib/export-fixtures.ts');

async function main() {
  const memory = new PGlite();
  await memory.exec(`
    CREATE TYPE office AS ENUM ('MEO', 'MDRRMO');
    CREATE TYPE ticket_status AS ENUM ('Reported','Under Review','In Progress','Resolved','Rejected');
    CREATE TABLE admins (id int PRIMARY KEY, first_name text, last_name text, email text,
      role text, account_type text, is_focal boolean, office office);
    INSERT INTO admins VALUES (1,'MEO','Staff','staff@test','officer','PERSONNEL',false,'MEO'),
      (2,'Focal','Staff','focal@test','focal','PERSONNEL',true,'MDRRMO');
    CREATE TABLE barangays (id int PRIMARY KEY, name text);
    INSERT INTO barangays VALUES (1,'Fixture barangay');
    CREATE TABLE tickets (id int PRIMARY KEY, status ticket_status DEFAULT 'Reported', assigned_office office DEFAULT 'MEO',
      category text DEFAULT 'Localized Flooding', barangay_id int DEFAULT 1, priority_index int DEFAULT 50,
      member_count int DEFAULT 1, created_at timestamptz DEFAULT '2026-01-01', updated_at timestamptz DEFAULT '2026-01-02',
      merged_into_ticket_id int, resolution_outcome text, resolved_at timestamptz, category_review_required boolean DEFAULT false, geom text);
    -- Geometry is irrelevant to export hardening. The real correlated query
    -- runs against an empty hazard table, with a text equality stand-in only.
    CREATE FUNCTION ST_Equals(text,text) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT $1 = $2';
    CREATE TABLE hazard_information (id int, ticket_id int, hazard_context_type text, lookup_status text,
      susceptibility_code text, susceptibility_label text, query_geom text, superseded_at timestamptz, looked_up_at timestamptz);
    INSERT INTO tickets(id) VALUES (1);
    INSERT INTO tickets(id, assigned_office) VALUES (2,'MDRRMO');
    INSERT INTO tickets(id, merged_into_ticket_id) VALUES (3,1);
    INSERT INTO tickets(id, status) VALUES (4,'Rejected');
    CREATE TABLE citizens (id int PRIMARY KEY, first_name text, last_name text);
    INSERT INTO citizens VALUES (1,'PRIVATE','CITIZEN');
    CREATE TABLE reports (id int PRIMARY KEY, ticket_id int, citizen_id int DEFAULT 1,
      tracking_reference text, title text DEFAULT 'PRIVATE TITLE', citizen_severity text DEFAULT 'High',
      flags text[] DEFAULT ARRAY['MISSING_METADATA'], location_mismatch_m real,
      moderation_status text, moderated_by text, moderated_at timestamptz, created_at timestamptz DEFAULT '2026-01-01');
    INSERT INTO reports(id,ticket_id,tracking_reference) SELECT id,id,'PRC-2026-' || id FROM tickets;
    CREATE TABLE work_orders (id int PRIMARY KEY, ticket_id int, title text DEFAULT 'Task', notes text DEFAULT 'PRIVATE NOTE',
      assigned_office office, assigned_admin_id int DEFAULT 1, status text DEFAULT 'pending', due_date timestamptz,
      completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text, replacement_work_order_id int,
      created_at timestamptz DEFAULT '2026-01-01', updated_at timestamptz DEFAULT '2026-01-02');
    INSERT INTO work_orders(id,ticket_id,assigned_office) SELECT id,id,assigned_office FROM tickets;
    INSERT INTO work_orders(id,ticket_id,assigned_office,status,cancelled_at,cancellation_reason,replacement_work_order_id)
      VALUES (5,1,'MEO','cancelled','2026-01-02','Replaced',1);
    CREATE TABLE admin_audit_events (id serial PRIMARY KEY, actor_admin_id int NOT NULL REFERENCES admins(id),
      actor_name text NOT NULL, actor_email text NOT NULL, actor_role text NOT NULL, actor_account_type text NOT NULL,
      actor_is_focal boolean, actor_office office, action_type text NOT NULL, target_type text NOT NULL,
      target_id int NOT NULL, target_summary text NOT NULL, metadata jsonb, created_at timestamptz DEFAULT now());
    CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit is append-only'; END $$;
    CREATE TRIGGER fixture_append_only BEFORE UPDATE OR DELETE ON admin_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
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
      debug: (_connection, _query, params) =>
        assert(
          !params.some((p) => p instanceof Date),
          'JS Date reached postgres.js',
        ),
    },
  );
  const db = drizzle(raw);
  const tickets = Object.assign(Object.create(TicketsService.prototype), {
    pg: raw,
  });
  const moderation = Object.assign(Object.create(ModerationService.prototype), {
    pg: raw,
  });
  const workOrders = Object.assign(Object.create(WorkOrdersService.prototype), {
    db,
  });
  const audit = new AdminAuditService(db);
  const reports = new ReportsService(tickets, workOrders, moderation, audit);
  const actor = {
    adminId: 1,
    adminName: 'Staff',
    email: 'staff@test',
    accountType: 'PERSONNEL',
    isFocal: false,
    office: 'MEO',
  };
  let checks = 0;
  const ok = (label) => console.log(`ok ${++checks} - ${label}`);
  try {
    const ticketRows = await tickets.getTicketsForExport({
      office: 'MEO',
      status: 'all',
      dateFrom: new Date('2025-01-01'),
      dateTo: new Date('2027-01-01'),
    });
    assert.deepEqual(ticketRows.map((r) => r.id).sort(), [1, 4]);
    assert.deepEqual(
      (await tickets.getTicketsForExport({ office: 'MEO' })).map((r) => r.id),
      [1],
    );
    assert.deepEqual(
      (
        await tickets.getTicketsForExport({ office: 'MEO', status: 'Rejected' })
      ).map((r) => r.id),
      [4],
    );
    ok(
      'real ticket query: own office, merged-away excluded even for all, Rejected explicit/all only, ISO date parameters',
    );
    const flagged = await moderation.getModerationForExport({
      office: 'MEO',
      status: 'all',
    });
    assert.deepEqual(flagged.map((r) => r.id).sort(), [1, 4]);
    assert(
      flagged.every(
        (r) =>
          r.tracking_reference && !('title' in r) && !('citizen_name' in r),
      ),
    );
    const opposite = await moderation.getModerationForExport({
      office: 'MDRRMO',
    });
    assert.deepEqual(
      opposite.map((r) => r.id),
      [2],
    );
    ok(
      'real flagged query: tracking reference, no name/title projection, both offices, merged-away exclusion',
    );
    const orders = await workOrders.getWorkOrdersForExport({
      office: 'MEO',
      dateFrom: new Date('2025-01-01'),
    });
    assert.deepEqual(orders.map((r) => r.id).sort(), [1, 4, 5]);
    assert(orders.every((r) => !('notes' in r)));
    assert.equal(
      orders.find((r) => r.id === 5).cancellation_reason,
      'Replaced',
    );
    assert.equal(orders.find((r) => r.id === 5).replacement_work_order_id, 1);
    assert.equal(
      orders.find((r) => r.id === 5).cancelled_at.toISOString(),
      '2026-01-02T00:00:00.000Z',
    );
    assert.equal(orders.find((r) => r.id === 1).cancelled_at, null);
    ok(
      'real Drizzle work-order query: scope, merged-away exclusion, Rejected retained, cancellation columns and no notes',
    );
    for (const method of ['ticketsCsv', 'flaggedCsv', 'workOrdersCsv']) {
      const csv = await reports[method](
        { status: 'all', office: 'MDRRMO' },
        actor,
      );
      assert(!csv.includes('PRIVATE'));
    }
    const events = await raw`SELECT * FROM admin_audit_events ORDER BY id`;
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((r) => r.metadata.kind),
      ['tickets', 'flagged', 'work_orders'],
    );
    assert.deepEqual(
      events.map((r) => r.metadata.rowCount),
      [2, 2, 3],
    );
    assert(
      events.every(
        (r) =>
          r.target_type === 'export' &&
          r.target_id === 1 &&
          r.actor_is_focal === false &&
          r.metadata.office === 'MEO',
      ),
    );
    // Stale caller snapshot cannot override the stored Focal snapshot.
    await audit.logRequired({
      actor: { ...actor, adminId: 2 },
      actionType: 'report_exported',
      targetType: 'export',
      targetId: 2,
      targetSummary: 'Report export',
      metadata: { kind: 'tickets', rowCount: 0 },
    });
    assert.equal(
      (
        await raw`SELECT actor_is_focal FROM admin_audit_events WHERE actor_admin_id = 2`
      )[0].actor_is_focal,
      true,
    );
    const view = await audit.list({
      actionType: 'report_exported',
      targetType: 'export',
      targetId: 1,
    });
    assert.equal(view.total, 3);
    assert(
      view.events.every(
        (e) => e.details.office === 'MEO' && e.details.rowCount > 0,
      ),
    );
    ok(
      'required audit INSERT through drizzle-wrapped client; kind/count/clamped filters, stored actor_is_focal and readable view',
    );
    await raw`CREATE FUNCTION refuse_export_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$`;
    await raw`CREATE TRIGGER refuse_export_audit BEFORE INSERT ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION refuse_export_audit()`;
    for (const method of ['ticketsCsv', 'flaggedCsv', 'workOrdersCsv'])
      await assert.rejects(
        reports[method]({}, actor),
        (err) => err.cause?.message === 'audit unavailable',
      );
    assert.equal(
      (await raw`SELECT count(*)::int n FROM admin_audit_events`)[0].n,
      4,
    );
    await raw`DROP TRIGGER refuse_export_audit ON admin_audit_events`;
    ok(
      'real audit insert failure closes all exports without a file or extra event',
    );
    await raw`INSERT INTO tickets(id) SELECT generate_series(100,5099)`;
    await raw`INSERT INTO reports(id,ticket_id,tracking_reference) SELECT id,id,'PRC-' || id FROM tickets WHERE id >= 100`;
    await raw`INSERT INTO work_orders(id,ticket_id,assigned_office) SELECT id,id,'MEO' FROM tickets WHERE id >= 100`;
    for (const method of ['ticketsCsv', 'flaggedCsv', 'workOrdersCsv'])
      await assert.rejects(
        reports[method]({ status: 'all' }, actor),
        new RegExp(EXPORT_LIMIT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    assert.equal(
      (await raw`SELECT count(*)::int n FROM admin_audit_events`)[0].n,
      4,
    );
    ok(
      'real queries over 5,000 refuse all three exports with the plain message and no audit',
    );
    // Exercise the new insert-only E2E fixture writer on the same disposable
    // PostgreSQL client wrapped above by drizzle(), never a real database.
    await memory.exec(`
      ALTER TABLE citizens ADD COLUMN email text;
      INSERT INTO citizens VALUES (2,'Export','Citizen','citizen1@porac.ph');
      CREATE SEQUENCE export_fixture_ticket_ids START 10000;
      ALTER TABLE tickets ALTER COLUMN id SET DEFAULT nextval('export_fixture_ticket_ids');
      ALTER TABLE tickets ADD COLUMN initial_assigned_office office;
      CREATE SEQUENCE export_fixture_report_ids START 10000;
      ALTER TABLE reports ALTER COLUMN id SET DEFAULT nextval('export_fixture_report_ids');
      ALTER TABLE reports ALTER COLUMN tracking_reference SET DEFAULT 'PRC-FIXTURE-' || currval('export_fixture_report_ids');
      ALTER TABLE reports ADD COLUMN description text;
      ALTER TABLE reports ADD COLUMN image_url text;
      ALTER TABLE reports ADD COLUMN submitted_category text;
      ALTER TABLE reports ADD COLUMN geom text;
      ALTER TABLE reports ADD COLUMN pin_geom text;
    `);
    const fixtures = await raw.begin((tx) => insertExportFixtures(tx));
    assert.equal(fixtures.length, 2);
    for (const fixture of fixtures) {
      const rows = await moderation.getModerationForExport({
        office: fixture.office,
        ids: fixtures.map((f) => f.reportId),
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].tracking_reference, fixture.trackingReference);
      assert.equal(rows[0].id, fixture.reportId);
    }
    ok(
      'insert-only E2E fixture writer runs through the drizzle-wrapped client and yields distinct scoped tracking references',
    );
    console.log(`${checks} export PGlite check groups passed`);
  } finally {
    await raw.end();
    await server.stop();
    await memory.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
