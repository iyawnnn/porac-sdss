// In-memory PostgreSQL only. No env files, real database, or seed runners.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
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
  ALIGNMENT_SQL,
  migrateAssessmentAlignment,
} = require('../scripts/migrations/migrate-operational-assessment-alignment.ts');
const {
  migrateAssessmentWorkOrders,
} = require('../scripts/migrations/migrate-assessment-work-orders.ts');
const {
  OperationalAssessmentService,
} = require('../src/admin/operational-assessment.service.ts');
const { WorkOrdersService } = require('../src/admin/work-orders.service.ts');
const { AdminAuditService } = require('../src/admin/admin-audit.service.ts');
const {
  ReportExportQueries,
} = require('../src/admin/report-export-queries.ts');
const { ReportsService } = require('../src/admin/reports.service.ts');
const { retireE2EAdmins } = require('../scripts/lib/retire-e2e-admins.ts');
const migration = (name) =>
  fs.readFileSync(path.join(__dirname, '../drizzle', name), 'utf8');
let checks = 0;
const ok = (label) => console.log(`ok ${++checks} - ${label}`);
async function baseline(populated = true) {
  const db = new PGlite();
  // Execute the actual non-spatial baseline, including original retired columns.
  // Only CREATE EXTENSION postgis is omitted: this harness never evaluates ST_*.
  await db.exec(
    migration('0000_soft_landau.sql').replace(
      'CREATE EXTENSION IF NOT EXISTS postgis;',
      '',
    ),
  );
  for (const file of [
    '0003_short_sinister_six.sql',
    '0004_ticket_priority_score.sql',
    '0011_ticket_rejected_flagged.sql',
    '0016_admin_system_role.sql',
    '0018_admin_audit_events.sql',
    '0019_admin_password_security.sql',
    '0020_admin_status.sql',
    '0030_admin_focal_role.sql',
  ])
    await db.exec(migration(file));
  await db.exec(`
    INSERT INTO admins(id,first_name,last_name,email,password_hash,role,office) VALUES
      (1,'MEO','Creator','meo@test','unused','officer','MEO'),
      (2,'MEO','Editor','e2e-editor@porac.gov.ph','unused','officer','MEO'),
      (3,'MDRRMO','Staff','mdrrmo@test','unused','officer','MDRRMO'),
      (4,'MIS','Staff','mis@test','unused','system_admin',NULL),
      (5,'Focal','Staff','focal@test','unused','focal','MDRRMO'),
      (6,'Unused','Test','e2e-unused@porac.gov.ph','unused','officer','MEO'),
      (7,'Referenced','Test','e2e-referenced@porac.gov.ph','unused','officer','MEO');
    CREATE TABLE barangays(id int PRIMARY KEY,name text);
    INSERT INTO barangays VALUES(1,'Fixture');
    ALTER TABLE tickets ADD COLUMN merged_into_ticket_id int,ADD COLUMN resolution_outcome text,ADD COLUMN resolved_at timestamptz;
    INSERT INTO tickets(id,category,barangay_id,assigned_office,priority_index) SELECT n,'Pothole / Road Surface Damage',1,'MEO',50 FROM generate_series(1,20) n;
  `);
  for (const file of [
    '0021_work_orders.sql',
    '0027_work_order_status_history.sql',
    '0031_report_acknowledgments.sql',
    '0033_operational_assessments.sql',
    '0039_staff_account_types.sql',
    '0045_assessment_work_orders.sql',
    '0047_audit_append_only.sql',
  ])
    await db.exec(migration(file));
  await db.exec(`INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_by_name,observed_conditions,assessed_at,updated_at) VALUES
    (1,1,'Original Creator','Original conditions','2001-01-01T16:00:00.123456Z','2001-01-02T00:00:00Z');
    CREATE TABLE dem_points(id int PRIMARY KEY,elevation_m real NOT NULL,geom text NOT NULL);
    INSERT INTO dem_points VALUES(1,0,'terrain-a'),(2,100,'terrain-b');
  `);
  await db.exec(migration('0007_config.sql'));
  if (populated)
    await db.exec(`
    INSERT INTO reports(ticket_id,title,citizen_severity,image_url,elevation_m) VALUES(1,'Private','High','private',12),(2,'Other','Low','private',NULL);
    INSERT INTO report_acknowledgments(report_id,acknowledged_by_admin_id,acknowledged_by_name,remarks) VALUES(1,5,'Historical Focal','Private remark');
    UPDATE tickets SET elevation_m=12,elevation_factor=0.5,precipitation_factor=0.2,cluster_factor=0.1,urgency_score=0.4,urgency_band='Low',priority_score=40,urgency_level='LOW' WHERE id=1;
    INSERT INTO work_orders(ticket_id,title,notes,assigned_office,created_by_admin_id) VALUES(1,'Existing work','Private existing notes','MEO',1);
    INSERT INTO work_order_status_history(work_order_id,status,admin_id,admin_name) VALUES(1,'pending',1,'Original Creator');
    UPDATE operational_assessments SET deferment_reason='Original defer',referral_reason='Original referral',operational_constraints=ARRAY['weather'],operational_constraint_notes='{"weather":"Rain"}';
    INSERT INTO admin_audit_events(actor_admin_id,actor_name,actor_email,actor_role,actor_account_type,action_type,target_type,target_id,target_summary,metadata) VALUES(1,'Historical','private@test','officer','PERSONNEL','operational_assessment_created','ticket',1,'Private','{"historical":"unchanged"}');
  `);
  else await db.exec('DELETE FROM operational_assessments');
  await apply(db);
  return db;
}
async function apply(db, sql = ALIGNMENT_SQL) {
  await db.exec('BEGIN');
  try {
    await db.exec(sql);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
async function snapshot(db) {
  const result = {};
  for (const sql of [
    "SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) def FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2",
    "SELECT conrelid::regclass::text tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
    'SELECT pg_get_triggerdef(oid) def FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname',
    "SELECT pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname",
    "SELECT definition FROM pg_rules WHERE schemaname='public' ORDER BY tablename,rulename",
    "SELECT indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname",
  ])
    result[sql] = (await db.query(sql)).rows;
  for (const { tablename } of (
    await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows)
    result[tablename] = (
      await db.query(
        `SELECT to_jsonb(t) value FROM "${tablename}" t ORDER BY to_jsonb(t)::text`,
      )
    ).rows;
  return JSON.stringify(result);
}
const {
  CONTRACTION_SQL,
} = require('../scripts/migrations/contracted-state.ts');
const {
  migratePhase8bContraction,
} = require('../scripts/migrations/migrate-phase8b-contraction.ts');
const {
  migrateStaffAccountTypes,
} = require('../scripts/migrations/migrate-staff-account-types.ts');
async function main() {
  assert(
    !require.cache[require.resolve('../scripts/db.ts')],
    'Injectable runners must not import a real client',
  );
  ok('all runner imports are free of standalone database-client side effects');
  for (const populated of [false, true]) {
    const db = await baseline(populated);
    try {
      const initial = JSON.parse(await snapshot(db));
      await apply(db, CONTRACTION_SQL);
      const once = await snapshot(db);
      const final = JSON.parse(once);
      for (const table of [
        'admins',
        'dem_points',
        'report_acknowledgments',
        'admin_audit_events',
        'work_orders',
      ])
        assert.deepEqual(final[table], initial[table]);
      const data = await db.query(
        'SELECT priority_index FROM tickets ORDER BY id',
      );
      assert(data.rows.every((row) => row.priority_index === 50));

      await apply(db, CONTRACTION_SQL);
      assert.equal(await snapshot(db), once);
      ok(
        `${populated ? 'populated' : 'empty'} real 0039/0047/0033/0045/0048 baseline contracts twice without further changes`,
      );
    } finally {
      await db.close();
    }
  }
  const failures = [
    [
      'rule dependency',
      'CREATE RULE surprise_rule AS ON INSERT TO reports WHERE NEW.elevation_m > 0 DO ALSO SELECT 1',
    ],

    [
      'wrong priority type',
      'ALTER TABLE tickets ALTER COLUMN priority_index TYPE bigint',
    ],
    ['missing Terrain', 'DROP TABLE dem_points RESTRICT'],
    ['missing acknowledgments', 'DROP TABLE report_acknowledgments RESTRICT'],
    [
      'wrong staff CHECK',
      `ALTER TABLE admins DROP CONSTRAINT admins_account_type_office_focal_check; ALTER TABLE admins ADD CONSTRAINT admins_account_type_office_focal_check CHECK(true)`,
    ],

    ['missing config key', "DELETE FROM config WHERE key='rain_1h_mm'"],
    [
      'missing compatibility trigger',
      'DROP TRIGGER admin_audit_events_fill_actor_account_type ON admin_audit_events',
    ],
    [
      'wrong legacy default',
      "ALTER TABLE operational_assessments ALTER COLUMN legacy_operational_constraints SET DEFAULT ARRAY['weather']",
    ],
    [
      'invalid legacy array',
      'UPDATE operational_assessments SET legacy_operational_constraints=ARRAY[NULL]::text[]',
    ],
    [
      'invalid legacy notes',
      `UPDATE operational_assessments SET legacy_operational_constraint_notes='{"unknown":"value"}'`,
    ],
    [
      'unexpected assessment column',
      'ALTER TABLE operational_assessments ADD COLUMN surprise text',
    ],
    [
      'missing assessor FK',
      'ALTER TABLE operational_assessments DROP CONSTRAINT operational_assessments_assessed_by_admin_id_fkey',
    ],
    [
      'wrong Work Order CHECK',
      `ALTER TABLE work_orders DROP CONSTRAINT work_orders_completed_at_check; ALTER TABLE work_orders ADD CONSTRAINT work_orders_completed_at_check CHECK(true)`,
    ],
    [
      'missing Work Order index',
      'DROP INDEX work_orders_replacement_work_order_id_idx',
    ],
    [
      'materialized view dependency',
      'CREATE MATERIALIZED VIEW surprise_materialized AS SELECT elevation_m FROM reports',
    ],
    [
      'FK dependency',
      `ALTER TABLE tickets ADD CONSTRAINT urgency_unique UNIQUE(priority_score); CREATE TABLE surprise_child(score int REFERENCES tickets(priority_score))`,
    ],
    [
      'untracked function source',
      `CREATE FUNCTION old_lookup() RETURNS real LANGUAGE plpgsql AS $$ BEGIN RETURN (SELECT urgency_score FROM tickets LIMIT 1); END $$`,
    ],
    [
      'config rowtype function',
      `CREATE FUNCTION old_config() RETURNS config LANGUAGE sql AS $$ SELECT * FROM config LIMIT 1 $$`,
    ],

    ['missing object', 'ALTER TABLE reports DROP COLUMN elevation_m'],
    [
      'wrong retired type',
      'ALTER TABLE tickets ALTER COLUMN priority_score TYPE bigint',
    ],
    [
      'wrong retired default',
      'ALTER TABLE reports ALTER COLUMN elevation_m SET DEFAULT 1',
    ],
    [
      'wrong survivor default',
      "ALTER TABLE operational_assessments ALTER COLUMN assessed_conditions SET DEFAULT 'unexpected'",
    ],
    [
      'config key',
      "INSERT INTO config(key,value) VALUES('unexpected','private')",
    ],
    ['config shape', 'ALTER TABLE config ADD COLUMN surprise text'],
    [
      'view dependency',
      'CREATE VIEW unexpected_view AS SELECT urgency_score FROM tickets',
    ],
    [
      'index dependency',
      'CREATE INDEX unexpected_idx ON tickets(urgency_score)',
    ],
    [
      'CHECK dependency',
      'ALTER TABLE tickets ADD CONSTRAINT unexpected_check CHECK(urgency_score>=0)',
    ],
    [
      'function dependency',
      `CREATE FUNCTION unexpected_function() RETURNS real LANGUAGE SQL BEGIN ATOMIC SELECT urgency_score FROM tickets LIMIT 1; END`,
    ],
    [
      'mixed assessment',
      'ALTER TABLE operational_assessments DROP COLUMN legacy_referral_reason',
    ],
    ['missing config', 'DROP TABLE config'],
    [
      'wrong trigger function',
      `CREATE OR REPLACE FUNCTION admin_audit_events_fill_actor_account_type() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`,
    ],
    [
      'wrong surviving CHECK',
      `ALTER TABLE operational_assessments DROP CONSTRAINT operational_assessments_constraints_shape_check; ALTER TABLE operational_assessments ADD CONSTRAINT operational_assessments_constraints_shape_check CHECK(true)`,
    ],
    [
      'wrong Work Order FK',
      'ALTER TABLE work_orders DROP CONSTRAINT work_orders_replacement_same_ticket_fkey',
    ],
  ];
  for (const [label, setup] of failures) {
    const db = await baseline();
    try {
      await db.exec(setup);
      const before = await snapshot(db);
      await assert.rejects(apply(db, CONTRACTION_SQL));
      assert.equal(await snapshot(db), before);
      ok(`${label} aborts without changes`);
    } finally {
      await db.close();
    }
  }
  for (const [label, sql] of [
    [
      'injected failure',
      CONTRACTION_SQL.replace(
        '-- Failure-injection boundary',
        "RAISE EXCEPTION 'injected failure'; -- Failure-injection boundary",
      ),
    ],
    [
      'audit protection mutation',
      CONTRACTION_SQL.replace(
        '-- Failure-injection boundary',
        'DROP TRIGGER admin_audit_events_append_only ON public.admin_audit_events; -- Failure-injection boundary',
      ),
    ],
    [
      'DEM mutation',
      CONTRACTION_SQL.replace(
        '-- Failure-injection boundary',
        'DROP TABLE public.dem_points RESTRICT; -- Failure-injection boundary',
      ),
    ],
  ]) {
    const db = await baseline();
    try {
      assert.notEqual(sql, CONTRACTION_SQL);
      const before = await snapshot(db);
      await assert.rejects(apply(db, sql));
      assert.equal(await snapshot(db), before);
      ok(`${label} detected with full catalog/data rollback`);
    } finally {
      await db.close();
    }
  }
  // Run real services on expanded 0048 and contracted 0049, never a real DB.
  for (const contract of [false, true]) {
    const db = await baseline();
    let server, raw;
    try {
      server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
      await server.start();
      raw = postgres(
        `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
        {
          max: 1,
          onnotice: () => {},
          debug: (_c, _q, params) =>
            assert(
              !params.some((p) => p instanceof Date),
              'Raw JS Date parameter',
            ),
        },
      );
      if (!contract) {
        // Catalog bodies may have LF even when the operator's files have CRLF.
        await db.exec(
          migration('0039_staff_account_types.sql')
            .split('--> statement-breakpoint')[8]
            .replace(/\r\n/g, '\n'),
        );
        const before = await snapshot(db);
        await migrateStaffAccountTypes(raw);
        assert.equal(await snapshot(db), before);
        await raw`DROP TRIGGER admin_audit_events_fill_actor_account_type ON admin_audit_events`;
        const mixed = await snapshot(db);
        await assert.rejects(
          migrateStaffAccountTypes(raw),
          /mixed compatibility/,
        );
        assert.equal(await snapshot(db), mixed);
        await db.exec(
          migration('0039_staff_account_types.sql')
            .split('--> statement-breakpoint')
            .slice(8, 11)
            .join(';'),
        );
        ok(
          '0039 aligned rerun verifies without DDL; missing compatibility is refused, never recreated',
        );
      }
      if (contract) {
        await migratePhase8bContraction(raw);
        const before = await snapshot(db);
        await migrateAssessmentWorkOrders(raw);
        await migrateAssessmentAlignment(raw);
        await migrateStaffAccountTypes(raw);
        assert.equal(await snapshot(db), before);
        ok(
          '0045/0048/0039 contracted reruns leave all definitions/data unchanged',
        );
      }
      if (contract) {
        await raw`ALTER TABLE operational_assessments ALTER COLUMN assessed_conditions SET DEFAULT 'bad'`;
        const malformed = await snapshot(db);
        for (const run of [
          migrateAssessmentWorkOrders,
          migrateAssessmentAlignment,
          migrateStaffAccountTypes,
        ]) {
          await assert.rejects(run(raw));
          assert.equal(await snapshot(db), malformed);
        }
        await raw`ALTER TABLE operational_assessments ALTER COLUMN assessed_conditions SET DEFAULT ''`;
        ok(
          'all old runners reject a malformed contracted state without changes',
        );
      }
      const orm = drizzle(raw),
        audit = new AdminAuditService(orm),
        service = new OperationalAssessmentService(raw, audit);
      const actor = {
        adminId: 2,
        adminName: 'MEO Editor',
        email: 'e2e-editor@porac.gov.ph',
        accountType: 'PERSONNEL',
        isFocal: false,
        office: 'MEO',
      };
      const saved = await service.upsert(1, actor, {
        assessedConditions: 'Assessed on site',
        operationalConstraints: ['equipment'],
        operationalConstraintNotes: { equipment: 'Backhoe unavailable' },
        interimMitigation: 'Barricades',
        defermentOrReferralReason: 'Combined reason',
      });
      assert.equal(saved.assessedByAdminId, 1);
      assert.equal(saved.updatedByAdminId, 2);
      assert.deepEqual(saved.operationalConstraintNotes, {
        equipment: 'Backhoe unavailable',
      });
      const orders = new WorkOrdersService(
        orm,
        { create: async () => {} },
        audit,
      );
      await assert.rejects(
        orders.create({ ticketId: 8, title: 'No assessment' }, actor),
        /Assessment first/,
      );
      const order = await orders.create(
        { ticketId: 1, title: 'Inspect road' },
        actor,
      );
      assert.equal(order.ticket_id, 1);
      for (const denied of [
        { ...actor, isFocal: true },
        { ...actor, accountType: 'SYSTEM_ADMIN', office: null },
        { ...actor, office: 'MDRRMO' },
      ])
        await assert.rejects(
          orders.create({ ticketId: 1, title: 'Denied' }, denied),
        );
      const reports = new ReportsService(
        {},
        {},
        {},
        audit,
        new ReportExportQueries(orm, raw),
      );
      const csv = await reports.operationalAssessmentsCsv(
        { status: 'all' },
        actor,
      );
      assert(csv.includes('Assessed on site'));
      assert(csv.includes('Deferment or Referral Reason'));
      assert(csv.includes('Backhoe unavailable'));
      await service.upsert(
        9,
        { ...actor, adminId: 7 },
        { assessedConditions: 'Creator retained' },
      );
      const history = JSON.stringify(
        await raw`SELECT * FROM admin_audit_events ORDER BY id`,
      );
      const retired = await retireE2EAdmins(raw);
      assert.equal(retired.retired, 1);
      assert.equal(retired.deleted, 2);
      assert.equal(
        (await raw`SELECT is_active FROM admins WHERE id=7`)[0].is_active,
        false,
      );
      assert.equal(
        JSON.stringify(await raw`SELECT * FROM admin_audit_events ORDER BY id`),
        history,
      );
      ok(
        `real save/export/Work Order/role refusals/account retirement on ${contract ? '0049' : '0048'} schema`,
      );
    } finally {
      if (raw) await raw.end();
      if (server) await server.stop();
      await db.close();
    }
  }
  console.log(`${checks} contraction PGlite groups passed`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
