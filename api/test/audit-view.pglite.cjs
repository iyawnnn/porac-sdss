// In-memory fixture only; never loads .env or api/scripts/db.ts. Build API
// first. Set PGLITE_MODULE_ROOT to the existing scratch PGlite/socket project.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
require('reflect-metadata');
require('tsx/cjs');
const load = createRequire(path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'));
const { PGlite } = load('@electric-sql/pglite');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { AdminAuditService } = require('../dist/admin/admin-audit.service');
const { DemoAuditService } = require('../scripts/lib/demo-audit.ts');
const { insertAuditViewFixtures } = require('../scripts/lib/audit-view-fixtures.ts');

async function main() {
  const memory = new PGlite();
  await memory.exec(`
    CREATE TABLE admins (id serial PRIMARY KEY, first_name text, last_name text,
      email text, role text, account_type text NOT NULL, is_focal boolean NOT NULL,
      office text, is_active boolean DEFAULT true);
    INSERT INTO admins VALUES
      (1,'Focal','Stored','focal@test','focal','PERSONNEL',true,'MDRRMO',true),
      (2,'MEO','Stored','meo@test','officer','PERSONNEL',false,'MEO',true),
      (3,'MIS','Stored','mis@test','system_admin','SYSTEM_ADMIN',false,NULL,true);
    CREATE TABLE admin_audit_events (id serial PRIMARY KEY, actor_admin_id int,
      actor_name text, actor_email text, actor_role text NOT NULL,
      actor_account_type text NOT NULL, actor_is_focal boolean, actor_office text,
      action_type text, target_type text, target_id int, target_summary text,
      metadata jsonb, created_at timestamptz DEFAULT now());
    CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit is append-only'; END $$;
    CREATE TRIGGER fixture_append_only BEFORE UPDATE OR DELETE ON admin_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
  `);
  const server = new PGLiteSocketServer({ db: memory, port: 0, host: '127.0.0.1' });
  await server.start();
  const raw = postgres(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
    debug: (_connection, _query, params) => assert(!params.some(p => p instanceof Date), 'JS Date reached postgres.js'),
  });
  const db = drizzle(raw);
  const audit = new AdminAuditService(db);
  const demo = new DemoAuditService(db);
  const input = (id, metadata = { from: 'MEO', to: 'MDRRMO', reason: 'PRIVATE REASON' }) => ({
    actor: { adminId: id, adminName: 'Recorded Actor', email: 'private@test',
      accountType: 'SYSTEM_ADMIN', isFocal: false, office: null }, // deliberately stale
    actionType: 'ticket_reassigned', targetType: 'ticket', targetId: 777,
    targetSummary: 'PRIVATE TITLE citizen@test 15.123456', metadata,
  });
  let n = 0;
  const ok = label => console.log(`ok ${++n} - ${label}`);
  try {
    for (const id of [1, 2, 3]) {
      await raw.begin(tx => audit.logInPgTx(tx, input(id)));
      await db.transaction(tx => audit.logInTx(tx, input(id)));
      await audit.logBestEffort(input(id));
    }
    const rows = await raw`SELECT * FROM admin_audit_events ORDER BY id`;
    assert.equal(rows.length, 9);
    for (const row of rows) {
      assert.equal(row.actor_is_focal, row.actor_admin_id === 1);
      assert.equal(row.actor_account_type, row.actor_admin_id === 3 ? 'SYSTEM_ADMIN' : 'PERSONNEL');
      assert.equal(row.actor_office, row.actor_admin_id === 1 ? 'MDRRMO' : row.actor_admin_id === 2 ? 'MEO' : null);
      assert.equal(row.actor_role, row.actor_admin_id === 1 ? 'focal' : row.actor_admin_id === 2 ? 'officer' : 'system_admin');
    }
    ok('Drizzle, raw-PG and best-effort inserts: stored Focal, Personnel and MIS snapshots, no NULL or JS Date');
    const result = await audit.list(audit.parseFilters({ actorAdminId: '1', targetType: 'ticket', targetId: '777', actionType: 'ticket_reassigned', limit: '10' }));
    assert.equal(result.total, 3);
    assert(result.events.every(e => e.actor.id === 1 && e.actor.display_label === 'Focal Personnel'));
    for (const secret of ['PRIVATE', 'private@test', 'citizen@test', '15.123456', 'target_summary', 'metadata', 'actor_email']) assert(!JSON.stringify(result).includes(secret), secret);
    assert.deepEqual(result.events[0].details, { from: 'MEO', to: 'MDRRMO' });
    assert.equal((await audit.list({ targetType: 'report', targetId: 777 })).total, 0);
    assert.equal((await audit.list({ targetType: 'ticket', targetId: 778 })).total, 0);
    assert.equal((await audit.list({ limit: 1 })).limit, 10);
    ok('real filtered list/count/pagination query returns only the privacy contract');
    await raw`INSERT INTO admin_audit_events (actor_admin_id, actor_name, actor_role, actor_account_type,
      actor_is_focal, action_type, target_type, target_id, created_at)
      VALUES (3, 'MIS', 'system_admin', 'SYSTEM_ADMIN', false, 'admin_login', 'admin', 2, '2026-11-05T15:59:00Z'::timestamptz),
        (3, 'MIS', 'system_admin', 'SYSTEM_ADMIN', false, 'admin_login', 'admin', 2, '2026-11-05T16:00:00Z'::timestamptz)`;
    for (const [day, expected] of [['2026-11-05', '2026-11-05T15:59:00.000Z'], ['2026-11-06', '2026-11-05T16:00:00.000Z']]) {
      const list = await audit.list(audit.parseFilters({ targetType: 'admin', targetId: '2', from: day, to: day }));
      assert.equal(list.total, 1);
      assert.equal(list.events[0].created_at, expected);
      assert.equal(list.events[0].target_label, 'MEO Stored');
    }
    ok('Manila days split 15:59Z/16:00Z correctly; staff target label is a live name without email');
    // Existing untagged events above are also skipped: compatible with old seeds.
    const before = (await raw`SELECT count(*)::int AS n FROM admin_audit_events`)[0].n;
    await raw.begin(tx => demo.logInPgTx(tx, input(1)));
    await db.transaction(tx => demo.logInTx(tx, input(1)));
    assert.equal((await raw`SELECT count(*)::int AS n FROM admin_audit_events`)[0].n, before);
    for (let i = 0; i < 2; i++) {
      await raw.begin(tx => demo.logInPgTx(tx, input(1, { from: 'MDRRMO', to: 'MEO' })));
      await db.transaction(tx => demo.logInTx(tx, input(2, { from: 'MDRRMO', to: 'MEO' })));
    }
    assert.equal((await raw`SELECT count(*)::int AS n FROM admin_audit_events`)[0].n, before + 2);
    assert.deepEqual(await raw`SELECT * FROM admin_audit_events WHERE id <= 9 ORDER BY id`, rows);
    ok('seed-only dedupe skips old and repeated events through both transaction clients; distinct transitions retained');
    const first = await raw.begin(insertAuditViewFixtures);
    const second = await raw.begin(insertAuditViewFixtures);
    assert.notEqual(first.targetId, second.targetId);
    assert(first.targetId >= 1000000000);
    const fixtureRows = await audit.list({ targetType: 'ticket', targetId: first.targetId, limit: 100 });
    assert.equal(fixtureRows.total, 31);
    assert(fixtureRows.events.every(e => e.actor.is_focal === false && e.target_id === first.targetId));
    assert.equal((await audit.list({ targetType: 'ticket', targetId: first.targetId, from: '2026-11-05', to: '2026-11-05' })).total, 30);
    assert.equal((await audit.list({ targetType: 'ticket', targetId: first.targetId, from: '2026-11-06', to: '2026-11-06' })).total, 1);
    ok('E2E INSERT-only fixture helper uses fresh targets and tolerates accumulated rows; all actions and midnight split');
    console.log(`${n} audit view check groups passed`);
  } finally {
    await raw.end(); await server.stop(); await memory.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
