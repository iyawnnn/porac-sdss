// Real SQL/PostGIS at historical checkpoints. No live migration/seed/archive CLI.
require('./helpers/migration-test-guard.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
for (const key of Object.keys(process.env))
  if (
    /DATABASE|^PG|SECRET|TOKEN|API_KEY|CLOUDINARY|GOOGLE/.test(key) &&
    key !== 'PGLITE_MODULE_ROOT'
  )
    delete process.env[key];
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite');
const { postgis } = load('@electric-sql/pglite-postgis');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { demoBaseline } = require('./helpers/demo-baseline.cjs');
require('reflect-metadata');
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, '../tsconfig.json');
require('tsx/cjs');
const {
  migrateAssessmentWorkOrders,
} = require('../scripts/migrations/migrate-assessment-work-orders.ts');
const {
  migrateAssessmentAlignment,
} = require('../scripts/migrations/migrate-operational-assessment-alignment.ts');
const {
  migratePhase8bContraction,
} = require('../scripts/migrations/migrate-phase8b-contraction.ts');
const {
  migrateReportAcknowledgmentsContraction,
} = require('../scripts/migrations/migrate-report-acknowledgments-contraction.ts');
const {
  migrateReportAcknowledgments,
} = require('../scripts/migrations/migrate-report-acknowledgments.ts');
const {
  migrateTicketAcknowledgments,
} = require('../scripts/migrations/migrate-ticket-acknowledgments.ts');
const {
  migrateStaffAccountTypes,
} = require('../scripts/migrations/migrate-staff-account-types.ts');
const {
  ACK_CANONICAL_QUERY,
} = require('../scripts/lib/acknowledgment-contraction.ts');
const {
  writeAcknowledgmentArchive,
} = require('../scripts/lib/acknowledgment-archive.ts');
const dir = path.resolve(__dirname, '../drizzle');
const sqlFile = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
const targets = [
  ['0045_assessment_work_orders.sql', migrateAssessmentWorkOrders],
  ['0048_operational_assessment_alignment.sql', migrateAssessmentAlignment],
  ['0049_phase8b_contraction.sql', migratePhase8bContraction],
  [
    '0050_report_acknowledgments_contraction.sql',
    migrateReportAcknowledgmentsContraction,
  ],
];
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), 'porac-migration-chain-'),
);
const snapshots = new Map();
let groups = 0;
const failures = [];
const ok = (label) => console.log('ok ' + ++groups + ' - ' + label);

async function baseline(file, populated = false) {
  if (!snapshots.has(file)) {
    const memory = await demoBaseline(PGlite, postgis, { stopBefore: file });
    try {
      snapshots.set(file, await memory.dumpDataDir());
    } finally {
      await memory.close();
    }
  }
  const memory = new PGlite({
    extensions: { postgis },
    loadDataDir: snapshots.get(file),
  });
  try {
    if (populated) await populate(memory, file);
    return memory;
  } catch (error) {
    await memory.close();
    throw error;
  }
}
async function populate(db, file) {
  await db.exec(`
    INSERT INTO admins(id,email,password_hash,first_name,last_name,role,account_type,office,is_focal)
      VALUES(1,'migration@fixture.invalid','offline','Historical','Staff','officer','PERSONNEL','MEO',false);
    INSERT INTO citizens(id,email,password_hash,first_name,last_name) VALUES(1,'citizen@fixture.invalid','offline','Private','Citizen');
    INSERT INTO tickets(id,category,barangay_id,assigned_office,initial_assigned_office,geom)
      SELECT 1,'Pothole / Road Surface Damage',id,'MEO','MEO',ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326) FROM barangays ORDER BY id LIMIT 1;
    INSERT INTO reports(id,ticket_id,citizen_id,title,citizen_severity,image_url,submitted_category,geom,pin_geom)
      VALUES(1,1,1,'Historical report','High','fixture','Pothole / Road Surface Damage',ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326),ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326));
    INSERT INTO work_orders(id,ticket_id,title,assigned_office,created_by_admin_id) VALUES(1,1,'Historical repair','MEO',1);
    INSERT INTO work_order_status_history(work_order_id,status,admin_id,admin_name) VALUES(1,'pending',1,'Historical snapshot');
    INSERT INTO admin_audit_events(actor_admin_id,actor_name,actor_email,actor_role,actor_account_type,action_type,target_type,target_id,target_summary,metadata)
      VALUES(1,'Historical snapshot','snapshot@fixture.invalid','officer','PERSONNEL','fixture','ticket',1,'Historical summary','{"preserved":true}');
    INSERT INTO report_acknowledgments(report_id,acknowledged_by_admin_id,acknowledged_by_name,remarks)
      VALUES(1,1,'Historical snapshot','Private remark');
    INSERT INTO acknowledgments(ticket_id,acknowledged_by_admin_id,remarks)
      VALUES(1,1,'Canonical remark');
  `);
  if (file < '0049') {
    await db.exec(`INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_by_name,observed_conditions,assessed_at)
      VALUES(1,1,'Historical snapshot','Rain ''quoted'' / ñ / 私','2001-01-01T16:00:00.123456Z')`);
    if (file.startsWith('0048'))
      await db.exec(
        `UPDATE operational_assessments SET deferment_reason='Defer',referral_reason='Refer',operational_constraints=ARRAY['weather'],operational_constraint_notes='{"weather":"Rain"}'`,
      );
  } else {
    await db.exec(`INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_by_name,assessed_conditions,created_at,operational_constraints)
      VALUES(1,1,'Historical snapshot','Rain ''quoted'' / ñ / 私','2001-01-01T16:00:00.123456Z','{"selected":["weather"],"notes":{"weather":"Rain"}}')`);
  }
}
async function snapshot(db) {
  const catalog = {};
  for (const [key, query] of Object.entries({
    columns: `SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) def FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2`,
    constraints: `SELECT conrelid::regclass::text tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`,
    triggers: `SELECT tgname,pg_get_triggerdef(oid) def,tgenabled FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgrelid::regclass::text,tgname`,
    functions: `SELECT p.proname,pg_get_functiondef(p.oid) def FROM pg_proc p WHERE pronamespace='public'::regnamespace AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1,2`,
    indexes: `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`,
    rules: `SELECT tablename,rulename,definition FROM pg_rules WHERE schemaname='public' ORDER BY 1,2`,
    enums: `SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typnamespace='public'::regnamespace ORDER BY 1,3`,
  }))
    catalog[key] = (await db.query(query)).rows;
  for (const { tablename } of (
    await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    )
  ).rows)
    catalog['table:' + tablename] = (
      await db.query(
        `SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) hash FROM "${tablename}" r`,
      )
    ).rows;
  for (const { sequencename } of (
    await db.query(
      `SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`,
    )
  ).rows)
    catalog['sequence:' + sequencename] = (
      await db.query(`SELECT last_value,is_called FROM "${sequencename}"`)
    ).rows;
  return JSON.stringify(catalog);
}
async function earlierFixture(db) {
  // Insert only columns present at this checkpoint, never replacement DDL.
  async function insert(table, values) {
    const columns = (
      await db.query(
        'SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped',
        [table],
      )
    ).rows.map((row) => row.attname);
    const entries = Object.entries(values).filter(([key]) =>
      columns.includes(key),
    );
    await db.query(
      `INSERT INTO ${table}(${entries.map(([key]) => key).join(',')}) VALUES(${entries.map((_, i) => '$' + (i + 1)).join(',')})`,
      entries.map(([, value]) => value),
    );
  }
  const point = 'SRID=4326;POINT(120.5406 15.0733)';
  await insert('admins', {
    id: 1,
    email: 'earlier@fixture.invalid',
    password_hash: 'offline',
    first_name: 'Historical',
    last_name: 'Staff',
    role: 'officer',
    account_type: 'PERSONNEL',
    office: 'MEO',
    is_focal: false,
  });
  await insert('citizens', {
    id: 1,
    email: 'earlier-citizen@fixture.invalid',
    password_hash: 'offline',
    first_name: 'Private',
    last_name: 'Citizen',
  });
  const barangay = (
    await db.query('SELECT id FROM barangays ORDER BY id LIMIT 1')
  ).rows[0];
  await insert('tickets', {
    id: 1,
    category: 'Pothole / Road Surface Damage',
    barangay_id: barangay.id,
    assigned_office: 'MEO',
    initial_assigned_office: 'MEO',
    geom: point,
  });
  await insert('reports', {
    id: 1,
    ticket_id: 1,
    citizen_id: 1,
    title: 'Earlier report',
    citizen_severity: 'High',
    image_url: 'fixture',
    submitted_category: 'Pothole / Road Surface Damage',
    geom: point,
    pin_geom: point,
  });
  await insert('admin_audit_events', {
    actor_admin_id: 1,
    actor_name: 'Historical snapshot',
    actor_email: 'snapshot@fixture.invalid',
    actor_role: 'officer',
    actor_account_type: 'PERSONNEL',
    action_type: 'fixture',
    target_type: 'ticket',
    target_id: 1,
    target_summary: 'Historical summary',
    metadata: '{"preserved":true}',
  });
  if (
    (
      await db.query(
        "SELECT to_regclass('public.report_acknowledgments') present",
      )
    ).rows[0].present
  )
    await insert('report_acknowledgments', {
      report_id: 1,
      acknowledged_by_admin_id: 1,
      acknowledged_by_name: 'Historical snapshot',
      remarks: 'Private remark',
    });
}
async function verifyCheckpoint(db, file) {
  const expected = {
    '0031': ['report_acknowledgments', 'acknowledged_at'],
    '0033': ['operational_assessments', 'observed_conditions'],
    '0038': ['acknowledgments', 'ticket_id'],
    '0039': ['admins', 'account_type'],
    '0045': ['work_orders', 'replacement_work_order_id'],
    '0046': ['tickets', 'resolved_at'],
    '0047': ['admin_audit_events', 'actor_is_focal'],
    '0048': ['operational_assessments', 'assessed_conditions'],
    '0049': ['operational_assessments', 'assessed_conditions'],
    '0050': ['acknowledgments', 'ticket_id'],
  }[file.slice(0, 4)];
  const [column] = (
    await db.query(
      `SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass($1) AND attname=$2 AND NOT attisdropped) present`,
      ['public.' + expected[0], expected[1]],
    )
  ).rows;
  assert(column.present, file + ': expected target column missing');
  if (file.startsWith('0045')) {
    const [constraints] = (
      await db.query(
        `SELECT count(*)::int count FROM pg_constraint WHERE conrelid='work_orders'::regclass AND convalidated AND conname IN('work_orders_completed_at_check','work_orders_cancelled_not_completed_check','work_orders_replacement_same_ticket_fkey')`,
      )
    ).rows;
    assert.equal(constraints.count, 3);
  }
  if (file.startsWith('0049')) {
    const [retired] = (
      await db.query(
        `SELECT to_regclass('public.config') IS NULL config_gone,to_regprocedure('public.admin_audit_events_fill_actor_account_type()') IS NULL compatibility_gone,NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attnum>0 AND NOT attisdropped AND ((attrelid='reports'::regclass AND attname='elevation_m') OR (attrelid='tickets'::regclass AND attname IN('elevation_m','elevation_factor','precipitation_factor','cluster_factor','urgency_score','urgency_band','priority_score','urgency_level')) OR (attrelid='operational_assessments'::regclass AND attname LIKE 'legacy_%'))) columns_gone`,
      )
    ).rows;
    assert(Object.values(retired).every(Boolean));
  }
  if (file.startsWith('0050'))
    assert.equal(
      (
        await db.query(
          "SELECT to_regclass('public.report_acknowledgments') IS NULL gone",
        )
      ).rows[0].gone,
      true,
    );
}
async function socket(db, fn) {
  const server = new PGLiteSocketServer({
    db,
    port: 0,
    host: '127.0.0.1',
    maxConnections: 2,
  });
  let raw;
  try {
    await server.start();
    const port = Number(server.getServerConn().split(':').at(-1));
    assert(![3000, 3001].includes(port));
    raw = postgres({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      username: 'postgres',
      password: 'postgres',
      max: 1,
      onnotice: () => {},
    });
    await fn(raw, port);
  } finally {
    if (raw) await raw.end({ timeout: 2 });
    await server.stop();
  }
}
async function archive(db) {
  const lines = (await db.query(ACK_CANONICAL_QUERY + ' ORDER BY id')).rows.map(
    (row) => row.canonical_row,
  );
  const file = path.join(
    scratch,
    'archive-' + fs.readdirSync(scratch).length + '.jsonl',
  );
  writeAcknowledgmentArchive(file, lines, {
    createdAt: '2026-01-01T00:00:00Z',
    gitCommit: 'a'.repeat(40),
  });
  return file;
}
async function apply(db, text) {
  await db.exec('BEGIN');
  try {
    await db.exec(text);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
async function auditProtected(db) {
  const [guard] = (
    await db.query(
      `SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgenabled='O') enabled`,
    )
  ).rows;
  assert(guard.enabled);
  const before = await snapshot(db);
  for (const statement of [
    `UPDATE admin_audit_events SET target_summary='tamper'`,
    'DELETE FROM admin_audit_events',
  ])
    await assert.rejects(db.exec(statement), /append.only/);
  assert.equal(await snapshot(db), before);
}
async function standalone(db, port, name) {
  const env = {};
  for (const key of [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
  ])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, {
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    PORAC_MIGRATION_PORT: String(port),
    TSX_TSCONFIG_PATH: path.join(__dirname, '../tsconfig.json'),
  });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--require',
        path.join(__dirname, 'helpers/migration-test-guard.cjs'),
        '--require',
        require.resolve('tsx/cjs'),
        path.join(__dirname, '../scripts/migrations/migrate-' + name + '.ts'),
      ],
      {
        cwd: scratch,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('Standalone runner timed out: ' + name));
    }, 60000);
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(
        path.join(scratch, name + '.log'),
        output.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]'),
      );
      resolve(code);
    });
  });
  assert.equal(code, 0, 'Standalone runner failed: ' + name);
}
async function main() {
  assert(
    !require.cache[require.resolve('../scripts/db.ts')],
    'Injectable imports must not instantiate a real client',
  );
  assert.throws(
    () => fs.readFileSync(path.join(scratch, '.env')),
    /blocked env-file/,
  );
  await assert.rejects(
    fetch('https://unowned.fixture.invalid'),
    /blocked fetch/,
  );
  assert.throws(() => netProbe(), /external\/unowned/);
  ok(
    'env files, fetch and unowned SQL sockets blocked; injectable imports have no standalone client',
  );
  const earlier = [
    ['0031_report_acknowledgments.sql', migrateReportAcknowledgments],
    ['0033_operational_assessments.sql', 'operational-assessments'],
    ['0038_ticket_acknowledgments.sql', migrateTicketAcknowledgments],
    ['0039_staff_account_types.sql', migrateStaffAccountTypes],
    ['0046_resolution_record.sql', 'resolution-record'],
    ['0047_audit_append_only.sql', 'audit-append-only'],
  ];
  for (const [file, runner] of earlier)
    for (const populated of [false, true]) {
      const db = await baseline(file);
      try {
        if (populated) await earlierFixture(db);
        const auditBefore = (
          await db.query(
            'SELECT to_jsonb(a) row FROM admin_audit_events a ORDER BY id',
          )
        ).rows;
        await socket(db, async (raw, port) => {
          const run = () =>
            typeof runner === 'string'
              ? standalone(db, port, runner)
              : runner(raw);
          await run();
          await verifyCheckpoint(db, file);
          const first = await snapshot(db);
          await run();
          assert.equal(await snapshot(db), first);
        });
        const auditAfter = (
          await db.query(
            'SELECT to_jsonb(a) row FROM admin_audit_events a ORDER BY id',
          )
        ).rows;
        assert.equal(auditAfter.length, auditBefore.length);
        for (const [index, { row }] of auditBefore.entries())
          for (const [key, value] of Object.entries(row))
            assert.deepEqual(auditAfter[index].row[key], value);
        if (populated && file.startsWith('0047')) await auditProtected(db);
        ok(
          file.slice(0, 4) +
            ': ' +
            (populated ? 'populated' : 'empty') +
            ' real checkpoint first/repeat runner preserves historical audit fields',
        );
      } catch (error) {
        failures.push(
          file +
            ': ' +
            (populated ? 'populated' : 'empty') +
            ': ' +
            error.message,
        );
        console.error('not ok - ' + failures.at(-1));
      } finally {
        await db.close();
      }
    }
  for (const [file, runner] of targets)
    for (const populated of [false, true]) {
      const db = await baseline(file, populated);
      try {
        const before = JSON.parse(await snapshot(db));
        const auditBefore = JSON.stringify(
          (
            await db.query(
              'SELECT to_jsonb(a) row FROM admin_audit_events a ORDER BY id',
            )
          ).rows,
        );
        await socket(db, async (raw) => {
          const archived = file.startsWith('0050')
            ? await archive(db)
            : undefined;
          await runner(raw, archived);
          await verifyCheckpoint(db, file);
          const first = await snapshot(db);
          await runner(raw, archived);
          assert.equal(await snapshot(db), first);
        });
        const after = JSON.parse(await snapshot(db));
        const changedTables = file.startsWith('0045')
          ? ['work_orders', 'operational_assessments']
          : file.startsWith('0048')
            ? ['operational_assessments']
            : file.startsWith('0049')
              ? ['reports', 'tickets', 'operational_assessments', 'config']
              : ['report_acknowledgments'];
        for (const [key, value] of Object.entries(before))
          if (key.startsWith('table:') && !changedTables.includes(key.slice(6)))
            assert.deepEqual(
              after[key],
              value,
              file + ': unexpected data change in ' + key,
            );
        if (populated)
          for (const table of [
            'reports',
            'tickets',
            'work_orders',
            'operational_assessments',
          ])
            assert.equal(
              (await db.query(`SELECT count(*)::int count FROM ${table}`))
                .rows[0].count,
              1,
            );
        assert.equal(
          JSON.stringify(
            (
              await db.query(
                'SELECT to_jsonb(a) row FROM admin_audit_events a ORDER BY id',
              )
            ).rows,
          ),
          auditBefore,
        );
        if (populated) {
          if (file.startsWith('0048')) {
            const [row] = (
              await db.query(
                `SELECT assessed_conditions,deferment_or_referral_reason,created_at::text created_at,operational_constraints FROM operational_assessments`,
              )
            ).rows;
            assert.equal(row.assessed_conditions, "Rain 'quoted' / ñ / 私");
            assert(
              row.deferment_or_referral_reason.includes('Defer') &&
                row.deferment_or_referral_reason.includes('Refer'),
            );
            assert(row.created_at.includes('.123456'));
            assert.deepEqual(row.operational_constraints, {
              selected: ['weather'],
              notes: { weather: 'Rain' },
            });
          }
          if (!file.startsWith('0045')) await auditProtected(db);
        }
        ok(
          file.slice(0, 4) +
            ': ' +
            (populated ? 'populated' : 'empty') +
            ' full-chain first/repeat runner, historical audit unchanged',
        );
      } finally {
        await db.close();
      }
    }
  const refusals = [
    [
      '0045_assessment_work_orders.sql',
      `UPDATE work_orders SET status='completed',completed_at=NULL`,
      /0045 preflight/,
    ],
    [
      '0045_assessment_work_orders.sql',
      `UPDATE work_orders SET status='cancelled',completed_at=now()`,
      /0045 preflight/,
    ],
    [
      '0048_operational_assessment_alignment.sql',
      `UPDATE operational_assessments SET assessed_by_admin_id=NULL`,
      /NULL assessor/,
    ],
    [
      '0048_operational_assessment_alignment.sql',
      `ALTER TABLE operational_assessments RENAME COLUMN observed_conditions TO assessed_conditions`,
      /unexpected or mixed|mismatch/,
    ],
    [
      '0049_phase8b_contraction.sql',
      `CREATE VIEW unexpected_urgency AS SELECT urgency_score FROM tickets`,
      /depend|unexpected|untracked/i,
    ],
    [
      '0049_phase8b_contraction.sql',
      `DROP TRIGGER admin_audit_events_append_only ON admin_audit_events`,
      /audit|trigger/i,
    ],
    ['0050_report_acknowledgments_contraction.sql', null, /requires --archive/],
    [
      '0050_report_acknowledgments_contraction.sql',
      `CREATE VIEW unexpected_ack AS SELECT * FROM report_acknowledgments`,
      /depend|unexpected/i,
    ],
  ];
  for (const [file, setup, error] of refusals) {
    const db = await baseline(file, true);
    try {
      if (setup) await db.exec(setup);
      const before = await snapshot(db);
      const archived =
        file.startsWith('0050') && setup ? await archive(db) : undefined;
      await socket(db, (raw) =>
        assert.rejects(
          targets.find((row) => row[0] === file)[1](raw, archived),
          error,
        ),
      );
      assert.equal(await snapshot(db), before);
      ok(
        file.slice(0, 4) +
          ': preflight refuses without catalog/data/sequence/audit changes: ' +
          (setup ?? 'missing archive'),
      );
    } finally {
      await db.close();
    }
  }
  for (const [file] of targets) {
    const db = await baseline(file, true);
    try {
      let text = sqlFile(file);
      const marker = file.startsWith('0045')
        ? '-- 3. UNIQUE (id, ticket_id)'
        : file.startsWith('0048')
          ? 'ALTER TABLE public.operational_assessments ADD COLUMN operational_constraints jsonb;'
          : '-- Failure-injection boundary';
      assert(text.includes(marker));
      text = text.replace(marker, () =>
        file.startsWith('0045')
          ? `DO $$ BEGIN RAISE EXCEPTION 'injected migration failure'; END $$;\n` +
            marker
          : "RAISE EXCEPTION 'injected migration failure';\n" + marker,
      );
      if (file.startsWith('0048'))
        text = sqlFile(file).replace(
          marker,
          "RAISE EXCEPTION 'injected migration failure';",
        );
      if (file.startsWith('0050')) {
        const {
          archiveDigest,
        } = require('../scripts/lib/acknowledgment-archive.ts');
        const lines = (
            await db.query(ACK_CANONICAL_QUERY + ' ORDER BY id')
          ).rows.map((row) => row.canonical_row),
          digest = archiveDigest(lines);
        text =
          `SELECT set_config('porac.ack_archive_count','${digest.rowCount}',true),set_config('porac.ack_archive_sha256','${digest.sha256}',true);\n` +
          text;
      }
      const before = await snapshot(db);
      await assert.rejects(apply(db, text), /injected migration failure/);
      assert.equal(await snapshot(db), before);
      if (!file.startsWith('0045')) await auditProtected(db);
      ok(
        file.slice(0, 4) +
          ': failure after DDL rolls back full catalog/data/sequences; audit protection retained where installed',
      );
    } finally {
      await db.close();
    }
  }
  // All directly affected historical runners execute twice on the real final state.
  const db = await baseline(
    '0050_report_acknowledgments_contraction.sql',
    true,
  );
  try {
    await socket(db, async (raw, port) => {
      await migrateReportAcknowledgmentsContraction(raw, await archive(db));
      const before = await snapshot(db);
      for (const runner of [
        migrateReportAcknowledgments,
        migrateTicketAcknowledgments,
        migrateStaffAccountTypes,
        migrateAssessmentWorkOrders,
        migrateAssessmentAlignment,
        migratePhase8bContraction,
        migrateReportAcknowledgmentsContraction,
      ]) {
        await runner(raw);
        await runner(raw);
        assert.equal(await snapshot(db), before);
      }
      for (const name of [
        'operational-assessments',
        'resolution-record',
        'audit-append-only',
      ]) {
        await standalone(db, port, name);
        await standalone(db, port, name);
        assert.equal(await snapshot(db), before);
      }
    });
    await auditProtected(db);
    ok(
      '0031/0033/0038/0039/0045/0046/0047/0048/0049/0050 historical runners twice after contraction: no catalog/data changes and audit still append-only',
    );
  } finally {
    await db.close();
  }
  console.log(
    groups +
      ' full-chain migration groups passed; private artifacts: ' +
      scratch,
  );
  assert.equal(failures.length, 0, failures.join('\n'));
}
function netProbe() {
  return require('node:net').connect({ host: '127.0.0.1', port: 3001 });
}
main().catch((error) => {
  console.error(
    error.stack?.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]'),
  );
  process.exitCode = 1;
});
