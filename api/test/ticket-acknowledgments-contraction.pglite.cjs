// Only in-memory PostgreSQL fixtures. Never imports scripts/db or reads env files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  baseline,
  snapshot,
  apply,
  migration,
} = require('./phase8b-contraction.pglite.cjs');
const {
  ACK_CONTRACTION_SQL,
  ACK_CANONICAL_QUERY,
} = require('../scripts/lib/acknowledgment-contraction.ts');
const {
  archiveDigest,
  assertArchiveOutsideRepository,
  writeAcknowledgmentArchive,
  readAcknowledgmentArchive,
} = require('../scripts/lib/acknowledgment-archive.ts');
const {
  migrateReportAcknowledgmentsContraction,
} = require('../scripts/migrations/migrate-report-acknowledgments-contraction.ts');
const {
  migrateReportAcknowledgments,
} = require('../scripts/migrations/migrate-report-acknowledgments.ts');
const {
  migrateTicketAcknowledgments,
} = require('../scripts/migrations/migrate-ticket-acknowledgments.ts');
const { createRequire } = require('node:module');
const load = createRequire(
  path.resolve(process.env.PGLITE_MODULE_ROOT, 'package.json'),
);
const { PGLiteSocketServer } = load('@electric-sql/pglite-socket');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { FocalIntakeService } = require('../src/admin/focal-intake.service.ts');
const {
  FocalDashboardService,
} = require('../src/admin/focal-dashboard.service.ts');
const { ReportsService } = require('../src/reports/reports.service.ts');
const {
  NotificationsService,
} = require('../src/notifications/notifications.service.ts');
const { AdminAuditService } = require('../src/admin/admin-audit.service.ts');
let checks = 0;
const ok = (label) => console.log(`ok ${++checks} - ${label}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'porac-ack-memory-'));
async function history(populated = true) {
  const db = await baseline(populated);
  await apply(db, migration('0049_phase8b_contraction.sql'));
  await db.exec(migration('0015_notifications.sql'));
  await db.exec(migration('0032_report_intake_actions.sql'));
  if (populated)
    await db.exec(`
    INSERT INTO reports(id,ticket_id,title,citizen_severity,image_url,created_at) VALUES
      (3,1,'Later','Low','fixture','2025-02-03'),(4,1,'After acknowledgment','Low','fixture','2025-02-06'),
      (5,2,'Other ticket','Low','fixture','2025-02-01'),(6,3,'Merge source','Low','fixture','2025-02-01');
    UPDATE reports SET created_at='2025-02-01' WHERE id IN(1,2);
    UPDATE report_acknowledgments SET acknowledged_at='2025-02-02T00:00:00.123456Z' WHERE report_id=1;
    INSERT INTO report_acknowledgments(report_id,acknowledged_by_admin_id,acknowledged_by_name,remarks,acknowledged_at) VALUES
      (3,5,'Old snapshot','Later remark: ñ / 私\nsecond line','2025-02-04T01:02:03.654321Z'),
      (5,5,'Historical snapshot',NULL,'2025-02-02'),(6,5,'Historical snapshot','Merge remark','2025-02-03');
  `);
  await apply(db, migration('0038_ticket_acknowledgments.sql'));
  if (populated)
    await db.exec(`UPDATE tickets SET merged_into_ticket_id=1 WHERE id=3;
    INSERT INTO admin_audit_events(actor_admin_id,actor_name,actor_email,actor_role,actor_account_type,action_type,target_type,target_id,target_summary,metadata)
    VALUES(5,'Historical','fixture@test','officer','PERSONNEL','ticket_merged','ticket',1,'Fixture','{"mergedTicketId":3,"movedReportIds":[6]}');
    UPDATE reports SET ticket_id=1 WHERE id=6;
  `);
  return db;
}
async function digest(db) {
  const rows = (await db.query(`${ACK_CANONICAL_QUERY} ORDER BY id`)).rows.map(
    (r) => r.canonical_row,
  );
  return { lines: rows, ...archiveDigest(rows) };
}
async function contract(db, sql = ACK_CONTRACTION_SQL, override = {}) {
  const d = { ...(await digest(db)), ...override };
  await apply(
    db,
    `SELECT set_config('porac.ack_archive_count','${d.rowCount}',true),set_config('porac.ack_archive_sha256','${d.sha256}',true);\n${sql}`,
  );
}
async function socket(db, fn) {
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const raw = postgres(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    { max: 1, onnotice: () => {} },
  );
  try {
    await fn(raw, drizzle(raw));
  } finally {
    await raw.end();
    await server.stop();
  }
}
async function main() {
  const repository = path.resolve(__dirname, '../..');
  assert.throws(
    () =>
      assertArchiveOutsideRepository(
        path.join(repository, '..archive', 'fixture.jsonl'),
      ),
    /outside/,
  );
  assert.throws(() => assertArchiveOutsideRepository(repository), /outside/);
  assertArchiveOutsideRepository(temp);
  ok(
    'archive path guard rejects repository paths, including dot-prefixed children',
  );
  assert(!require.cache[require.resolve('../scripts/db.ts')]);
  for (const populated of [false, true]) {
    const db = await history(populated);
    try {
      const initial = JSON.parse(await snapshot(db));
      const d = await digest(db);
      await contract(db);
      const final = await snapshot(db);
      const changed = JSON.parse(final);
      for (const table of [
        'acknowledgments',
        'report_intake_actions',
        'notifications',
        'tickets',
        'reports',
        'admin_audit_events',
        'dem_points',
      ])
        assert.deepEqual(changed[table], initial[table]);
      await apply(db, ACK_CONTRACTION_SQL);
      assert.equal(await snapshot(db), final);
      await socket(db, async (raw) => {
        await migrateReportAcknowledgments(raw);
        await migrateTicketAcknowledgments(raw);
        await migrateReportAcknowledgmentsContraction(raw);
        await require('../scripts/migrations/migrate-operational-assessment-alignment.ts').migrateAssessmentAlignment(
          raw,
        );
        await require('../scripts/migrations/migrate-assessment-work-orders.ts').migrateAssessmentWorkOrders(
          raw,
        );
        await require('../scripts/migrations/migrate-staff-account-types.ts').migrateStaffAccountTypes(
          raw,
        );
        await require('../scripts/migrations/migrate-phase8b-contraction.ts').migratePhase8bContraction(
          raw,
        );
      });
      assert.equal(await snapshot(db), final);
      assert.equal(d.rowCount, populated ? 4 : 0);
      ok(
        `${populated ? 'populated' : 'empty'} real 0031/0038 history; guarded drop twice and old runners leave final state unchanged`,
      );
    } finally {
      await db.close();
    }
  }
  const failures = [
    [
      'legacy row-type domain dependency',
      'CREATE DOMAIN surprise AS report_acknowledgments',
    ],
    [
      'legacy sequence dependency',
      "CREATE TABLE surprise(id int DEFAULT nextval('report_acknowledgments_id_seq'))",
    ],
    [
      'missing report FK',
      'ALTER TABLE report_acknowledgments DROP CONSTRAINT report_acknowledgments_report_id_fkey',
    ],
    ['missing ticket table', 'DROP TABLE acknowledgments RESTRICT'],
    [
      'missing legacy column',
      'ALTER TABLE report_acknowledgments DROP COLUMN remarks',
    ],
    [
      'wrong type',
      'ALTER TABLE report_acknowledgments ALTER COLUMN remarks TYPE varchar(1000)',
    ],
    [
      'wrong default',
      'ALTER TABLE report_acknowledgments ALTER COLUMN acknowledged_at SET DEFAULT clock_timestamp()',
    ],
    [
      'wrong nullability',
      'ALTER TABLE report_acknowledgments ALTER COLUMN acknowledged_at DROP NOT NULL',
    ],
    [
      'extra column',
      'ALTER TABLE report_acknowledgments ADD COLUMN surprise text',
    ],
    [
      'unexpected view',
      'CREATE VIEW surprise AS SELECT * FROM report_acknowledgments',
    ],
    [
      'unexpected materialized view',
      'CREATE MATERIALIZED VIEW surprise AS SELECT * FROM report_acknowledgments',
    ],
    [
      'unexpected rule',
      'CREATE RULE surprise AS ON INSERT TO report_acknowledgments DO ALSO SELECT 1',
    ],
    [
      'incoming FK',
      'CREATE TABLE surprise(id int REFERENCES report_acknowledgments(id))',
    ],
    [
      'unexpected index',
      'CREATE INDEX surprise ON report_acknowledgments(acknowledged_at)',
    ],
    [
      'unexpected function',
      `CREATE FUNCTION surprise() RETURNS bigint LANGUAGE SQL AS 'SELECT count(*) FROM report_acknowledgments'`,
    ],
    [
      'ticket shape',
      "ALTER TABLE acknowledgments ALTER COLUMN remarks SET DEFAULT 'wrong'",
    ],
    [
      'unmatched report after regroup',
      'UPDATE reports SET ticket_id=20 WHERE id=3',
    ],
    [
      'nonfinite timestamp',
      `UPDATE report_acknowledgments SET acknowledged_at='infinity' WHERE report_id=1`,
    ],
  ];
  for (const [label, change] of failures) {
    const db = await history();
    try {
      await db.exec(change);
      const before = await snapshot(db);
      // Timestamp/type corruption can also make the canonical exporter refuse.
      await assert.rejects(contract(db));
      assert.equal(await snapshot(db), before);
      ok(`${label}: abort without changing definitions or data`);
    } finally {
      await db.close();
    }
  }
  for (const override of [{ rowCount: 99 }, { sha256: '0'.repeat(64) }]) {
    const db = await history();
    try {
      const before = await snapshot(db);
      await assert.rejects(
        contract(db, ACK_CONTRACTION_SQL, override),
        /archive count\/checksum/,
      );
      assert.equal(await snapshot(db), before);
      ok('live archive count/checksum mismatch aborts unchanged');
    } finally {
      await db.close();
    }
  }
  {
    const db = await history();
    try {
      const before = await snapshot(db);
      await assert.rejects(
        apply(db, ACK_CONTRACTION_SQL),
        /verified archive is required/,
      );
      assert.equal(await snapshot(db), before);
      const injection = ACK_CONTRACTION_SQL.replace(
        '-- Failure-injection boundary: checked only by the in-memory harness.',
        "RAISE EXCEPTION 'injected after FK drop';",
      );
      await assert.rejects(contract(db, injection), /injected after FK drop/);
      assert.equal(await snapshot(db), before);
      ok(
        'required archive and failure after FK drop roll back columns, constraints, functions, triggers and all rows',
      );
      const noGuard = ACK_CONTRACTION_SQL.replace(
        /-- BEGIN ARCHIVE GUARD[\s\S]*?-- END ARCHIVE GUARD/,
        '',
      );
      await db.exec('BEGIN');
      let rejected = false;
      try {
        await db.exec(noGuard);
      } catch {
        rejected = true;
      } finally {
        await db.exec('ROLLBACK');
      }
      assert.equal(
        rejected,
        false,
        'mutation must bypass guard and be caught by rejection expectation',
      );
      assert.throws(() => assert.equal(rejected, true));
      assert.equal(await snapshot(db), before);
      ok(
        'mutation: removing archive guard fails the required rejection assertion',
      );
      const d = await digest(db);
      const archive = path.join(temp, 'fixture.jsonl');
      writeAcknowledgmentArchive(archive, d.lines, {
        createdAt: new Date().toISOString(),
        gitCommit: 'a'.repeat(40),
      });
      assert.deepEqual(readAcknowledgmentArchive(archive).sha256, d.sha256);
      assert(d.lines.some((line) => line.includes('123456Z')));
      const manifestPath = archive + '.manifest.json';
      const manifest = fs.readFileSync(manifestPath, 'utf8');
      for (const change of [{ rowCount: 99 }, { sha256: '0'.repeat(64) }]) {
        fs.writeFileSync(
          manifestPath,
          JSON.stringify({ ...JSON.parse(manifest), ...change }),
        );
        await socket(db, (raw) =>
          assert.rejects(
            migrateReportAcknowledgmentsContraction(raw, archive),
            /manifest count\/checksum/,
          ),
        );
        assert.equal(await snapshot(db), before);
      }
      fs.writeFileSync(manifestPath, manifest);
      for (const [name, lines] of [
        ['stale-count', d.lines.slice(1)],
        [
          'stale-bytes',
          d.lines.map((line) =>
            line.replace('Private remark', 'Changed remark'),
          ),
        ],
      ]) {
        const stalePath = path.join(temp, name + '.jsonl');
        writeAcknowledgmentArchive(stalePath, lines, {
          createdAt: new Date().toISOString(),
          gitCommit: 'a'.repeat(40),
        });
        await socket(db, (raw) =>
          assert.rejects(
            migrateReportAcknowledgmentsContraction(raw, stalePath),
            /archive count\/checksum mismatch/,
          ),
        );
        assert.equal(await snapshot(db), before);
      }
      ok(
        'valid but stale archives abort in the runner under the live-table lock',
      );
      await socket(db, (raw) =>
        migrateReportAcknowledgmentsContraction(raw, archive),
      );
      ok(
        'private fixture JSONL/manifest round-trip retains microseconds; invalid files rejected; runner accepts matching archive',
      );
      await db.exec('CREATE SEQUENCE report_acknowledgments_id_seq');
      const mixed = await snapshot(db);
      await assert.rejects(
        apply(db, ACK_CONTRACTION_SQL),
        /mixed contracted state/,
      );
      assert.equal(await snapshot(db), mixed);
      ok('mixed state with orphaned legacy sequence aborts unchanged');
    } finally {
      await db.close();
    }
  }
  {
    const db = await history(false);
    try {
      await contract(db);
      await db.exec(
        'ALTER TABLE acknowledgments ALTER COLUMN acknowledged_at SET DEFAULT clock_timestamp()',
      );
      const malformed = await snapshot(db);
      await assert.rejects(
        apply(db, ACK_CONTRACTION_SQL),
        /column\/type\/nullability\/default mismatch/,
      );
      assert.equal(await snapshot(db), malformed);
      ok(
        'final-state rerun rejects a malformed canonical table without changes',
      );
      await db.exec('DROP TABLE acknowledgments RESTRICT');
      const before = await snapshot(db);
      await socket(db, async (raw) => {
        await assert.rejects(
          migrateReportAcknowledgments(raw),
          /refusing to recreate/,
        );
        await assert.rejects(
          migrateTicketAcknowledgments(raw),
          /source is missing/,
        );
      });
      assert.equal(await snapshot(db), before);
      ok(
        'both acknowledgment tables missing after upgrade: old runners refuse to recreate history',
      );
    } finally {
      await db.close();
    }
  }
  await serviceChecks();
  console.log(
    `${checks} ticket acknowledgment contraction PGlite groups passed`,
  );
}
async function serviceChecks() {
  for (const contracted of [false, true]) {
    const memory = await history();
    try {
      if (contracted) await contract(memory);
      await memory.exec(`
        CREATE TABLE citizens(id text PRIMARY KEY,first_name text,last_name text,email text);
        INSERT INTO citizens VALUES('1','Citizen','Fixture','fixture@test');
        ALTER TABLE reports ADD COLUMN tracking_reference text DEFAULT 'PRC-FIXTURE',ADD COLUMN pin_geom text DEFAULT 'fixture',
          ADD COLUMN submitted_category text DEFAULT 'Localized Flooding',ADD COLUMN severity_screening_status text DEFAULT 'NOT_REVIEWED',
          ADD COLUMN severity_screened_at timestamptz,ADD COLUMN severity_screening_remarks text,ADD COLUMN severity_screened_by_admin_id int,
          ADD COLUMN moderation_status text DEFAULT 'visible',ADD COLUMN moderated_at timestamptz;
        ALTER TABLE tickets ADD COLUMN geom text DEFAULT 'fixture',ADD COLUMN resolution_notes text,ADD COLUMN resolution_image_url text;
        ALTER TABLE status_history ADD COLUMN from_status text;
        CREATE TABLE resolution_feedback(id serial PRIMARY KEY,ticket_id int,citizen_id text,feedback_type text,reason text,created_at timestamptz);
        CREATE TABLE routing_actions(id serial PRIMARY KEY,ticket_id int,action_type text,referral_target text,created_at timestamptz);
        CREATE FUNCTION st_y(text) RETURNS float8 LANGUAGE SQL IMMUTABLE AS 'SELECT 15.0::float8';
        CREATE FUNCTION st_x(text) RETURNS float8 LANGUAGE SQL IMMUTABLE AS 'SELECT 120.5::float8';
        UPDATE reports SET citizen_id='1';
        UPDATE tickets SET created_at=now()-interval '100 hours';
        INSERT INTO acknowledgments(ticket_id,acknowledged_by_admin_id,acknowledged_at) VALUES
          (15,5,now()-interval '99 hours'),(16,5,now()-interval '97 hours'),(17,5,now()-interval '1 hour');
        UPDATE tickets SET created_at=now() WHERE id=17;
        INSERT INTO reports(id,ticket_id,citizen_id,title,citizen_severity,image_url,created_at) VALUES
          (100,18,'1','Acknowledge first','High','fixture',now()-interval '1 hour'),
          (101,18,'1','Same ticket','High','fixture',now()-interval '30 minutes'),
          (102,19,'1','Concurrent A','High','fixture',now()-interval '1 hour'),
          (103,19,'1','Concurrent B','High','fixture',now()-interval '1 hour');
      `);
      await socket(memory, async (raw, db) => {
        const pg = db.session.client;
        const notifications = new NotificationsService(db);
        const audit = new AdminAuditService(db);
        const intake = new FocalIntakeService(pg, {}, notifications, audit);
        const dashboard = new FocalDashboardService(pg);
        const citizen = new ReportsService(
          pg,
          {},
          {},
          {},
          {},
          notifications,
          {},
        );
        const focal = {
          adminId: 5,
          adminName: 'Focal Staff',
          email: 'focal@test',
          accountType: 'PERSONNEL',
          isFocal: true,
          office: 'MDRRMO',
        };
        const rows = await intake.listIntake();
        const late = rows.find((r) => r.reportId === 4);
        assert.equal(late.intakeState, 'Acknowledged');
        assert.equal(late.acknowledgedByName, 'Focal Staff');
        assert.equal(
          (await intake.listIntakeGeo()).find((r) => r.reportId === 4)
            .intakeState,
          'Acknowledged',
        );
        assert.equal(
          (await intake.getIntakeDetail(4)).intakeState,
          'Acknowledged',
        );
        let count = await dashboard.counts(focal);
        assert.equal(count.unacknowledged, 4); // Four new action fixtures; even later reports inherit ticket acknowledgments.
        assert.equal(count.needsScreening, 10);
        assert.equal(count.medianAcknowledgmentHours30d, 2); // per ticket, not multiplied by report count.
        const first = await dashboard.reports(focal, '1', '3');
        const second = await dashboard.reports(focal, '2', '3');
        assert.equal(first.total, 10);
        assert.equal(
          new Set([...first.items, ...second.items].map((r) => r.reportId))
            .size,
          6,
        );
        assert.equal(
          (await dashboard.reports(focal, '1', '50')).items.find(
            (r) => r.reportId === 4,
          ).intakeState,
          'Acknowledged',
        );
        ok(
          `real Focal list/map/detail/counts/paging inherit ticket acknowledgment on ${contracted ? 'post' : 'pre'}-0050, including later reports; median is per ticket`,
        );
        const lateCitizen = await citizen.getMyReportDetail('1', 4);
        assert.equal(
          lateCitizen.report.acknowledged_at,
          null,
          'ack predating report is hidden from citizen',
        );
        assert.equal(await citizen.getMyReportDetail('other', 4), null);
        const merged = await citizen.getMyReportDetail('1', 6);
        assert.equal(
          new Date(merged.report.acknowledged_at).toISOString(),
          '2025-02-02T00:00:00.123Z',
        );
        assert.equal(merged.report.is_merged, true);
        // Remove survivor ack: the recorded old ticket is still eligible for merge history.
        const ackBefore = JSON.stringify(
          await pg`SELECT * FROM acknowledgments WHERE ticket_id=3`,
        );
        await pg`DELETE FROM acknowledgments WHERE ticket_id=1`;
        const sourceOnly = await citizen.getMyReportDetail('1', 6);
        assert.equal(
          new Date(sourceOnly.report.acknowledged_at).toISOString(),
          '2025-02-03T00:00:00.000Z',
        );
        // A later merge for this report must win over the earlier old-ticket id.
        await pg`INSERT INTO acknowledgments(ticket_id,acknowledged_by_admin_id,acknowledged_at) VALUES(4,5,'2025-02-05')`;
        await audit.logInPgTx(pg, {
          actor: focal,
          actionType: 'ticket_merged',
          targetType: 'ticket',
          targetId: 1,
          targetSummary: 'Fixture',
          metadata: { mergedTicketId: 4, movedReportIds: [6] },
        });
        assert.equal(
          new Date(
            (await citizen.getMyReportDetail('1', 6)).report.acknowledged_at,
          ).toISOString(),
          '2025-02-05T00:00:00.000Z',
        );
        // Simulate the memberships produced by remove/regroup. Neither operation carries an acknowledgment.
        await pg`UPDATE reports SET ticket_id=20 WHERE id=6`;
        assert.equal((await intake.getIntakeDetail(6)).intakeState, 'New');
        assert.equal(
          (await citizen.getMyReportDetail('1', 6)).report.acknowledged_at,
          null,
        );
        await pg`UPDATE reports SET ticket_id=2 WHERE id=6`;
        assert.equal(
          (await intake.getIntakeDetail(6)).intakeState,
          'Acknowledged',
        );
        assert.equal(
          new Date(
            (await citizen.getMyReportDetail('1', 6)).report.acknowledged_at,
          ).toISOString(),
          '2025-02-02T00:00:00.000Z',
        );
        assert.equal(
          JSON.stringify(
            await pg`SELECT * FROM acknowledgments WHERE ticket_id=3`,
          ),
          ackBefore,
        );
        assert.deepEqual(
          Object.keys((await citizen.getMyReportDetail('1', 6)).report).sort(),
          Object.keys(lateCitizen.report).sort(),
        );
        assert(!JSON.stringify(lateCitizen).includes('Historical Focal'));
        ok(
          `citizen response keys/private fields unchanged; pre-submission, latest merge, remove and regroup behavior on ${contracted ? 'post' : 'pre'}-0050`,
        );
        const auditCount = Number(
          (await pg`SELECT count(*) n FROM admin_audit_events`)[0].n,
        );
        const firstAck = await intake.acknowledge(
          100,
          focal,
          'Internal fixture remark',
        );
        assert.equal(firstAck.intakeState, 'Acknowledged');
        await assert.rejects(
          intake.acknowledge(101, focal, 'Duplicate'),
          /This report has already been acknowledged/,
        );
        assert.equal(
          Number((await pg`SELECT count(*) n FROM admin_audit_events`)[0].n),
          auditCount + 1,
        );
        assert.equal(
          Number(
            (
              await pg`SELECT count(*) n FROM notifications WHERE type='ticket_acknowledged' AND entity_id=100`
            )[0].n,
          ),
          1,
        );
        // PGlite socket has one backend; simultaneous service calls queue transactions.
        const attempts = await Promise.allSettled([
          intake.acknowledge(102, focal),
          intake.acknowledge(103, focal),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === 'fulfilled').length,
          1,
        );
        assert.equal(attempts.filter((r) => r.status === 'rejected').length, 1);
        assert.equal(
          Number(
            (
              await pg`SELECT count(*) n FROM admin_audit_events WHERE action_type='report_acknowledged'`
            )[0].n,
          ),
          2,
        );
        assert.equal(
          Number(
            (
              await pg`SELECT count(*) n FROM notifications WHERE type='ticket_acknowledged' AND entity_id=102`
            )[0].n,
          ),
          1,
        );
        assert.equal(
          Number(
            (
              await pg`SELECT count(*) n FROM acknowledgments WHERE ticket_id IN(18,19)`
            )[0].n,
          ),
          2,
        );
        ok(
          `real first/repeat/concurrent acknowledgment emits exactly one audit and notice per ticket on ${contracted ? 'post' : 'pre'}-0050`,
        );
        if (contracted) {
          // A stale read mutation is rejected by the same real post-contraction database.
          const Module = require('node:module');
          const ts = require('typescript');
          const filename = path.resolve(
            __dirname,
            '../src/admin/focal-intake.service.ts',
          );
          const mutantSource = fs
            .readFileSync(filename, 'utf8')
            .replaceAll(
              'LEFT JOIN acknowledgments ta ON ta.ticket_id = t.id',
              'LEFT JOIN report_acknowledgments ta ON ta.report_id = r.id',
            );
          const mutant = new Module(filename, module);
          mutant.filename = filename;
          mutant.paths = Module._nodeModulePaths(path.dirname(filename));
          mutant._compile(
            ts.transpileModule(mutantSource, {
              compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
              },
            }).outputText,
            filename,
          );
          const stale = new mutant.exports.FocalIntakeService(
            pg,
            {},
            notifications,
            audit,
          );
          await assert.rejects(stale.listIntake(), /does not exist/);
          ok(
            'mutation: stale report-level reader fails on the contracted schema',
          );
        }
      });
    } finally {
      await memory.close();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
