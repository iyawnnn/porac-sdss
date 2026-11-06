// Throwaway in-memory PostgreSQL only. No .env or production client import.
// Reuse the scratch PGlite dependency: PGLITE_MODULE_ROOT=<scratch directory>
// Also set NODE_PATH=<scratch directory>/node_modules for Drizzle's peer.
// node api/test/audit-append-only.pglite.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const load = createRequire(path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'));
const { PGlite } = load('@electric-sql/pglite');
const { drizzle } = require('drizzle-orm/pglite');
const { sql } = require('drizzle-orm');
const dir = path.resolve(__dirname, '../drizzle');
const read = (name) => readFileSync(path.join(dir, name), 'utf8');
const split = (file) => file.split('--> statement-breakpoint').map(s => s.trim())
  .filter(s => s.split(/\r?\n/).some(l => l.trim() && !l.trim().startsWith('--')));

async function main() {
  const memory = new PGlite(); // no path: entirely in memory
  const db = drizzle(memory);
  const query = async (statement) => (await db.execute(sql.raw(statement))).rows;
  const migration = split(read('0047_audit_append_only.sql'));
  const checks = split(read('0047_audit_append_only.check.sql'));
  const apply = () => db.transaction(async tx => {
    for (const statement of migration) await tx.execute(sql.raw(statement));
  });
  let n = 0;
  const ok = label => console.log(`ok ${++n} - ${label}`);
  try {
    await query("CREATE TYPE admin_role AS ENUM ('officer', 'supervisor', 'focal', 'system_admin')");
    await query("CREATE TYPE office AS ENUM ('MEO', 'MDRRMO')");
    await query("CREATE TYPE admin_account_type AS ENUM ('PERSONNEL', 'SYSTEM_ADMIN')");
    for (const statement of read('0018_admin_audit_events.sql').split(';').filter(s => s.trim())) {
      await query(statement);
    }
    // Real 0039 audit column/backfill/insert trigger/NOT NULL, before 0047.
    const staff = read('0039_staff_account_types.sql');
    for (const statement of split(staff.slice(staff.indexOf('-- 7. The audit actor')))) {
      await query(statement);
    }
    await query('CREATE TABLE admins (id serial PRIMARY KEY, name text NOT NULL)');
    await query("INSERT INTO admins (name) VALUES ('Original')");
    const insert = (focal = '') => `INSERT INTO admin_audit_events
      (actor_admin_id, actor_name, actor_email, actor_role, actor_office,
       action_type, target_type, target_id, target_summary, metadata${focal ? ', actor_is_focal' : ''})
      VALUES (1, 'Historical actor', 'actor@test', 'focal', 'MDRRMO',
       'test', 'admin', 1, 'Original summary', '{"preserve":true}'${focal ? ', ' + focal : ''})`;
    await query(insert());
    await query(insert());
    const original = await query('SELECT * FROM admin_audit_events ORDER BY id');
    const [before] = await query(checks[0]);
    assert.equal(before.new_columns, 0);
    assert.equal(before.trigger_exists, false);
    assert.equal(migration.length, 4);
    assert.equal(checks.length, 2);
    await apply();
    const [after] = await query(checks[0]);
    assert.equal(after.new_columns, 1);
    for (const field of ['nullable_boolean_no_default', 'trigger_function_exists',
      'trigger_exists', 'trigger_enabled_before_update_delete_row']) assert.equal(after[field], true, field);
    assert.equal(after.audit_events_total, before.audit_events_total);
    assert.equal(after.historical_values_fingerprint, before.historical_values_fingerprint);
    assert.deepEqual(await query(checks[1]), [{audit_events_total: 2,
      actor_focal_not_recorded: 2, actor_focal_true: 0, actor_focal_false: 0}]);
    assert.deepEqual(await query('SELECT * FROM admin_audit_events ORDER BY id'),
      original.map(row => ({...row, actor_is_focal: null})));
    ok('applies; column nullable/no default, function and correct enabled trigger; all historical values and counts unchanged');
    await apply();
    assert.deepEqual(await query(checks[0]), [after]);
    assert.deepEqual(await query('SELECT * FROM admin_audit_events ORDER BY id'),
      original.map(row => ({...row, actor_is_focal: null})));
    ok('second apply changes no data or checked schema behavior');
    for (const value of ['', 'true', 'false', 'NULL']) await query(insert(value));
    assert.deepEqual((await query('SELECT actor_is_focal FROM admin_audit_events ORDER BY id')).map(r => r.actor_is_focal),
      [null, null, null, true, false, null]);
    assert((await query('SELECT actor_account_type FROM admin_audit_events')).every(r => r.actor_account_type === 'PERSONNEL'));
    ok('INSERT omitted, true, false, explicit NULL; existing 0039 insert trigger still works');
    const all = await query('SELECT * FROM admin_audit_events ORDER BY id');
    for (const statement of [
      "UPDATE admin_audit_events SET target_summary = 'changed' WHERE id = 1",
      'UPDATE admin_audit_events SET actor_role = actor_role WHERE id = 1',
      'DELETE FROM admin_audit_events WHERE id = 1',
    ]) {
      await assert.rejects(query(statement), error => {
        // Drizzle wraps the PostgreSQL exception as its cause.
        assert.match(error.cause?.message ?? error.message,
          /admin_audit_events is append-only: UPDATE and DELETE are not allowed/);
        return true;
      });
      assert.deepEqual(await query('SELECT * FROM admin_audit_events ORDER BY id'), all);
    }
    ok('UPDATE, no-op UPDATE and DELETE fail with clear trigger message; every row preserved');
    await query("UPDATE admins SET name = 'Edited' WHERE id = 1");
    await query('DELETE FROM admins WHERE id = 1');
    assert.deepEqual(await query('SELECT * FROM admin_audit_events ORDER BY id'), all);
    assert.equal((await query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f' AND (conrelid = 'admin_audit_events'::regclass OR confrelid = 'admin_audit_events'::regclass)"))[0].n, 0);
    ok('unrelated table UPDATE/DELETE unaffected; no audit FKs/cascade');
    const summary = await query(checks[0]);
    const detail = await query(checks[1]);
    await apply();
    assert.deepEqual(await query(checks[0]), summary);
    assert.deepEqual(await query(checks[1]), detail);
    assert.deepEqual(await query('SELECT * FROM admin_audit_events ORDER BY id'), all);
    ok('rerun preserves recorded true/false as well as NULL history');
    await query('TRUNCATE admin_audit_events RESTART IDENTITY');
    assert.equal((await query(checks[0]))[0].audit_events_total, 0);
    ok('TRUNCATE remains allowed on throwaway database');
    console.log(`${n} audit migration check groups passed`);
  } finally {
    await memory.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
