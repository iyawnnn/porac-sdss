// Real admin migration history in memory; no env file or seed CLI is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, '../tsconfig.json');
require('tsx/cjs');
const load = createRequire(path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'));
const { PGlite } = load('@electric-sql/pglite');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const bcrypt = require('bcryptjs');
const { seedAdminAccount } = require('../scripts/lib/seed-admin-account.ts');
const { assertSeedTarget } = require('../scripts/lib/seed-target.ts');
const { lockE2EStaffAccounts } = require('../scripts/lib/retire-e2e-admins.ts');
let checks = 0;
const ok = label => console.log('ok ' + (++checks) + ' - ' + label);

async function main() {
  const memory = new PGlite();
  let server, raw;
  try {
    // Only unrelated PostGIS extension creation is omitted. No stand-in admin
    // columns, enums, defaults or constraints: replay their real SQL history.
    for (const name of ['0000_soft_landau.sql', '0016_admin_system_role.sql',
      '0017_admin_created_at.sql', '0018_admin_audit_events.sql', '0019_admin_password_security.sql',
      '0020_admin_status.sql', '0030_admin_focal_role.sql', '0039_staff_account_types.sql', '0047_audit_append_only.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../drizzle', name), 'utf8');
      await memory.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS postgis;', ''));
    }
    server = new PGLiteSocketServer({ db: memory, port: 0, host: '127.0.0.1' });
    await server.start();
    const url = 'postgres://postgres:postgres@' + server.getServerConn() + '/postgres';
    assertSeedTarget(url);
    raw = postgres(url, { max: 1, onnotice: () => {}, debug: (_connection, _query, params) => {
      assert(!params.some(value => value instanceof Date), 'raw SQL received a JS Date');
    }});
    const db = drizzle(raw);
    ok('real admin migration baseline and guarded local drizzle client');
    const tuples = [['PERSONNEL','MEO','false','officer'], ['PERSONNEL','MDRRMO','false','officer'],
      ['PERSONNEL','MDRRMO','true','focal'], ['SYSTEM_ADMIN','-','false','system_admin']];
    for (const [index, [type, office, focal, role]] of tuples.entries()) {
      const email = 'seed-' + index + '@fixture.invalid';
      const args = [email, 'in-memory-test-password', type, office, focal];
      await seedAdminAccount(db, args);
      const [row] = await raw`SELECT * FROM admins WHERE email = ${email}`;
      assert.equal(row.account_type, type);
      assert.equal(row.office, office === '-' ? null : office);
      assert.equal(row.is_focal, focal === 'true');
      assert.equal(row.role, role);
      assert(await bcrypt.compare('in-memory-test-password', row.password_hash));
      await seedAdminAccount(db, [...args, 'Updated', 'Name']);
      const [updated] = await raw`SELECT * FROM admins WHERE email = ${email}`;
      assert.equal(updated.id, row.id);
      assert.equal(updated.first_name, 'Updated');
      ok('canonical account and repeated upsert: ' + type + '/' + office + '/' + focal);
    }
    const before = await raw`SELECT * FROM admins ORDER BY id`;
    for (const tuple of [['PERSONNEL','MEO','true'], ['SYSTEM_ADMIN','MEO','false'], ['PERSONNEL','-','false'], ['SYSTEM_ADMIN','-','true']]) {
      await assert.rejects(() => seedAdminAccount(db, ['invalid@fixture.invalid', 'not-used', ...tuple]));
    }
    assert.deepEqual(await raw`SELECT * FROM admins ORDER BY id`, before);
    await assert.rejects(() => raw`INSERT INTO admins(first_name,last_name,email,password_hash,role,account_type,office,is_focal)
      VALUES('Bad','Tuple','bad@fixture.invalid','unused','focal','PERSONNEL','MEO',true)`, /admins_account_type_office_focal_check/);
    ok('invalid tuples leave rows unchanged and real database constraint rejects bad tuples');
    await raw`INSERT INTO admin_audit_events(actor_admin_id,actor_name,actor_email,actor_role,actor_account_type,actor_is_focal,action_type,target_type,target_id,target_summary)
      SELECT id,'Fixture','audit@fixture.invalid','system_admin','SYSTEM_ADMIN',false,'admin_login','admin',id,'Fixture login' FROM admins ORDER BY id LIMIT 1`;
    const auditBefore = await raw`SELECT * FROM admin_audit_events`;
    await seedAdminAccount(db, ['seed-0@fixture.invalid','in-memory-test-password','SYSTEM_ADMIN','-','false']);
    assert.equal((await raw`SELECT count(*)::int AS n FROM admins`)[0].n, 4);
    assert.deepEqual(await raw`SELECT * FROM admin_audit_events`, auditBefore);
    await assert.rejects(() => raw`DELETE FROM admin_audit_events`, /append.only/i);
    ok('account transition keeps one row; existing audit stays unchanged and append-only');
    const lockBefore = await raw`SELECT * FROM admins WHERE email = 'seed-2@fixture.invalid'`;
    assert.equal(await lockE2EStaffAccounts(raw, ['seed-0@fixture.invalid', 'seed-1@fixture.invalid']), 2);
    for (const row of await raw`SELECT * FROM admins WHERE email IN ('seed-0@fixture.invalid','seed-1@fixture.invalid')`) {
      assert(!(await bcrypt.compare('in-memory-test-password', row.password_hash)), 'locked account still accepts run password');
      assert(row.session_valid_after, 'locked account sessions not invalidated');
    }
    assert.deepEqual(await raw`SELECT * FROM admins WHERE email = 'seed-2@fixture.invalid'`, lockBefore);
    assert.deepEqual(await raw`SELECT * FROM admin_audit_events`, auditBefore);
    ok('IAN-26: E2E staff lock rotates to an unknowable hash, invalidates sessions, touches only listed accounts and no audit');
    delete process.env.E2E_ADMIN_PASSWORD;
    const { assertStaffPasswordConfigured, E2E_ADMIN_ACCOUNTS } = require('../../e2e/test-credentials.ts');
    assert.throws(assertStaffPasswordConfigured, /E2E_ADMIN_PASSWORD/);
    assert(E2E_ADMIN_ACCOUNTS.every(a => a.password === ''), 'staff accounts have a committed password default');
    ok('IAN-26: staff E2E accounts have no committed password and provisioning refuses to run without a private one');
    console.log(checks + ' seed admin check groups passed');
  } finally {
    if (raw) await raw.end();
    if (server) await server.stop();
    await memory.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
