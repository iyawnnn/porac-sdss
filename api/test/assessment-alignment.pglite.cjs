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
  ALIGNMENT_SQL: alignmentFile,
  migrateAssessmentAlignment,
} = require('../scripts/migrations/migrate-operational-assessment-alignment.ts');
const ALIGNMENT_SQL = alignmentFile.replace(/\r\n/g, '\n');
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
async function baseline() {
  const db = new PGlite();
  await db.exec(`
    CREATE TYPE office AS ENUM ('MEO','MDRRMO');
    CREATE TYPE ticket_status AS ENUM ('Reported','Under Review','In Progress','Resolved','Rejected');
    CREATE TABLE admins(id serial PRIMARY KEY,first_name text,last_name text,email text,role text,account_type text,is_focal boolean,office office,is_active boolean DEFAULT true,session_valid_after timestamptz);
    INSERT INTO admins(id,first_name,last_name,email,role,account_type,is_focal,office) VALUES
      (1,'MEO','Creator','meo@test','officer','PERSONNEL',false,'MEO'),
      (2,'MEO','Editor','e2e-editor@porac.gov.ph','officer','PERSONNEL',false,'MEO'),
      (3,'MDRRMO','Staff','mdrrmo@test','officer','PERSONNEL',false,'MDRRMO'),
      (4,'MIS','Staff','mis@test','system_admin','SYSTEM_ADMIN',false,NULL),
      (5,'Focal','Staff','focal@test','focal','PERSONNEL',true,'MDRRMO'),
      (6,'Unused','Test','e2e-unused@porac.gov.ph','officer','PERSONNEL',false,'MEO'),
      (7,'Referenced','Test','e2e-referenced@porac.gov.ph','officer','PERSONNEL',false,'MEO');
    CREATE TABLE barangays(id int PRIMARY KEY,name text);
    INSERT INTO barangays VALUES(1,'Fixture');
    CREATE TABLE tickets(id int PRIMARY KEY,assigned_office office DEFAULT 'MEO',status ticket_status DEFAULT 'Reported',merged_into_ticket_id int,
      category text DEFAULT 'Pothole / Road Surface Damage',priority_index int DEFAULT 50,resolution_outcome text,resolved_at timestamptz,barangay_id int DEFAULT 1);
    INSERT INTO tickets(id) SELECT generate_series(1,20);
    CREATE TABLE admin_audit_events(id serial PRIMARY KEY,actor_admin_id int NOT NULL,actor_name text,actor_email text,actor_role text NOT NULL,
      actor_account_type text,actor_is_focal boolean,actor_office text,action_type text NOT NULL,target_type text NOT NULL,target_id int NOT NULL,target_summary text,metadata jsonb,created_at timestamptz DEFAULT now());
    INSERT INTO admin_audit_events(actor_admin_id,actor_role,action_type,target_type,target_id,metadata) VALUES(1,'officer','operational_assessment_created','ticket',1,'{"historical":"unchanged"}');
  `);
  for (const file of [
    '0021_work_orders.sql',
    '0027_work_order_status_history.sql',
    '0033_operational_assessments.sql',
    '0045_assessment_work_orders.sql',
    '0047_audit_append_only.sql',
  ])
    await db.exec(migration(file));
  await db.exec(`INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_by_name,observed_conditions,assessed_at,updated_at) VALUES
    (1,1,'Original Creator','Original conditions','2001-01-01T16:00:00.123456Z','2001-01-02T00:00:00Z');`);
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
  return JSON.stringify({
    columns: (
      await db.query(
        `SELECT attname,format_type(atttypid,atttypmod) type,attnotnull FROM pg_attribute WHERE attrelid='operational_assessments'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname`,
      )
    ).rows,
    constraints: (
      await db.query(
        `SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='operational_assessments'::regclass ORDER BY conname`,
      )
    ).rows,
    rows: (
      await db.query(
        'SELECT to_jsonb(a) row FROM operational_assessments a ORDER BY id',
      )
    ).rows,
    audit: (
      await db.query(
        'SELECT to_jsonb(a) row FROM admin_audit_events a ORDER BY id',
      )
    ).rows,
  });
}
async function main() {
  let db = await baseline();
  try {
    const unusual = String.raw`Rain 'quoted' \\ C:\work\site`;
    await db.query(
      `UPDATE operational_assessments SET deferment_reason=$1,referral_reason=$2,operational_constraints=ARRAY['weather','equipment'],operational_constraint_notes=$3::jsonb WHERE ticket_id=1`,
      [unusual, 'DPWH\nRoad', JSON.stringify({ weather: unusual })],
    );
    await db.exec(
      `INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,deferment_reason,referral_reason) VALUES(2,1,'Only defer',NULL),(3,1,NULL,'Only refer'),(4,1,NULL,NULL),(5,1,'','Empty companion');`,
    );
    await db.query(
      'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,operational_constraints,operational_constraint_notes) VALUES(6,1,ARRAY[$1::text,$1::text],jsonb_build_object($1::text,$2::text))',
      [unusual, unusual],
    );
    const before = (
      await db.query(
        'SELECT id,assessed_at::text,updated_at::text FROM operational_assessments ORDER BY id',
      )
    ).rows;
    await apply(db);
    const rows = (
      await db.query(
        'SELECT *,created_at::text AS original_timestamp FROM operational_assessments ORDER BY id',
      )
    ).rows;
    assert.equal(
      rows[0].deferment_or_referral_reason,
      `Deferment: ${unusual}\nReferral: DPWH\nRoad`,
    );
    assert.deepEqual(
      rows.slice(1, 5).map((r) => r.deferment_or_referral_reason),
      [
        'Only defer',
        'Only refer',
        null,
        'Deferment: \nReferral: Empty companion',
      ],
    );
    assert.deepEqual(
      rows.map((r) => r.original_timestamp),
      before.map((r) => r.assessed_at),
    );
    assert.deepEqual(rows[0].operational_constraints, {
      selected: ['weather', 'equipment'],
      notes: { weather: unusual },
    });
    assert.deepEqual(rows[3].operational_constraints, {
      selected: [],
      notes: {},
    });
    assert.equal(rows[0].legacy_deferment_reason, unusual);
    assert.deepEqual(rows[0].legacy_operational_constraints, [
      'weather',
      'equipment',
    ]);
    assert.deepEqual(rows[0].legacy_operational_constraint_notes, {
      weather: unusual,
    });
    assert.deepEqual(rows[5].operational_constraints, {
      selected: [unusual, unusual],
      notes: { [unusual]: unusual },
    });
    assert.deepEqual(
      (
        await db.query(
          'SELECT updated_at::text FROM operational_assessments ORDER BY id',
        )
      ).rows.map((r) => r.updated_at),
      before.map((r) => r.updated_at),
    );
    const once = await snapshot(db);
    await apply(db);
    assert.equal(await snapshot(db), once);
    ok(
      'real 0033/0045 populated baseline: reasons, unusual text, microsecond creation time, JSON/legacy preservation; second run unchanged',
    );
    for (const [statement, pattern] of [
      [
        'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id) VALUES(1,1)',
        /unique/i,
      ],
      [
        'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id) VALUES(10,NULL)',
        /null/i,
      ],
      [
        'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id) VALUES(10,999)',
        /foreign key/i,
      ],
      ['DELETE FROM admins WHERE id=1', /foreign key/i],
      [
        'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id) VALUES(999,1)',
        /foreign key/i,
      ],
      [
        "UPDATE operational_assessments SET operational_constraints='{}' WHERE ticket_id=1",
        /check/i,
      ],
      [
        "UPDATE operational_assessments SET supporting_evidence_url='' WHERE ticket_id=1",
        /check/i,
      ],
      [
        'UPDATE operational_assessments SET interim_mitigation=NULL WHERE ticket_id=1',
        /null/i,
      ],
    ])
      await assert.rejects(db.exec(statement), pattern);
    ok(
      'UNIQUE, assessor NOT NULL/RESTRICT FK, ticket FK, JSON shape, evidence URL and stricter mitigation constraints enforce the target',
    );
  } finally {
    await db.close();
  }
  const failures = [
    [
      'unexpected default',
      'ALTER TABLE operational_assessments ALTER COLUMN temporary_mitigation DROP DEFAULT',
      /unexpected default/,
    ],
    [
      'unexpected types',
      'ALTER TABLE operational_assessments ALTER COLUMN assessed_by_name TYPE varchar(200)',
      /unexpected or mixed/,
    ],
    [
      'NULL assessor',
      'UPDATE operational_assessments SET assessed_by_admin_id=NULL',
      /NULL assessor/,
    ],
    [
      'orphan assessor',
      'UPDATE operational_assessments SET assessed_by_admin_id=999',
      /orphan assessor/,
    ],
    [
      'duplicates',
      'ALTER TABLE operational_assessments DROP CONSTRAINT operational_assessments_ticket_id_key; INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id) VALUES(1,1)',
      /duplicate ticket/,
    ],
    [
      'NULL elements',
      "UPDATE operational_assessments SET operational_constraints=ARRAY['weather',NULL]",
      /NULL constraint elements/,
    ],
    [
      'multidimensional',
      "UPDATE operational_assessments SET operational_constraints=ARRAY[['weather'],['equipment']]",
      /multidimensional/,
    ],
    [
      'non-string notes',
      `UPDATE operational_assessments SET operational_constraints=ARRAY['weather'],operational_constraint_notes='{"weather":true}'`,
      /non-string constraint notes/,
    ],
    [
      'unselected notes',
      `UPDATE operational_assessments SET operational_constraint_notes='{"weather":"not selected"}'`,
      /unselected constraint note/,
    ],
    [
      'mixed names',
      'ALTER TABLE operational_assessments RENAME COLUMN observed_conditions TO assessed_conditions',
      /unexpected or mixed/,
    ],
  ];
  for (const [label, setup, pattern] of failures) {
    db = await baseline();
    try {
      await db.exec(setup);
      const before = await snapshot(db);
      await assert.rejects(apply(db), pattern);
      assert.equal(await snapshot(db), before);
      ok(`preflight ${label}: rejected without any schema/data/audit change`);
    } finally {
      await db.close();
    }
  }
  db = await baseline();
  try {
    const before = await snapshot(db);
    const injected = ALIGNMENT_SQL.replace(
      'ALTER TABLE public.operational_assessments ADD COLUMN operational_constraints jsonb;',
      "RAISE EXCEPTION 'injected mid-migration failure';",
    );
    await assert.rejects(apply(db, injected), /injected mid-migration/);
    assert.equal(await snapshot(db), before);
    ok(
      'mid-migration exception rolls back renames, reason backfill and all data',
    );
  } finally {
    await db.close();
  }
  db = await baseline();
  try {
    await db.exec(
      "UPDATE operational_assessments SET deferment_reason='D',referral_reason='R'",
    );
    const mutant = ALIGNMENT_SQL.replace(
      "'Deferment: ' || legacy_deferment_reason || E'\\nReferral: ' || legacy_referral_reason",
      'coalesce(legacy_deferment_reason,legacy_referral_reason)',
    );
    assert.notEqual(mutant, ALIGNMENT_SQL);
    await apply(db, mutant);
    const value = (
      await db.query(
        'SELECT deferment_or_referral_reason r FROM operational_assessments',
      )
    ).rows[0].r;
    assert.notEqual(value, 'Deferment: D\nReferral: R');
    ok('mutation detected: COALESCE reason merge loses the referral');
  } finally {
    await db.close();
  }
  db = await baseline();
  try {
    const mutant = ALIGNMENT_SQL.replace(
      /,\n\s*ADD CONSTRAINT operational_assessments_assessed_by_admin_id_fkey FOREIGN KEY[^;]+;/,
      ';',
    );
    assert.notEqual(mutant, ALIGNMENT_SQL);
    const before = await snapshot(db);
    await assert.rejects(apply(db, mutant), /missing validated assessor/);
    assert.equal(await snapshot(db), before);
    ok(
      'mutation detected: removing assessor FK fails final verification and rolls back',
    );
  } finally {
    await db.close();
  }
  db = await baseline();
  let server, raw;
  try {
    server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
    await server.start();
    raw = postgres(
      `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
      {
        max: 1,
        debug: (_c, _q, params) =>
          assert(
            !params.some((p) => p instanceof Date),
            'Raw JS Date parameter',
          ),
      },
    );
    const quiet = console.log;
    console.log = () => {};
    try {
      const oldState = await snapshot(db);
      await migrateAssessmentWorkOrders(raw);
      assert.equal(await snapshot(db), oldState);
      await migrateAssessmentAlignment(raw);
      const once = await snapshot(db);
      await migrateAssessmentAlignment(raw);
      await migrateAssessmentWorkOrders(raw);
      assert.equal(await snapshot(db), once);
    } finally {
      console.log = quiet;
    }
    ok(
      'real injectable 0048 runner is idempotent; old 0045 runner validates final state without recreating notes',
    );
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
    const original = (
      await raw`SELECT created_at::text value FROM operational_assessments WHERE ticket_id=1`
    )[0].value;
    const saved = await service.upsert(1, actor, {
      assessedConditions: 'Assessed on site',
      operationalConstraints: ['equipment'],
      operationalConstraintNotes: { equipment: 'Backhoe unavailable' },
      interimMitigation: 'Barricades',
      defermentOrReferralReason: 'Deferment: Rain\nReferral: DPWH',
    });
    assert.equal(saved.assessedByAdminId, 1);
    assert.equal(saved.assessedByName, 'Original Creator');
    assert.equal(saved.updatedByAdminId, 2);
    assert.deepEqual(saved.operationalConstraints, ['equipment']);
    assert.deepEqual(saved.operationalConstraintNotes, {
      equipment: 'Backhoe unavailable',
    });
    assert.equal(
      (
        await raw`SELECT created_at::text value FROM operational_assessments WHERE ticket_id=1`
      )[0].value,
      original,
    );
    for (const old of [
      'observedConditions',
      'temporaryMitigation',
      'assessedAt',
      'defermentReason',
      'referralReason',
    ])
      assert(!(old in saved));
    await service.upsert(7, actor, { assessedConditions: 'New assessment' });
    ok(
      'real service create/edit: JSON adapter, one combined reason, canonical-only response, creator/time preservation',
    );
    const orders = new WorkOrdersService(
      orm,
      { create: async () => {} },
      audit,
    );
    await assert.rejects(
      orders.create({ ticketId: 8, title: 'No assessment' }, actor),
      /Assessment first/,
    );
    await raw`INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_conditions) VALUES(8,1,'')`;
    await assert.rejects(
      orders.create({ ticketId: 8, title: 'Blank assessment' }, actor),
      /Assessment first/,
    );
    const work = await orders.create(
      { ticketId: 1, title: 'Inspect road' },
      actor,
    );
    assert.equal(work.ticket_id, 1);
    for (const denied of [
      { ...actor, isFocal: true },
      { ...actor, accountType: 'SYSTEM_ADMIN', office: null },
      { ...actor, office: 'MDRRMO' },
    ])
      await assert.rejects(
        orders.create({ ticketId: 1, title: 'Denied' }, denied),
      );
    const queries = new ReportExportQueries(orm, raw),
      reports = new ReportsService({}, {}, {}, audit, queries);
    const csv = await reports.operationalAssessmentsCsv(
      { status: 'all', dateFrom: '2001-01-02', dateTo: '2001-01-02' },
      actor,
    );
    assert(csv.includes('Assessed Conditions'));
    assert(csv.includes('Interim Mitigation'));
    assert(csv.includes('Deferment or Referral Reason'));
    assert(csv.includes('Assessed on site'));
    assert(csv.includes('Backhoe unavailable'));
    assert(!csv.includes('Deferment Reason,'));
    ok(
      'real drizzle-wrapped Work Order prerequisite/role refusals and assessment CSV filtered by original creation time',
    );
    await service.upsert(
      9,
      { ...actor, adminId: 7 },
      { assessedConditions: 'Test creator retained' },
    );
    const historical = JSON.stringify(
      await raw`SELECT * FROM admin_audit_events ORDER BY id`,
    );
    const retired = await retireE2EAdmins(raw);
    assert.equal(retired.retired, 2);
    assert.equal(retired.deleted, 1);
    assert.equal(
      (await raw`SELECT is_active FROM admins WHERE id=7`)[0].is_active,
      false,
    );
    assert.equal(
      (await raw`SELECT count(*)::int n FROM admins WHERE id=6`)[0].n,
      0,
    );
    assert.equal(
      JSON.stringify(await raw`SELECT * FROM admin_audit_events ORDER BY id`),
      historical,
    );
    ok(
      'cleanup retires referenced accounts, deletes only unreferenced accounts, and leaves all audit history intact',
    );
  } finally {
    if (raw) await raw.end();
    if (server) await server.stop();
    await db.close();
  }
  console.log(`${checks} assessment-alignment PGlite groups passed`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
