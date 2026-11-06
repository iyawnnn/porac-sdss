// Isolated memory only; never loads .env or a database runner.
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
const { DashboardService } = require('../src/admin/dashboard.service.ts');
const {
  BarangayInsightsService,
} = require('../src/admin/barangay-insights.service.ts');
const { WorkOrdersService } = require('../src/admin/work-orders.service.ts');
const {
  insertDashboardMetricFixtures,
} = require('../scripts/lib/dashboard-metric-fixtures.ts');
const { ModerationService } = require('../src/admin/moderation.service.ts');

async function main() {
  const memory = new PGlite();
  await memory.exec(`
 CREATE TYPE resolution_outcome AS ENUM ('MUNICIPAL_ACTION_COMPLETED','EXTERNAL_REFERRAL');
 CREATE TYPE office AS ENUM ('MEO','MDRRMO');
 CREATE TYPE hazard_lookup_status AS ENUM ('CLASSIFIED','NO_CLASSIFICATION','TEMPORARILY_UNAVAILABLE');
 CREATE TYPE ticket_status AS ENUM ('Reported','Under Review','In Progress','Resolved','Rejected');
 CREATE TABLE barangays(id int PRIMARY KEY,name text,geom text);
 INSERT INTO barangays VALUES (1,'Fixture','point'),(2,'Empty','point');
 CREATE TABLE tickets(id serial PRIMARY KEY,barangay_id int DEFAULT 1,category text DEFAULT 'Localized Flooding',status ticket_status DEFAULT 'Reported',assigned_office office DEFAULT 'MEO',created_at timestamptz DEFAULT now()-interval '10 days',updated_at timestamptz DEFAULT now(),priority_index int DEFAULT 50,member_count int DEFAULT 1,initial_assigned_office office,resolution_notes text DEFAULT 'Fixture',resolved_by_admin_id int DEFAULT 1,merged_into_ticket_id int,resolution_outcome resolution_outcome,resolved_at timestamptz,geom text DEFAULT 'point',CHECK (resolved_at IS NULL OR (status='Resolved' AND resolution_outcome IS NOT NULL AND resolved_by_admin_id IS NOT NULL AND btrim(coalesce(resolution_notes,'')) <> '')));
 CREATE TABLE acknowledgments(ticket_id int UNIQUE,acknowledged_at timestamptz,acknowledged_by_admin_id int);
 CREATE TABLE hazard_information(id serial PRIMARY KEY,ticket_id int,hazard_context_type text,lookup_status hazard_lookup_status,susceptibility_code text,susceptibility_label text,looked_up_at timestamptz,superseded_at timestamptz,query_geom text DEFAULT 'point');
 CREATE TABLE status_history(id serial PRIMARY KEY,ticket_id int,status ticket_status,changed_at timestamptz,admin_id int,admin_name text,resolution_outcome resolution_outcome,resolution_notes text);
 CREATE TABLE reports(id serial PRIMARY KEY,ticket_id int,title text,citizen_id int,description text,submitted_category text,geom text,pin_geom text,created_at timestamptz DEFAULT now(),citizen_severity text DEFAULT 'High',flags text[] DEFAULT ARRAY['MISSING_METADATA'],moderation_status text,moderated_at timestamptz);
 CREATE TABLE work_orders(id serial PRIMARY KEY,ticket_id int,title text DEFAULT 'Fixture',notes text,assigned_office office,status text DEFAULT 'pending',due_date timestamptz DEFAULT now()-interval '1 day',assigned_admin_id int,created_by_admin_id int,created_at timestamptz DEFAULT now()-interval '10 days',updated_at timestamptz DEFAULT now(),completed_at timestamptz,cancellation_reason text,cancelled_by_admin_id int,cancelled_at timestamptz,replacement_work_order_id int);
 CREATE TABLE admins(id int,first_name text,last_name text,office office,account_type text,is_focal boolean,is_active boolean);
 INSERT INTO admins VALUES (1,'MEO','Staff','MEO','PERSONNEL',false,true),(2,'MDRRMO','Staff','MDRRMO','PERSONNEL',false,true);
 CREATE TABLE citizens(id int,email text);INSERT INTO citizens VALUES(1,'citizen1@porac.ph');
 CREATE TABLE work_order_status_history(id serial PRIMARY KEY,work_order_id int,status text,changed_at timestamptz);
 CREATE TABLE dem_points(elevation_m real,geom text);
 CREATE FUNCTION ST_Equals(text,text) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT $1=$2';
 CREATE FUNCTION ST_Contains(text,text) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT $1=$2';
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
  let checks = 0;
  const ok = (label) => console.log(`ok ${++checks} - ${label}`);
  const wrapped = drizzle(raw);
  try {
    await wrapped.transaction(async (db) => {
      const sql = db.session.client;
      const dashboard = new DashboardService(sql);
      const barangays = new BarangayInsightsService(sql);
      const wo = new WorkOrdersService(db, {}, {});
      const moderation = new ModerationService(sql, {}, {});
      let m = await dashboard.getOperationalMetrics('MDRRMO');
      assert.deepEqual(m.ticketCounts, {
        pending: 0,
        resolved: 0,
        rejected: 0,
      });
      assert.equal(m.acknowledgments.medianHours30d, null);
      assert(m.hazardInformation.every((r) => r.count === 0));
      assert.equal(
        (await dashboard.getDashboardKpis('MDRRMO'))
          .median_resolution_hours_30d,
        null,
      );
      ok('empty office returns zero buckets and null medians');
      await sql`INSERT INTO tickets(id,status,resolution_outcome,resolved_at,created_at) VALUES
   (1,'Reported',NULL,NULL,now()-interval '4 hours'),(2,'Under Review',NULL,NULL,now()-interval '6 hours'),
   (3,'In Progress',NULL,NULL,now()-interval '104 hours'),
   (4,'Resolved','MUNICIPAL_ACTION_COMPLETED',now()-interval '1 day',now()-interval '25 hours'),
   (5,'Resolved','EXTERNAL_REFERRAL',now()-interval '1 day',now()-interval '27 hours'),
   (6,'Resolved',NULL,NULL,now()-interval '100 days'),(7,'Rejected',NULL,NULL,now()-interval '10 days')`;
      await sql`INSERT INTO tickets(id,assigned_office,status,merged_into_ticket_id) VALUES (8,'MEO','Reported',1),(9,'MDRRMO','Reported',NULL)`;
      await sql`INSERT INTO tickets(id,category,status) VALUES (10,'Pothole / Road Surface Damage','Reported'),(11,'Lahar or Volcanic Debris-Flow Threat','Reported'),(12,'Rain-Induced Slope Failure/Landslide','Reported')`;
      await sql`INSERT INTO tickets(id,status,resolution_outcome,resolved_at,created_at,merged_into_ticket_id)
        VALUES(20,'Resolved','MUNICIPAL_ACTION_COMPLETED',now(),now()-interval '1000 hours',1)`;
      await sql`INSERT INTO acknowledgments(ticket_id,acknowledged_at) VALUES (1,now()-interval '3 hours'),(2,now()-interval '3 hours'),(3,now()-interval '4 hours'),(8,now()),(9,now())`;
      await sql`INSERT INTO status_history(ticket_id,status,changed_at) SELECT id,status,created_at FROM tickets WHERE status <> 'Reported'`;
      await sql`INSERT INTO reports(ticket_id,title) SELECT id,'Fixture' FROM tickets`;
      await sql`INSERT INTO hazard_information(ticket_id,hazard_context_type,lookup_status,superseded_at) VALUES
    (1,'FLOOD','CLASSIFIED',NULL),(1,'FLOOD','TEMPORARILY_UNAVAILABLE',now()),
    (2,'FLOOD','NO_CLASSIFICATION',NULL),(3,'FLOOD','TEMPORARILY_UNAVAILABLE',NULL),
    (8,'FLOOD','CLASSIFIED',NULL),(9,'FLOOD','CLASSIFIED',NULL),(10,'FLOOD','CLASSIFIED',NULL),
    (12,'FLOOD','CLASSIFIED',NULL)`;
      await sql`INSERT INTO hazard_information(ticket_id,hazard_context_type,lookup_status,query_geom) VALUES(4,'FLOOD','CLASSIFIED','old point')`;
      m = await dashboard.getOperationalMetrics('MEO');
      assert.deepEqual(m.ticketCounts, {
        pending: 6,
        resolved: 3,
        rejected: 1,
      });
      assert.deepEqual(
        m.resolutionOutcomes.map((r) => r.count),
        [1, 1, 1],
      );
      assert.deepEqual(m.acknowledgments, {
        acknowledged: 3,
        awaiting: 3,
        medianHours30d: 3,
      });
      assert.deepEqual(
        m.hazardInformation.map((r) => r.count),
        [1, 1, 1, 5],
      );
      const other = await dashboard.getOperationalMetrics('MDRRMO');
      assert.deepEqual(other.ticketCounts, {
        pending: 1,
        resolved: 0,
        rejected: 0,
      });
      assert.equal(other.acknowledgments.medianHours30d, 240);
      ok(
        'office scopes, merged/Rejected exclusions, legacy outcomes, active acknowledgment split, hazard applicability/current/context buckets and odd median vs mean',
      );
      assert.equal(
        (await dashboard.getDashboardKpis('MEO')).median_resolution_hours_30d,
        2,
      );
      await sql`INSERT INTO tickets(id,status,resolution_outcome,resolved_at,created_at) VALUES (13,'Resolved','MUNICIPAL_ACTION_COMPLETED',now(),now()-interval '100 hours')`;
      assert.equal(
        (await dashboard.getDashboardKpis('MEO')).median_resolution_hours_30d,
        3,
      );
      await sql`INSERT INTO tickets(id,status,resolution_outcome,resolved_at,created_at) VALUES
    (14,'Resolved','MUNICIPAL_ACTION_COMPLETED',now()-interval '30 days',now()-interval '30 days 9 hours'),
    (15,'Resolved','MUNICIPAL_ACTION_COMPLETED',now()-interval '30 days 1 microsecond',now()-interval '30 days 1000 hours'),
    (16,'Resolved','MUNICIPAL_ACTION_COMPLETED',now()+interval '1 microsecond',now()-interval '1000 hours')`;
      assert.equal(
        (await dashboard.getDashboardKpis('MEO')).median_resolution_hours_30d,
        6,
      );
      await sql`INSERT INTO tickets(id,created_at) VALUES (17,now()-interval '30 days 9 hours'),(18,now()-interval '30 days 1000 hours'),(19,now()-interval '1000 hours')`;
      await sql`INSERT INTO acknowledgments(ticket_id,acknowledged_at) VALUES (17,now()-interval '30 days'),(18,now()-interval '30 days 1 microsecond'),(19,now()+interval '1 microsecond')`;
      assert.equal(
        (await dashboard.getOperationalMetrics('MEO')).acknowledgments
          .medianHours30d,
        6,
      );
      ok(
        'even and odd resolution medians, even acknowledgment median; inclusive lower/exclusive outside/future 30-day boundaries; legacy has no fallback',
      );
      const index = await barangays.listInsights('MEO');
      const row = index.find((r) => r.barangay_id === 1);
      assert.equal(row.total_tickets, 16);
      assert.equal(row.rejected_tickets, 1);
      assert.equal(index.find((r) => r.barangay_id === 2).total_tickets, 0);
      const profile = await barangays.getProfile(1, 'MEO');
      assert.equal(profile.kpis.total_tickets, 16);
      assert.equal(profile.kpis.rejected_tickets, 1);
      assert.equal(
        profile.categoryBreakdown.reduce((a, r) => a + r.count, 0),
        16,
      );
      assert.equal(
        (await barangays.listInsights('MDRRMO'))[1].total_tickets,
        1,
      );
      assert.equal(
        (await barangays.getProfile(1, 'MDRRMO')).kpis.total_tickets,
        1,
      );
      const empty = await barangays.getProfile(2, 'MEO');
      assert.equal(empty.kpis.total_tickets, 0);
      assert.equal(empty.categoryBreakdown.length, 0);
      ok(
        'Barangay list/profile totals and category counts exclude Rejected and merged-away, separate rejected count, both office directions and empty barangay',
      );
      await sql`INSERT INTO work_orders(ticket_id,assigned_office) VALUES (1,'MEO'),(8,'MEO'),(9,'MDRRMO')`;
      await sql`INSERT INTO work_order_status_history(work_order_id,status,changed_at) SELECT id,status,created_at FROM work_orders`;
      assert.equal(
        (await wo.getOfficePerformanceCounts('MEO')).pendingWorkOrders,
        1,
      );
      assert.equal(
        (await wo.getNeedsAttention('MEO')).overdueWorkOrders.length,
        1,
      );
      assert.equal(
        (await wo.getOfficePerformanceCounts('MDRRMO')).pendingWorkOrders,
        1,
      );
      assert.equal((await moderation.getModerationStats('MEO')).pending, 10);
      assert.equal(
        (await dashboard.getDashboardKpis('MEO')).reports_this_month_count,
        10,
      );
      assert.equal(
        (await dashboard.getIncidentTrend(7, 'MEO')).reduce(
          (a, r) => a + r.report_count,
          0,
        ),
        10,
      );
      assert.equal(
        (await dashboard.getCitizenSeverityDistribution('MEO'))[0].count,
        10,
      );
      assert.equal((await dashboard.getKpiDeltas('MEO')).reports.current, 10);
      assert.equal(
        (await dashboard.getPendingWorkOrderTrend(7, 'MEO')).at(-1).count,
        1,
      );
      ok(
        'existing report figures, severity and report delta exclude merged parents; Work Order counts/attention/history retain matching scoped counts',
      );
      await sql`SELECT setval(pg_get_serial_sequence('tickets','id'),100)`;
      const fixtures = await insertDashboardMetricFixtures(sql);
      assert.equal(fixtures.length, 2);
      for (const f of fixtures) {
        const ids = f.ticketIds;
        const [facts] =
          await sql`SELECT count(*) FILTER(WHERE status='Resolved' AND resolved_at IS NOT NULL AND resolution_outcome IS NOT NULL)::int resolved,
    count(*) FILTER(WHERE status <> 'Reported' AND NOT EXISTS(SELECT 1 FROM status_history sh WHERE sh.ticket_id=t.id))::int missing_history
    FROM tickets t WHERE id=ANY(${ids}::int[])`;
        assert.equal(facts.resolved, 2);
        assert.equal(facts.missing_history, 0);
        assert.equal(
          (await sql`SELECT * FROM acknowledgments WHERE ticket_id=${ids[0]}`)
            .length,
          1,
        );
      }
      ok(
        'insert-only metric fixtures: both offices, full Resolved records, legacy case, non-Reported status history and ticket acknowledgments',
      );
    });
    console.log(`${checks} dashboard PGlite check groups passed`);
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
