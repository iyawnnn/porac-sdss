// Fresh SQL + actual seed entrypoints, in memory only. No env file is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const {
  copySources,
  SeedRunner,
  FRESH_STAFF_PASSWORD,
} = require('./helpers/fresh-cli-sandbox.cjs');
const { MIGRATIONS } = require('./helpers/demo-baseline.cjs');
assert(
  process.env.PGLITE_MODULE_ROOT,
  'Set PGLITE_MODULE_ROOT to the external pinned PGlite test install',
);
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite');
const { postgis } = load('@electric-sql/pglite-postgis');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const bcrypt = require('bcryptjs');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
require('reflect-metadata');
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, '../tsconfig.json');
require('tsx/cjs');
const {
  E2E_ADMIN_ACCOUNTS,
  E2E_CITIZEN_ACCOUNT,
} = require('../../e2e/test-credentials.ts');
const {
  OperationalAssessmentService,
} = require('../src/admin/operational-assessment.service.ts');
const { AdminAuditService } = require('../src/admin/admin-audit.service.ts');
const root = path.resolve(__dirname, '../..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'porac-fresh-db-'));
const source = path.join(folder, 'source');
copySources(root, source);
const adminPassword = 'fresh-only-non-production-password';
const runner = new SeedRunner(source, root, path.join(folder, 'artifacts'), [
  adminPassword,
  E2E_CITIZEN_ACCOUNT.password,
  FRESH_STAFF_PASSWORD,
]);
let checks = 0;
const outcomes = [];
function ok(label) {
  console.log('ok ' + ++checks + ' - ' + label);
}
async function query(connection, text, values = []) {
  return connection.pg.unsafe(text, values);
}
async function open(snapshot) {
  const memory = new PGlite({
    extensions: { postgis },
    ...(snapshot ? { loadDataDir: snapshot } : {}),
  });
  // The observer stays connected between CLI children. Their queries never run
  // concurrently, but the socket server must admit both physical connections.
  const server = new PGLiteSocketServer({
    db: memory,
    port: 0,
    host: '127.0.0.1',
    maxConnections: 4,
  });
  try {
    await server.start();
    const address = server.getServerConn();
    const port = Number(address.split(':').at(-1));
    assert(port > 1024 && ![3000, 3001].includes(port));
    const url = 'postgres://postgres:postgres@127.0.0.1:' + port + '/postgres';
    const pg = postgres(url, {
      max: 1,
      max_pipeline: 1,
      onnotice: () => {},
      debug: (_c, _q, parameters) =>
        assert(
          !parameters.some((p) => p instanceof Date),
          'Raw SQL received a JS Date',
        ),
    });
    return { memory, server, pg, port, url, db: drizzle(pg) };
  } catch (error) {
    await memory.close();
    throw error;
  }
}
async function close(connection) {
  await connection.pg.end({ timeout: 2 });
  await connection.server.stop();
  await connection.memory.close();
}
async function count(connection, table) {
  assert(/^[a-z_]+$/.test(table));
  return (await query(connection, 'SELECT count(*)::int n FROM ' + table))[0].n;
}
async function fingerprint(connection, table) {
  assert(/^[a-z_]+$/.test(table));
  // cleanup:e2e-admins re-locks staff demo accounts with a fresh random hash
  // on every run (IAN-26); that rotation is checked separately below.
  const row =
    table === 'admins'
      ? "(to_jsonb(x) - 'password_hash' - 'session_valid_after')"
      : 'to_jsonb(x)';
  return (
    await query(
      connection,
      `SELECT count(*)::int n,md5(coalesce(string_agg(${row}::text,'' ORDER BY ${row}::text),'')) hash FROM ${table} x`,
    )
  )[0];
}
async function operationalState(connection) {
  const result = {};
  for (const table of [
    'admins',
    'citizens',
    'tickets',
    'reports',
    'work_orders',
    'operational_assessments',
    'acknowledgments',
    'report_intake_actions',
    'status_history',
    'notifications',
    'admin_audit_events',
    'rate_limit_events',
  ])
    result[table] = await fingerprint(connection, table);
  return result;
}
async function coreCounts(connection) {
  const result = {};
  for (const table of [
    'barangays',
    'city_boundary_osm',
    'dem_points',
    'admins',
    'citizens',
    'reports',
    'tickets',
    'work_orders',
    'operational_assessments',
    'admin_audit_events',
  ])
    result[table] = await count(connection, table);
  return result;
}
async function finalSchema(connection) {
  const [row] = await query(
    connection,
    `SELECT
    to_regclass('report_acknowledgments') IS NULL old_ack_gone,
    to_regclass('report_acknowledgments_id_seq') IS NULL old_sequence_gone,
    to_regclass('config') IS NULL config_gone,
    to_regprocedure('admin_audit_events_fill_actor_account_type()') IS NULL compatibility_function_gone,
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='admin_audit_events_fill_actor_account_type') compatibility_trigger_gone,
    to_regclass('acknowledgments') IS NOT NULL acknowledgments,
    to_regclass('report_intake_actions') IS NOT NULL intake,
    to_regclass('dem_points') IS NOT NULL dem,
    to_regtype('admin_role') IS NOT NULL permanent_role_enum,
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='tickets'::regclass AND attname='priority_index' AND NOT attisdropped) priority,
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='admin_audit_events'::regclass AND attname='actor_role' AND attnotnull AND NOT attisdropped) permanent_actor_role,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='operational_assessments'::regclass AND conname='operational_assessments_assessed_by_admin_id_fkey' AND confrelid='admins'::regclass AND contype='f' AND confdeltype='r' AND convalidated) assessor_restrict_fk,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgtype=27 AND tgenabled='O' AND tgfoid=to_regprocedure('admin_audit_events_reject_update_delete()')) audit_guard,
    NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attnum>0 AND NOT attisdropped AND (
      (attrelid='reports'::regclass AND attname='elevation_m') OR
      (attrelid='tickets'::regclass AND attname IN('elevation_m','elevation_factor','precipitation_factor','cluster_factor','urgency_score','urgency_band','priority_score','urgency_level')) OR
      (attrelid='operational_assessments'::regclass AND attname LIKE 'legacy_%'))) retired_columns_gone`,
  );
  assert(
    Object.values(row).every(Boolean),
    'Final contracted catalog mismatch: ' + JSON.stringify(row),
  );
}
async function auditUnchanged(connection, before) {
  assert.deepEqual(await fingerprint(connection, 'admin_audit_events'), before);
}
async function writeRaster() {
  const { writeArrayBuffer } = await import(
    pathToFileURL(require.resolve('geotiff')).href
  );
  fs.mkdirSync(path.join(source, 'test-fixtures'), { recursive: true });
  const bytes = writeArrayBuffer(new Float32Array([100, 110, -9999, 130]), {
    width: 2,
    height: 2,
    BitsPerSample: [32],
    SampleFormat: [3],
    GeographicTypeGeoKey: 4326,
    ModelPixelScale: [0.0001, 0.0001, 0],
    ModelTiepoint: [0, 0, 0, 120.5405, 15.0734, 0],
    GDAL_NODATA: '-9999',
  });
  fs.writeFileSync(
    path.join(source, 'test-fixtures/dem-small.tif'),
    Buffer.from(bytes),
  );
}
async function foundation() {
  const connection = await open();
  try {
    const probe = `const fs=require('fs'),net=require('net'),path=require('path');let blocked=0;
      try{fs.readFileSync(path.join(process.env.PORAC_FRESH_ROOT,'never-created/.env'))}catch{blocked++}
      try{fs.writeFileSync(path.resolve(process.env.PORAC_FRESH_ROOT,'../never-written.txt'),'x')}catch{blocked++}
      try{net.connect({host:'example.invalid',port:443})}catch{blocked++}
      fetch('https://example.invalid').catch(()=>{blocked++;if(blocked!==4)process.exitCode=1});`;
    await runner.execute(
      'boundary-probe',
      connection.port,
      connection.url,
      ['-e', probe],
      0,
      { networkAttempts: 2, envReadAttempts: 1, outsideWrites: 1 },
    );
    ok(
      'child boundary blocks env reads, outside writes, fetch and non-test connections',
    );
    const migration = (name) =>
      fs.readFileSync(path.join(source, 'api/drizzle', name), 'utf8');
    assert.deepEqual(
      fs
        .readdirSync(path.join(source, 'api/drizzle'))
        .filter((name) => name.endsWith('.sql') && !name.endsWith('.check.sql'))
        .sort(),
      ['0000_soft_landau.sql', ...MIGRATIONS].sort(),
      'Every historical migration must be covered',
    );
    await connection.memory.exec(migration('0000_soft_landau.sql'));
    await runner.run('import:barangays', connection);
    const first = await query(
      connection,
      'SELECT id,name,md5(ST_AsEWKB(geom)) hash FROM barangays ORDER BY id',
    );
    assert.equal(first.length, 29);
    await runner.run('import:barangays', connection);
    assert.deepEqual(
      await query(
        connection,
        'SELECT id,name,md5(ST_AsEWKB(geom)) hash FROM barangays ORDER BY id',
      ),
      first,
    );
    ok('real barangay importer creates 29 polygons and preserves IDs on rerun');
    for (const file of MIGRATIONS) {
      if (file === '0007_config.sql') {
        await runner.run('seed:dem', connection);
        const dem = await query(
          connection,
          'SELECT id,elevation_m,ST_AsText(geom) geom FROM dem_points ORDER BY id',
        );
        assert.equal(dem.length, 3);
        assert.deepEqual(
          dem.map((r) => r.elevation_m).sort((a, b) => a - b),
          [100, 110, 130],
        );
        await runner.run('seed:dem', connection);
        assert.deepEqual(
          await query(
            connection,
            'SELECT id,elevation_m,ST_AsText(geom) geom FROM dem_points ORDER BY id',
          ),
          dem,
        );
        ok(
          'real GeoTIFF/DEM seed excludes nodata, retains three sample elevations, reruns without duplicates',
        );
        await runner.run('import:city-boundary', connection);
        const city = await query(
          connection,
          'SELECT id,source,md5(ST_AsEWKB(geom)) hash FROM city_boundary_osm',
        );
        assert.equal(city.length, 1);
        await runner.run('import:city-boundary', connection);
        assert.deepEqual(
          await query(
            connection,
            'SELECT id,source,md5(ST_AsEWKB(geom)) hash FROM city_boundary_osm',
          ),
          city,
        );
        ok(
          'real city-boundary importer creates one polygon and safely replaces reference data',
        );
      }
      if (file.startsWith('0050')) {
        await connection.memory.exec('BEGIN');
        await connection.memory.query(
          "SELECT set_config('porac.ack_archive_count','0',true),set_config('porac.ack_archive_sha256','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',true)",
        );
        await connection.memory.exec(migration(file));
        await connection.memory.exec('COMMIT');
      } else await connection.memory.exec(migration(file));
    }
    await finalSchema(connection);
    ok(
      'all real SQL through 0050 contracts correctly with the real empty-source archive guard',
    );
    await runner.run('seed:admin', connection, [
      'manual@fresh.invalid',
      adminPassword,
      'SYSTEM_ADMIN',
      '-',
      'false',
    ]);
    const beforeBad = await fingerprint(connection, 'admins');
    await runner.run(
      'seed:admin',
      connection,
      ['bad@fresh.invalid', adminPassword, 'MEO', 'supervisor'],
      1,
    );
    assert.deepEqual(await fingerprint(connection, 'admins'), beforeBad);
    await runner.run('seed:admin', connection, [
      'manual@fresh.invalid',
      adminPassword,
      'SYSTEM_ADMIN',
      '-',
      'false',
    ]);
    assert.equal(await count(connection, 'admins'), 1);
    ok(
      'actual admin CLI accepts canonical fields, upserts and rejects legacy arguments without changes',
    );
    await runner.run('seed:e2e-admins', connection);
    const staff = await query(
      connection,
      'SELECT id,email,account_type,office,is_focal,role,is_active FROM admins ORDER BY id',
    );
    assert.equal(staff.length, 5);
    await runner.run('seed:e2e-admins', connection);
    assert.deepEqual(
      await query(
        connection,
        'SELECT id,email,account_type,office,is_focal,role,is_active FROM admins ORDER BY id',
      ),
      staff,
    );
    ok('E2E staff CLI upserts four canonical demo accounts without duplicates');
    await runner.run('seed:users', connection);
    const citizens = await query(
      connection,
      'SELECT id,email FROM citizens ORDER BY id',
    );
    assert.equal(citizens.length, 5);
    await runner.run('seed:users', connection);
    assert.deepEqual(
      await query(connection, 'SELECT id,email FROM citizens ORDER BY id'),
      citizens,
    );
    assert.equal(
      (
        await query(
          connection,
          "SELECT count(*)::int n FROM information_schema.columns WHERE table_name='citizens' AND column_name='verified'",
        )
      )[0].n,
      0,
    );
    ok(
      'citizen CLI uses final schema and reruns without adding verified or duplicate citizens',
    );
    const invalidUrl =
      'postgres://test:test@ep-steep-mouse-fresh-check.invalid/test';
    await runner.execute(
      'production-guard',
      connection.port,
      invalidUrl,
      [
        '--require',
        require.resolve('tsx/cjs'),
        path.join(source, 'api/scripts/seed/seed-users.ts'),
        '--i-know-this-is-not-production',
      ],
      1,
    );
    assert.equal(await count(connection, 'citizens'), 5);
    ok(
      'actual seed entrypoint refuses a synthetic production prefix before opening any socket',
    );
    const counts = await coreCounts(connection);
    assert.deepEqual(counts, {
      barangays: 29,
      city_boundary_osm: 1,
      dem_points: 3,
      admins: 5,
      citizens: 5,
      reports: 0,
      tickets: 0,
      work_orders: 0,
      operational_assessments: 0,
      admin_audit_events: 0,
    });
    outcomes.push({ name: 'foundation', counts });
    await connection.pg.end({ timeout: 2 });
    await connection.server.stop();
    const snapshot = await connection.memory.dumpDataDir();
    await connection.memory.close();
    return snapshot;
  } catch (error) {
    await close(connection);
    throw error;
  }
}
async function demoCase(name, snapshot, extras = false) {
  const connection = await open(snapshot);
  try {
    await runner.run(name, connection);
    const counts = await coreCounts(connection);
    assert.equal(counts.reports, 15);
    assert.equal(counts.tickets, 15);
    assert.equal(counts.work_orders, 4);
    assert.equal(counts.operational_assessments, 4);
    assert.equal(await count(connection, 'rate_limit_events'), 15);
    assert.equal(await count(connection, 'acknowledgments'), 15);
    assert.equal(await count(connection, 'resolution_feedback'), 2);
    const images = await query(connection, 'SELECT image_url FROM reports');
    for (const row of images) {
      assert(row.image_url.startsWith('/uploads/reports/phase8c-demo-'));
      assert(fs.existsSync(path.join(source, 'public', row.image_url)));
    }
    const before = await operationalState(connection);
    await runner.run(name, connection, [], 1);
    assert.deepEqual(await operationalState(connection), before);
    await finalSchema(connection);
    outcomes.push({ name, counts });
    ok(
      name +
        ' actual CLI creates all 15 scenarios and refuses a repeat without resetting history',
    );
    if (extras) {
      const audit = await fingerprint(connection, 'admin_audit_events');
      await assert.rejects(
        () =>
          query(
            connection,
            'UPDATE admin_audit_events SET actor_name=actor_name',
          ),
        /append.only/i,
      );
      await assert.rejects(
        () => query(connection, 'DELETE FROM admin_audit_events'),
        /append.only/i,
      );
      await auditUnchanged(connection, audit);
      const [existing] = await query(
        connection,
        'SELECT ticket_id,assessed_by_admin_id FROM operational_assessments ORDER BY id LIMIT 1',
      );
      await assert.rejects(
        () =>
          query(connection, 'DELETE FROM admins WHERE id=$1', [
            existing.assessed_by_admin_id,
          ]),
        (error) => error.code === '23503',
      );
      await assert.rejects(
        () =>
          query(
            connection,
            'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_conditions) VALUES($1,$2,$3)',
            [existing.ticket_id, existing.assessed_by_admin_id, 'duplicate'],
          ),
        (error) => error.code === '23505',
      );
      const [unassessed] = await query(
        connection,
        'SELECT id FROM tickets WHERE id NOT IN(SELECT ticket_id FROM operational_assessments) AND merged_into_ticket_id IS NULL ORDER BY id LIMIT 1',
      );
      await assert.rejects(
        () =>
          query(
            connection,
            'INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_conditions) VALUES($1,NULL,$2)',
            [unassessed.id, 'missing assessor'],
          ),
        (error) => error.code === '23502',
      );
      await assert.rejects(
        () =>
          query(
            connection,
            "INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_conditions,operational_constraints) VALUES($1,$2,$3,'[]'::jsonb)",
            [unassessed.id, existing.assessed_by_admin_id, 'bad JSONB'],
          ),
        (error) => error.code === '23514',
      );
      assert.equal(await count(connection, 'operational_assessments'), 4);
      await auditUnchanged(connection, audit);
      ok(
        'real assessor FK/NOT NULL, one-assessment uniqueness, JSONB shape and immutable audit refuse invalid writes',
      );
      const beforeBulk = await operationalState(connection);
      await runner.run('seed:bulk-reports', connection, ['--count', '3'], 1);
      await runner.run(
        'seed:bulk-reports',
        connection,
        ['--append', '--count', '6'],
        1,
      );
      assert.deepEqual(await operationalState(connection), beforeBulk);
      await runner.run('seed:bulk-reports', connection, [
        '--append',
        '--count',
        '3',
      ]);
      assert.equal(await count(connection, 'reports'), 18);
      assert.equal(await count(connection, 'tickets'), 18);
      assert.equal(await count(connection, 'rate_limit_events'), 18);
      const after = await operationalState(connection);
      await runner.run(
        'seed:bulk-reports',
        connection,
        ['--append', '--count', '3'],
        1,
      );
      assert.deepEqual(await operationalState(connection), after);
      await auditUnchanged(connection, audit);
      ok(
        'bulk CLI requires append, enforces available quota and refuses repeating an additive batch',
      );
    }
  } finally {
    await close(connection);
  }
}
async function bulkCase(snapshot) {
  const connection = await open(snapshot);
  try {
    await runner.run('seed:bulk-reports', connection, ['--count', '3']);
    assert.equal(await count(connection, 'reports'), 3);
    assert.equal(await count(connection, 'tickets'), 3);
    assert.equal(await count(connection, 'rate_limit_events'), 3);
    assert.equal(await count(connection, 'operational_assessments'), 0);
    const before = await operationalState(connection);
    await runner.run('seed:bulk-reports', connection, ['--count', '3'], 1);
    assert.deepEqual(await operationalState(connection), before);
    outcomes.push({ name: 'fresh bulk', counts: await coreCounts(connection) });
    ok(
      'standalone bulk CLI works on its own fresh database and refuses implicit repetition',
    );
  } finally {
    await close(connection);
  }
}
async function fixtureCase(snapshot) {
  const connection = await open(snapshot);
  try {
    await runner.run('cleanup:e2e-admins', connection);
    await runner.run('seed:e2e-grouping-fixtures', connection);
    const first = await coreCounts(connection);
    assert.deepEqual(first, {
      barangays: 29,
      city_boundary_osm: 1,
      dem_points: 3,
      admins: 5,
      citizens: 5,
      reports: 81,
      tickets: 78,
      work_orders: 13,
      operational_assessments: 9,
      admin_audit_events: 34,
    });
    assert.equal(
      (
        await query(
          connection,
          'SELECT count(*)::int n FROM admin_audit_events WHERE target_id>=1000000000',
        )
      )[0].n,
      32,
    );
    await runner.run('seed:admin', connection, [
      'e2e-fresh-assessor@porac.gov.ph',
      adminPassword,
      'PERSONNEL',
      'MEO',
      'false',
    ]);
    await runner.run('seed:admin', connection, [
      'e2e-fresh-unused@porac.gov.ph',
      adminPassword,
      'PERSONNEL',
      'MEO',
      'false',
    ]);
    const [actor] = await query(
      connection,
      "SELECT id,email FROM admins WHERE email='e2e-fresh-assessor@porac.gov.ph'",
    );
    const [ticket] = await query(
      connection,
      "SELECT t.id FROM tickets t WHERE t.assigned_office='MEO' AND t.status IN('Reported','Under Review','In Progress') AND t.merged_into_ticket_id IS NULL AND NOT EXISTS(SELECT 1 FROM operational_assessments a WHERE a.ticket_id=t.id) ORDER BY id LIMIT 1",
    );
    await new OperationalAssessmentService(
      connection.pg,
      new AdminAuditService(connection.db),
    ).upsert(
      ticket.id,
      {
        adminId: actor.id,
        adminName: 'Fresh test assessor',
        email: actor.email,
        accountType: 'PERSONNEL',
        office: 'MEO',
        isFocal: false,
      },
      {
        assessedConditions: 'In-memory CLI retirement regression',
        operationalConstraints: [],
      },
    );
    const assessmentAudit = await fingerprint(connection, 'admin_audit_events');
    // PostgreSQL sequences can have gaps; count is not an ID boundary.
    const [{ max_id: originalAuditMaxId }] = await query(
      connection,
      'SELECT max(id)::int max_id FROM admin_audit_events',
    );
    await runner.run('cleanup:e2e-admins', connection);
    const [retired] = await query(
      connection,
      'SELECT is_active FROM admins WHERE id=$1',
      [actor.id],
    );
    assert.equal(retired.is_active, false);
    assert.equal(
      (
        await query(
          connection,
          "SELECT count(*)::int n FROM admins WHERE email='e2e-fresh-unused@porac.gov.ph'",
        )
      )[0].n,
      0,
    );
    await auditUnchanged(connection, assessmentAudit);
    ok(
      'actual E2E account cleanup retires the referenced assessor and only deletes an unreferenced test account',
    );
    await runner.run('cleanup:e2e-grouping-fixtures', connection);
    const [active] = await query(
      connection,
      "SELECT (SELECT count(*)::int FROM tickets WHERE merged_into_ticket_id IS NULL AND status IN('Reported','Under Review','In Progress')) tickets,(SELECT count(*)::int FROM work_orders WHERE status IN('pending','in_progress')) work_orders",
    );
    assert.deepEqual(active, { tickets: 0, work_orders: 0 });
    await auditUnchanged(connection, assessmentAudit);
    const before = await operationalState(connection);
    await runner.run('cleanup:e2e-grouping-fixtures', connection);
    await runner.run('cleanup:e2e-admins', connection);
    assert.deepEqual(await operationalState(connection), before);
    for (const { password_hash } of await query(
      connection,
      "SELECT password_hash FROM admins WHERE email IN ('meo@porac.gov.ph','mdrrmo@porac.gov.ph','sysadmin@porac.gov.ph','focal@porac.gov.ph')",
    ))
      assert(!(await bcrypt.compare(FRESH_STAFF_PASSWORD, password_hash)));
    ok(
      'fixture cleanup retires all active tickets/orders, preserves audit and reruns without changes',
    );
    await runner.run('seed:e2e-grouping-fixtures', connection);
    assert.equal(await count(connection, 'reports'), first.reports * 2);
    assert.equal(await count(connection, 'tickets'), first.tickets * 2);
    assert.equal(await count(connection, 'admin_audit_events'), 69);
    // Compare the original rows themselves, not only the increased total.
    assert.deepEqual(
      (
        await query(
          connection,
          `SELECT count(*)::int n,
      md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY to_jsonb(x)::text),'')) hash
      FROM admin_audit_events x WHERE id<=$1`,
          [originalAuditMaxId],
        )
      )[0],
      assessmentAudit,
    );
    await runner.run('cleanup:e2e-grouping-fixtures', connection);
    assert.deepEqual(
      (
        await query(
          connection,
          `SELECT count(*)::int n,
      md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY to_jsonb(x)::text),'')) hash
      FROM admin_audit_events x WHERE id<=$1`,
          [originalAuditMaxId],
        )
      )[0],
      assessmentAudit,
    );
    assert.equal(
      (
        await query(
          connection,
          "SELECT count(*)::int n FROM tickets WHERE merged_into_ticket_id IS NULL AND status IN('Reported','Under Review','In Progress')",
        )
      )[0].n,
      0,
    );
    outcomes.push({
      name: 'fixture creation/cleanup/reseed',
      first,
      final: await coreCounts(connection),
    });
    ok(
      'a second fixture run appends a fresh dataset while retaining retired history',
    );
  } finally {
    await close(connection);
  }
}
async function main() {
  await writeRaster();
  const snapshot = await foundation();
  await demoCase('seed:demo-presentation', snapshot, true);
  for (const alias of ['seed:diverse-reports', 'seed:mock-report', 'db:seed'])
    await demoCase(alias, snapshot);
  await bulkCase(snapshot);
  await fixtureCase(snapshot);
  assert.deepEqual(
    [...runner.covered].sort(),
    Object.keys(runner.commands).sort(),
  );
  ok(
    'all 14 documented seed/import/cleanup command mappings and all 12 entrypoints executed',
  );
  fs.writeFileSync(
    path.join(folder, 'summary.json'),
    JSON.stringify(
      { groups: checks, commands: [...runner.covered].sort(), outcomes },
      null,
      2,
    ),
  );
  console.log(checks + ' fresh database check groups passed');
  console.log('Artifacts:', folder);
}
main().catch((error) => {
  console.error(runner.scrub(error.stack || error.message));
  console.error('Artifacts:', folder);
  process.exitCode = 1;
});
