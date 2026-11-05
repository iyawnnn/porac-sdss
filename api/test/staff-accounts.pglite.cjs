// Disposable in-memory schema only; no .env, migration or seed runner.
// Install PGlite/socket in a scratch project and set PGLITE_MODULE_ROOT.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
require('reflect-metadata');
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGlite } = load('@electric-sql/pglite');
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { AdminsService } = require('../dist/admin/admins.service');
const { AdminAuditService } = require('../dist/admin/admin-audit.service');
const { SessionService } = require('../dist/auth/session.service');

async function main() {
  const memory = new PGlite();
  await memory.exec(`
    CREATE TABLE admins (id serial PRIMARY KEY, email text UNIQUE NOT NULL,
      first_name text NOT NULL, last_name text NOT NULL, password_hash text NOT NULL,
      role text NOT NULL, account_type text NOT NULL, office text, is_focal boolean DEFAULT false,
      is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(),
      password_changed_at timestamptz, session_valid_after timestamptz);
    CREATE TABLE admin_audit_events (id serial PRIMARY KEY, actor_admin_id int, actor_name text,
      actor_email text, actor_role text NOT NULL, actor_account_type text NOT NULL, actor_office text,
      action_type text, target_type text, target_id int, target_summary text, metadata jsonb,
      created_at timestamptz DEFAULT now());
    INSERT INTO admins (id,email,first_name,last_name,password_hash,role,account_type,office,is_active)
    VALUES (1,'one@test','One','Staff','hash','officer','PERSONNEL','MEO',true),
      (2,'inactive@test','Inactive','Admin','hash','system_admin','SYSTEM_ADMIN',null,false),
      (3,'three@test','Three','Admin','hash','system_admin','SYSTEM_ADMIN',null,true),
      (99,'actor@test','Actor','Admin','hash','system_admin','SYSTEM_ADMIN',null,true);
    SELECT setval('admins_id_seq', 100);
  `);
  const server = new PGLiteSocketServer({
    db: memory,
    port: 0,
    host: '127.0.0.1',
  });
  await server.start();
  const queries = [];
  const raw = postgres(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    {
      max: 1,
      debug: (_connection, query, params) => {
        assert(
          !params.some((v) => v instanceof Date),
          'raw SQL received a JS Date',
        );
        queries.push(query);
      },
    },
  );
  const db = drizzle(raw);
  const audit = new AdminAuditService(db);
  const service = new AdminsService(db, audit);
  const actor = {
    adminId: 99,
    adminName: 'Actor Admin',
    email: 'actor@test',
    accountType: 'SYSTEM_ADMIN',
    office: null,
    isFocal: false,
  };
  const personnel = { accountType: 'PERSONNEL', office: 'MEO', isFocal: false };
  const state = async (id = 1) =>
    (await raw`SELECT * FROM admins WHERE id = ${id}`)[0];
  const events = async () => raw`SELECT * FROM admin_audit_events ORDER BY id`;
  let checks = 0;
  const check = (label) => {
    console.log(`ok ${++checks} - ${label}`);
  };
  try {
    const sessions = new SessionService(
      { get: () => 'a-test-secret-that-is-at-least-32-bytes-long' },
      db,
    );
    const old = await sessions.signAdminSession({
      ...actor,
      adminId: 1,
      ...personnel,
    });
    assert(await sessions.verifyAdminSession(old));
    for (const fields of [
      { ...personnel, office: 'MDRRMO' },
      { ...personnel, office: 'MDRRMO', isFocal: true },
      { accountType: 'SYSTEM_ADMIN', office: null, isFocal: false },
    ]) {
      const before = await state();
      const count = (await events()).length;
      await service.update(1, fields, actor);
      const after = await state();
      assert(after.session_valid_after);
      assert(
        !before.session_valid_after ||
          after.session_valid_after > before.session_valid_after,
      );
      assert.equal((await events()).length, count + 1);
      assert.equal((await events()).at(-1).metadata.sessionsEnded, true);
    }
    assert.equal(await sessions.verifyAdminSession(old), null);
    check(
      'type, office and Focal edits bump sessions and audit once; old token rejected',
    );

    const unchanged = await state();
    const count = (await events()).length;
    const current = {
      accountType: 'SYSTEM_ADMIN',
      office: null,
      isFocal: false,
    };
    await service.update(1, current, actor);
    await assert.rejects(
      service.update(1, { ...current, office: 'MEO' }, actor),
    );
    assert.deepEqual(await state(), unchanged);
    assert.equal((await events()).length, count);
    check('no-op and failed validation preserve sessions and audit');

    // A failing audit must roll back the field change AND session bump.
    await memory.exec(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER fail_audit BEFORE INSERT ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION fail_audit();`);
    await assert.rejects(service.update(1, personnel, actor));
    assert.deepEqual(await state(), unchanged);
    await memory.exec('DROP TRIGGER fail_audit ON admin_audit_events');
    check(
      'audit failure rolls back the account and session timestamp together',
    );

    await service.update(1, personnel, actor);
    // Only 3 and 99 remain active System Administrators; inactive 2 cannot count.
    await service.update(3, personnel, actor);
    await assert.rejects(
      service.update(99, personnel, { ...actor, adminId: 3 }),
      /last active System Administrator/,
    );
    assert.equal(
      (
        await raw`SELECT id FROM admins WHERE account_type = 'SYSTEM_ADMIN' AND is_active`
      ).length,
      1,
    );
    assert.equal((await state(3)).account_type, 'PERSONNEL');
    await assert.rejects(
      service.setActive(99, false, { ...actor, adminId: 3 }),
      /last active System Administrator/,
    );
    check(
      'two sequential demotions allow exactly one; inactive administrator does not bypass either last-active guard',
    );

    assert(
      queries.some((q) => /is_active.*order by.*for update/i.test(q)),
      'active administrator locking query ran',
    );
    assert(
      queries.some((q) => /where.*id.*for update/i.test(q)),
      'target locking query ran',
    );
    check(
      'real SELECT FOR UPDATE statements executed through drizzle-wrapped postgres.js',
    );

    await service.update(2, personnel, actor);
    await service.setActive(2, true, actor);
    const validAfter = (await state(2)).session_valid_after;
    await service.setActive(2, false, actor);
    assert((await state(2)).session_valid_after >= validAfter);
    await service.setActive(2, true, actor);
    check('inactive account edits, activation and deactivation write paths');

    const created = await service.create(
      {
        ...personnel,
        email: 'created@test',
        password: 'longenoughpassword',
        firstName: 'New',
        lastName: 'Staff',
      },
      actor,
    );
    assert.equal(created.account_type, 'PERSONNEL');
    assert(!('passwordHash' in created));
    check('create path writes account and audit through the wrapped client');

    // The supplied actor claims deliberately disagree with the stored actor.
    const staleActor = { ...actor, accountType: 'PERSONNEL' };
    await db.transaction((tx) =>
      audit.logInTx(tx, {
        actor: staleActor,
        actionType: 'admin_role_updated',
        targetType: 'admin',
        targetId: 1,
        targetSummary: 'fixture',
      }),
    );
    let event = (await events()).at(-1);
    assert.equal(event.actor_account_type, 'SYSTEM_ADMIN');
    assert.equal(event.actor_role, 'system_admin');
    await raw.begin((tx) =>
      audit.logInPgTx(tx, {
        actor: staleActor,
        actionType: 'admin_role_updated',
        targetType: 'admin',
        targetId: 1,
        targetSummary: 'fixture',
      }),
    );
    event = (await events()).at(-1);
    assert.equal(event.actor_account_type, 'SYSTEM_ADMIN');
    assert.equal(event.actor_role, 'system_admin');
    await audit.logBestEffort({
      actor: staleActor,
      actionType: 'admin_login',
      targetType: 'admin',
      targetId: 99,
      targetSummary: 'fixture',
    });
    assert.equal((await events()).at(-1).actor_account_type, 'SYSTEM_ADMIN');
    check(
      'Drizzle, raw-PG and login audit inserts read both actor fields from the stored actor',
    );
    console.log(`${checks} staff-account check groups passed`);
  } finally {
    await raw.end();
    await server.stop();
    await memory.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
