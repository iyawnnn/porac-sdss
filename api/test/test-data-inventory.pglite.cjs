// Offline only. No env file, application server or real database connection.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, '../tsconfig.json');
require('tsx/cjs');
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite'),
  { postgis } = load('@electric-sql/pglite-postgis'),
  { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres'),
  { drizzle } = require('drizzle-orm/postgres-js'),
  { sql } = require('drizzle-orm');
const { demoBaseline } = require('./helpers/demo-baseline.cjs');
const {
  INVENTORY_TABLES,
  readInventory,
} = require('../scripts/lib/test-data-inventory.ts');
const {
  inventoryOptions,
} = require('../scripts/lib/test-data-inventory-options.ts');
const { seedDemoCitizens } = require('../scripts/lib/seed-demo-citizens.ts');
const { seedAdminAccount } = require('../scripts/lib/seed-admin-account.ts');
const { AdminAuditService } = require('../src/admin/admin-audit.service.ts');
const {
  writeInventoryReport,
} = require('../scripts/lib/test-data-inventory-output.ts');
const { citizens, notifications } = require('../src/db/schema.ts');
const root = path.resolve(__dirname, '../..'),
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'porac-inventory-check-'));
const options = inventoryOptions(['--target', 'local', '--all-dates']);
let groups = 0;
const ok = (label) => console.log('ok ' + ++groups + ' - ' + label);
const hasCode = (error, code) =>
  error && (error.code === code || hasCode(error.cause, code));
async function main() {
  const memory = await demoBaseline(PGlite, postgis);
  let server, pg;
  const originalAppData = process.env.LOCALAPPDATA;
  const originalXdgData = process.env.XDG_DATA_HOME;
  try {
    server = new PGLiteSocketServer({
      db: memory,
      port: 0,
      host: '127.0.0.1',
      maxConnections: 4,
    });
    await server.start();
    const address = server.getServerConn(),
      port = Number(address.split(':').at(-1));
    assert(![3000, 3001].includes(port));
    const url = 'postgres://postgres:postgres@' + address + '/postgres';
    pg = postgres(url, {
      max: 1,
      max_pipeline: 1,
      onnotice: () => {},
      debug: (_c, _q, p) =>
        assert(!p.some((x) => x instanceof Date), 'Raw SQL received JS Date'),
    });
    const db = drizzle(pg);
    const empty = await readInventory(db, options);
    assert.deepEqual(empty.candidateCounts, {});
    assert.equal(empty.mode, 'read-only-review');
    ok(
      'empty real 0000-0050/PostGIS baseline, contracted objects and append-only guard',
    );
    await seedDemoCitizens(pg, 'memory-only-password');
    const admin = await seedAdminAccount(db, [
      'e2e-inventory-staff@fixture.invalid',
      'memory-only-password',
      'PERSONNEL',
      'MEO',
      'false',
    ]);
    // Use returned database row rather than guessing the account ID.
    const [actor] =
      await pg`SELECT id,email FROM admins WHERE email='e2e-inventory-staff@fixture.invalid'`;
    void admin;
    const [citizen] = await db
      .insert(citizens)
      .values({
        email: 'e2e-inventory-citizen@fixture.invalid',
        firstName: 'Test',
        lastName: 'Owner',
        passwordHash: 'PRIVATE_PASSWORD_HASH',
      })
      .returning();
    const [{ id: barangay }] =
      await pg`SELECT id FROM barangays ORDER BY id LIMIT 1`;
    async function ticket(merged = null) {
      return (
        await pg`INSERT INTO tickets(category,barangay_id,assigned_office,geom,merged_into_ticket_id) VALUES('Pothole / Road Surface Damage',${barangay},'MEO',ST_SetSRID(ST_MakePoint(120.54,15.07),4326),${merged}) RETURNING id`
      )[0].id;
    }
    const survivor = await ticket(),
      old = await ticket(survivor),
      unrelated = await ticket();
    async function report(tid, cid, title) {
      return (
        await pg`INSERT INTO reports(ticket_id,citizen_id,title,citizen_severity,image_url,geom,pin_geom,description) VALUES(${tid},${cid},${title},'Low','/PRIVATE_IMAGE.jpg',ST_SetSRID(ST_MakePoint(120.54,15.07),4326),ST_SetSRID(ST_MakePoint(120.54,15.07),4326),'PRIVATE_DESCRIPTION') RETURNING id`
      )[0].id;
    }
    const own = await report(survivor, citizen.id, 'E2E inventory candidate'),
      real = await report(survivor, 1, 'Real report retained'),
      third = await report(unrelated, 1, 'Ordinary unrelated report');
    await pg`INSERT INTO operational_assessments(ticket_id,assessed_by_admin_id,assessed_conditions,operational_constraints) VALUES(${survivor},${actor.id},'PRIVATE_ASSESSMENT','{"selected":[],"notes":{}}'::jsonb)`;
    const [wo] =
      await pg`INSERT INTO work_orders(ticket_id,title,assigned_office,created_by_admin_id,assigned_admin_id) VALUES(${survivor},'E2E inventory Work Order','MEO',${actor.id},${actor.id}) RETURNING id`;
    await pg`INSERT INTO acknowledgments(ticket_id,acknowledged_by_admin_id,remarks) VALUES(${old},${actor.id},'PRIVATE_REMARK')`;
    await pg`INSERT INTO report_intake_actions(report_id,action_type,actor_admin_id) VALUES(${own},'screened',${actor.id})`;
    await pg`INSERT INTO verifications(ticket_id,citizen_id) VALUES(${survivor},'oauth:PRIVATE_SUBJECT'),(${survivor},${String(citizen.id)})`;
    await db.insert(notifications).values({
      recipientType: 'citizen',
      recipientId: citizen.id,
      type: 'fixture',
      title: 'PRIVATE_TITLE',
      message: 'PRIVATE_NOTIFICATION',
      entityType: 'work_order',
      entityId: wo.id,
      href: '/admin/tickets/' + survivor,
    });
    await pg`INSERT INTO citizen_audit_events(citizen_id,event_type,detail) VALUES(${citizen.id},'password_set','{"private":"PRIVATE_AUDIT"}'::jsonb)`;
    await pg`INSERT INTO rate_limit_events(ip,geom,citizen_id) VALUES('192.0.2.1',ST_SetSRID(ST_MakePoint(120.54,15.07),4326),${citizen.id})`;
    const audit = new AdminAuditService(db),
      actorInput = {
        adminId: actor.id,
        adminName: 'PRIVATE_NAME',
        email: actor.email,
        accountType: 'PERSONNEL',
        office: 'MEO',
      };
    await audit.logRequired({
      actor: actorInput,
      actionType: 'ticket_merged',
      targetType: 'ticket',
      targetId: survivor,
      targetSummary: 'PRIVATE_SUMMARY',
      metadata: {
        mergedTicketId: old,
        movedReportIds: [own],
        reason: 'PRIVATE_REASON',
      },
    });
    await audit.logRequired({
      actor: actorInput,
      actionType: 'work_order_created',
      targetType: 'work_order',
      targetId: wo.id,
      targetSummary: 'PRIVATE_SUMMARY',
      metadata: { ticketId: survivor, assignedAdminId: actor.id },
    });
    await audit.logRequired({
      actor: actorInput,
      actionType: 'report_exported',
      targetType: 'export',
      targetId: actor.id,
      targetSummary: 'PRIVATE_SUMMARY',
      metadata: { selectionCount: third },
    });
    async function fingerprint() {
      const result = {};
      for (const table of Object.keys(INVENTORY_TABLES))
        result[table] = (
          await pg.unsafe(
            `SELECT count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) hash FROM ${table} t`,
          )
        )[0];
      return result;
    }
    const before = await fingerprint(),
      result = await readInventory(db, options);
    assert.deepEqual(result.candidateCounts, {
      citizens: 1,
      admins: 1,
      reports: 1,
      work_orders: 1,
      tickets: 1,
    });
    ok(
      'actual account/audit services and real constraints populate a minimal mixed historical dataset',
    );
    assert(result.mixedTicketIds.includes(survivor));
    assert(result.contextEntities.includes('tickets:' + old));
    assert(result.contextEntities.includes('reports:' + real));
    assert(!result.contextEntities.includes('reports:' + third));
    assert(
      !result.candidates.some(
        (c) => c.entity.table === 'reports' && c.entity.id === real,
      ),
    );
    ok(
      'merge source and real co-member retained as context, never promoted to candidates',
    );
    assert(result.auditProtectedEntities.includes('reports:' + own));
    assert(result.auditProtectedEntities.includes('tickets:' + old));
    assert(result.auditProtectedEntities.includes('citizens:' + citizen.id));
    assert(result.auditProtectedEntities.includes('admins:' + actor.id));
    assert(!result.auditProtectedEntities.includes('reports:' + third));
    ok(
      'soft actor/typed metadata/export target and citizen-audit references preserve ID namespaces',
    );
    const notice = result.references.filter(
      (e) => e.source.table === 'notifications',
    );
    assert(
      notice.some(
        (e) => e.target.table === 'work_orders' && e.target.id === wo.id,
      ),
    );
    assert(
      notice.some(
        (e) => e.target.table === 'tickets' && e.target.id === survivor,
      ),
    );
    assert(
      result.references.some(
        (e) => e.source.table === 'acknowledgments' && e.target.id === old,
      ),
    );
    ok(
      'physical acknowledgment and polymorphic notification entity/href references found',
    );
    assert(
      result.unresolvedReferences.some(
        (i) => i.reason === 'legacy_verification_identity_unresolved',
      ),
    );
    assert(!JSON.stringify(result).includes('PRIVATE_'));
    assert(!JSON.stringify(result).includes(actor.email));
    assert(!JSON.stringify(result).includes('192.0.2.1'));
    ok(
      'private content, account emails, hashes, images and IP addresses absent from report',
    );
    const wrapper = new Proxy(db, {
      get(target, property) {
        if (property !== 'transaction') return Reflect.get(target, property);
        return async (callback, config) => {
          assert.equal(config.accessMode, 'read only');
          assert.equal(config.isolationLevel, 'repeatable read');
          return target.transaction(async (tx) => {
            const report = await callback(tx);
            assert.equal(
              (await tx.execute(sql`SHOW transaction_read_only`))[0]
                .transaction_read_only,
              'on',
            );
            await assert.rejects(
              () =>
                tx.transaction(async (inner) =>
                  inner.execute(
                    sql`UPDATE citizens SET first_name='should fail'`,
                  ),
                ),
              (e) => hasCode(e, '25006'),
            );
            return report;
          }, config);
        };
      },
    });
    await readInventory(wrapper, options);
    assert.deepEqual(await fingerprint(), before);
    ok(
      'reader transaction is repeatable-read/read-only and PostgreSQL rejects injected UPDATE',
    );
    await readInventory(db, options);
    assert.deepEqual(await fingerprint(), before);
    ok('repeated inventories preserve all table/audit fingerprints');
    const windowed = await readInventory(db, {
      ...options,
      from: '2000-01-01T00:00:00.000Z',
      to: '2001-01-01T00:00:00.000Z',
    });
    assert.deepEqual(windowed.candidateCounts, {});
    assert(windowed.outsideWindow.length >= 4);
    ok('creation-window exclusion cannot silently include later rows');
    await assert.rejects(() => readInventory(db, options, 1), /row limit/);
    ok('bounded extraction refuses partial inventory on row limit');
    await pg`CREATE TABLE inventory_unknown_ref(id serial PRIMARY KEY,report_id integer REFERENCES reports(id))`;
    await assert.rejects(
      () => readInventory(db, options),
      /unhandled foreign.key/,
    );
    await pg`DROP TABLE inventory_unknown_ref`;
    ok(
      'new unmapped foreign key aborts before publishing an incomplete report',
    );
    const trigger = fs.readFileSync(
      path.join(root, 'api/drizzle/0047_audit_append_only.sql'),
      'utf8',
    );
    await pg`ALTER TABLE admin_audit_events DISABLE TRIGGER admin_audit_events_append_only`;
    await assert.rejects(() => readInventory(db, options), /audit protection/);
    await pg`ALTER TABLE admin_audit_events ENABLE TRIGGER admin_audit_events_append_only`;
    assert(trigger.includes('admin_audit_events_append_only'));
    ok(
      'missing append-only protection refuses inventory (mutation confined to test memory)',
    );
    process.env.LOCALAPPDATA = folder;
    process.env.XDG_DATA_HOME = folder;
    {
      const output = writeInventoryReport(
        { ...result, target: 'loopback', gitCommit: '0'.repeat(40) },
        root,
      );
      assert(output.startsWith(folder));
      const bytes = fs.readFileSync(path.join(output, 'inventory.json'));
      assert(!bytes.toString().includes('PRIVATE_'));
      const manifest = JSON.parse(
        fs.readFileSync(path.join(output, 'manifest.json')),
      );
      assert.equal(
        manifest.sha256,
        require('crypto').createHash('sha256').update(bytes).digest('hex'),
      );
      assert(
        fs
          .readFileSync(path.join(output, 'summary.md'), 'utf8')
          .includes('No record is approved for deletion'),
      );
      process.env.LOCALAPPDATA = root;
      process.env.XDG_DATA_HOME = root;
      assert.throws(
        () =>
          writeInventoryReport(
            { ...result, target: 'loopback', gitCommit: '0'.repeat(40) },
            root,
          ),
        /outside/,
      );
      process.env.LOCALAPPDATA = folder;
      ok(
        'private external report/summary/manifest with matching digest; repository output refused',
      );
    }
    // Actual owner command, explicitly scoped to this memory-only socket. Do not
    // invoke the package script, which would load the owner's real api/.env.
    const env = {};
    for (const k of [
      'PATH',
      'Path',
      'PATHEXT',
      'SystemRoot',
      'WINDIR',
      'COMSPEC',
      'USERPROFILE',
      'HOME',
    ])
      if (process.env[k]) env[k] = process.env[k];
    Object.assign(env, {
      DATABASE_URL: url,
      LOCALAPPDATA: folder,
      XDG_DATA_HOME: folder,
      TEMP: folder,
      TMP: folder,
      TMPDIR: folder,
      TSX_TSCONFIG_PATH: path.join(root, 'api/tsconfig.json'),
      PORAC_FRESH_ROOT: folder,
      PORAC_FRESH_PORT: String(port),
      PORAC_FRESH_AUDIT: path.join(folder, 'cli-boundary.json'),
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: root,
    });
    const output = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--require',
          path.join(__dirname, 'helpers/fresh-cli-guard.cjs'),
          '--require',
          require.resolve('tsx/cjs'),
          path.join(root, 'api/scripts/maintenance/inventory-test-data.ts'),
          '--target',
          'local',
          '--all-dates',
        ],
        {
          cwd: folder,
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let out = '',
        err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('Inventory CLI timeout'));
      }, 60000);
      child.stdout.on('data', (x) => (out += x));
      child.stderr.on('data', (x) => (err += x));
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve({ code, out, err });
      });
    });
    assert.equal(
      output.code,
      0,
      output.err.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]'),
    );
    const parsed = JSON.parse(output.out.trim());
    assert.equal(parsed.mode, 'read-only-review');
    assert.equal(parsed.target, 'loopback');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(folder, 'cli-boundary.json'))),
      {
        networkAttempts: 0,
        envReadAttempts: 0,
        outsideWrites: 0,
        ipcSuppressed: 1,
      },
    );
    assert.deepEqual(parsed.candidateCounts, result.candidateCounts);
    assert(!output.out.includes('PRIVATE_'));
    assert.deepEqual(await fingerprint(), before);
    ok(
      'actual inventory CLI succeeds against exact disposable socket, without loading an env file',
    );
    fs.writeFileSync(
      path.join(folder, 'result.json'),
      JSON.stringify(
        {
          groups,
          counts: result.candidateCounts,
          issues: result.unresolvedReferences.length,
        },
        null,
        2,
      ),
    );
    console.log(groups + ' inventory groups passed; artifacts: ' + folder);
  } finally {
    if (originalXdgData === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalXdgData;
    if (originalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = originalAppData;
    if (pg) await pg.end({ timeout: 2 });
    if (server) await server.stop();
    await memory.close();
  }
}
main().catch((error) => {
  console.error(
    error.stack?.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]') ||
      'Offline inventory check failed',
  );
  process.exitCode = 1;
});
