// Disposable database only. No .env, provider, migration or seed runner.
// PGLITE_MODULE_ROOT points to a separate npm project with @electric-sql/pglite
// and @electric-sql/pglite-socket installed. Build the API before running.
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
const { TicketsService } = require('../dist/admin/tickets.service');
const { FocalIntakeService } = require('../dist/admin/focal-intake.service');
const {
  TicketCorrectionsService,
} = require('../dist/admin/ticket-corrections.service');
const { ReportsService } = require('../dist/reports/reports.service');
const {
  NotificationsService,
} = require('../dist/notifications/notifications.service');
const { AdminAuditService } = require('../dist/admin/admin-audit.service');
const {
  notifyTicketCitizens,
  BACK_UNDER_REVIEW,
} = require('../dist/notifications/citizen-notices');

function guardDates(client) {
  return new Proxy(client, {
    apply(target, self, args) {
      assert(
        !args.slice(1).some((value) => value instanceof Date),
        'raw SQL received a JS Date',
      );
      return Reflect.apply(target, self, args);
    },
    get(target, key) {
      if (key === 'begin' || key === 'savepoint') {
        return (cb) => target[key]((tx) => cb(guardDates(tx)));
      }
      return Reflect.get(target, key);
    },
  });
}

async function main() {
  const memory = new PGlite();
  // Minimal non-spatial fixture schema for the real services' write paths.
  // Geometry readers used only to choose a category have constant fixture
  // coordinates; scoring/weather/media are stubbed, notification/audit SQL is real.
  await memory.exec(`
    CREATE TYPE resolution_outcome AS ENUM ('MUNICIPAL_ACTION_COMPLETED', 'EXTERNAL_REFERRAL');
    CREATE TABLE citizens (id serial PRIMARY KEY, email text NOT NULL);
    CREATE TABLE admins (id int PRIMARY KEY, role text);
    CREATE TABLE barangays (id int PRIMARY KEY, name text);
    CREATE TABLE tickets (id int PRIMARY KEY, category text, status text, assigned_office text,
      barangay_id int DEFAULT 1, geom text DEFAULT '', category_review_required boolean DEFAULT false,
      merged_into_ticket_id int, resolution_outcome resolution_outcome, resolution_notes text,
      resolution_image_url text, resolved_at timestamptz, resolved_by_admin_id int,
      disputed_at timestamptz, dispute_reason text, resolution_confirmed_at timestamptz,
      updated_at timestamptz DEFAULT now());
    CREATE FUNCTION st_y(text) RETURNS float8 LANGUAGE SQL IMMUTABLE AS 'SELECT 15.0::float8';
    CREATE FUNCTION st_x(text) RETURNS float8 LANGUAGE SQL IMMUTABLE AS 'SELECT 120.5::float8';
    CREATE TABLE reports (id int PRIMARY KEY, ticket_id int, citizen_id int, title text, created_at timestamptz DEFAULT now());
    CREATE TABLE work_orders (id int PRIMARY KEY, ticket_id int, status text);
    CREATE TABLE routing_actions (id serial PRIMARY KEY, ticket_id int, action_type text, from_office text,
      to_office text, referral_target text, reason text, admin_id int, admin_name text, created_at timestamptz DEFAULT now());
    CREATE TABLE office_reassignments (id serial PRIMARY KEY, ticket_id int, from_office text, to_office text, admin_id int, admin_name text);
    CREATE TABLE status_history (id serial PRIMARY KEY, ticket_id int, status text, from_status text, reason text,
      admin_id int, admin_name text, changed_at timestamptz, resolution_outcome resolution_outcome,
      resolution_notes text, resolution_image_url text);
    CREATE TABLE report_acknowledgments (report_id int UNIQUE, acknowledged_by_admin_id int, acknowledged_by_name text, remarks text);
    CREATE TABLE acknowledgments (ticket_id int UNIQUE, acknowledged_by_admin_id int, remarks text, acknowledged_at timestamptz);
    CREATE TABLE resolution_feedback (ticket_id int, citizen_id int, feedback_type text, reason text,
      created_at timestamptz DEFAULT now(), UNIQUE(ticket_id, citizen_id));
    CREATE TABLE notifications (id serial PRIMARY KEY, recipient_type text, recipient_id int, recipient_office text,
      type text, title text, message text, href text, entity_type text, entity_id int, read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE admin_audit_events (id serial PRIMARY KEY, actor_admin_id int, actor_name text, actor_email text,
      actor_role text, actor_account_type text, actor_office text, action_type text, target_type text,
      target_id int, target_summary text, metadata jsonb);
    INSERT INTO citizens VALUES (1, 'a@example.test'), (2, 'b@example.test'), (3, 'ancestor@example.test');
    INSERT INTO admins VALUES (1, 'officer');
    INSERT INTO barangays VALUES (1, 'Fixture barangay');
    INSERT INTO tickets (id, category, status, assigned_office) VALUES
      (1, 'Localized Flooding', 'Reported', 'MEO'), (2, 'Localized Flooding', 'Reported', 'MEO'),
      (3, 'Localized Flooding', 'Reported', 'MEO');
    UPDATE tickets SET merged_into_ticket_id = 1 WHERE id = 2;
    INSERT INTO reports (id, ticket_id, citizen_id, title) VALUES
      (11,1,1,'First'),(12,1,1,'Second by same citizen'),(13,1,2,'Other reporter'),
      (14,1,99,'Deleted account'),(21,2,3,'Ancestor report'),(31,3,1,'Failure fixture');
  `);
  const server = new PGLiteSocketServer({
    db: memory,
    port: 0,
    host: '127.0.0.1',
  });
  await server.start();
  const raw = postgres(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    { max: 1 },
  );
  const pg = guardDates(raw);
  const db = drizzle(pg); // Same client wrapping and parameter serialization as DbModule.
  const notifications = new NotificationsService(db);
  const audit = new AdminAuditService(db);
  const admin = {
    adminId: 1,
    adminName: 'SECRET STAFF NAME',
    email: 'staff@example.test',
    accountType: 'PERSONNEL',
    isFocal: false,
    office: 'MEO',
  };
  const focalAdmin = { ...admin, isFocal: true, office: 'MDRRMO' };
  const priority = {
    recalculateTickets: async () => ({}),
    recalculateActiveTickets: async () => ({}),
  };
  const sent = [];
  const email = {
    sendReportResolved: async (...args) => sent.push(args),
    sendReportRejected: async (...args) => sent.push(args),
  };
  const tickets = new TicketsService(
    pg,
    {},
    notifications,
    email,
    { get: () => 'https://example.test' },
    audit,
    priority,
  );
  const focal = new FocalIntakeService(pg, tickets, notifications, audit);
  focal.getIntakeDetail = async () => null;
  const reports = new ReportsService(
    pg,
    {},
    {},
    {},
    priority,
    notifications,
    {},
  );
  const corrections = new TicketCorrectionsService(
    pg,
    tickets,
    {},
    priority,
    audit,
    { trigger() {} },
    { triggerForCorrection() {} },
  );
  let checks = 0;
  async function notices(
    type,
    text,
    recipients = [1, 2],
    hrefs = ['/dashboard/reports/11', '/dashboard/reports/13'],
  ) {
    const rows =
      await pg`SELECT * FROM notifications WHERE type = ${type} ORDER BY id`;
    assert.deepEqual(
      rows.map((r) => r.recipient_id),
      recipients,
      `${type}: distinct recipients`,
    );
    assert.deepEqual(
      rows.map((r) => r.href),
      hrefs,
    );
    for (const row of rows) {
      assert.equal(row.message, text);
      assert(
        !/SECRET|staff-only|reason|remarks|resolution_notes|Work Order|rainfall|assessment|screening|Hazard Information/.test(
          row.message,
        ),
      );
    }
    checks++;
  }
  try {
    await tickets.reassignOffice(1, admin, 'MDRRMO', 'SECRET routing reason');
    await notices(
      'ticket_reassigned',
      'Your report has been routed to the Municipal Disaster Risk Reduction and Management Office.',
    );
    await pg`DELETE FROM notifications`;
    await corrections.correctCategory(
      1,
      {
        category: 'Pothole / Road Surface Damage',
        reason: 'SECRET category reason',
      },
      { ...admin, office: 'MDRRMO' },
    );
    await notices(
      'ticket_reassigned',
      'Your report has been routed to the Municipal Engineering Office.',
    );
    await tickets.logReferral(1, admin, 'DPWH', 'SECRET referral reason');
    await notices('ticket_referred', 'Your report has been referred to DPWH.');
    await assert.rejects(
      tickets.logReferral(1, admin, 'DPWH', 'SECRET repeated reason'),
    );
    await pg`DELETE FROM notifications WHERE type = 'ticket_referred'`;
    await tickets.logReferral(
      1,
      admin,
      'SECRET typed agency',
      'SECRET referral reason',
    );
    await notices(
      'ticket_referred',
      'Your report has been referred to an outside agency.',
    );
    await focal.acknowledge(11, focalAdmin, 'SECRET acknowledgment remarks');
    await notices(
      'ticket_acknowledged',
      'Your report has been acknowledged by municipal monitoring.',
    );
    await focal.acknowledge(13, focalAdmin, 'SECRET later remarks');
    await notices(
      'ticket_acknowledged',
      'Your report has been acknowledged by municipal monitoring.',
    );
    await assert.rejects(focal.acknowledge(11, focalAdmin, 'SECRET repeat'));
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM notifications WHERE type = 'report_acknowledged'`
      )[0].n,
      0,
    );
    await pg.begin((tx) =>
      notifyTicketCitizens(tx, notifications, 2, BACK_UNDER_REVIEW),
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM notifications WHERE type = 'ticket_returned_to_review'`
      )[0].n,
      0,
    );
    for (const action of [
      () => tickets.reassignOffice(2, admin, 'MDRRMO', 'SECRET'),
      () => tickets.logReferral(2, admin, 'MENRO', 'SECRET'),
      () => focal.acknowledge(21, focalAdmin, 'SECRET'),
    ])
      await assert.rejects(action());
    checks++;
    await tickets.advanceStatus(1, admin, null, undefined);
    await tickets.advanceStatus(1, admin, null, undefined);
    await tickets.advanceStatus(
      1,
      admin,
      'SECRET resolution notes',
      undefined,
      'EXTERNAL_REFERRAL',
    );
    await notices(
      'ticket_resolved',
      "Your report has been referred to an outside agency. The municipality's handling is complete. The agency may not have resolved the issue yet.",
    );
    assert.deepEqual(
      sent.map((r) => r[2]),
      ['REFERRED_OUTSIDE', 'REFERRED_OUTSIDE'],
    );
    await tickets.returnToReview(1, admin, 'SECRET return reason');
    await notices(
      'ticket_returned_to_review',
      'Your report is back under review by the assigned office.',
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM notifications WHERE type = 'ticket_under_review'`
      )[0].n,
      2,
      'no duplicate ladder notice on return',
    );
    await tickets.advanceStatus(1, admin, null, undefined);
    await pg`DELETE FROM notifications WHERE type = 'ticket_resolved'`;
    await tickets.advanceStatus(
      1,
      admin,
      'SECRET municipal notes',
      undefined,
      'MUNICIPAL_ACTION_COMPLETED',
    );
    await notices(
      'ticket_resolved',
      'Your report has been handled by the municipality.',
    );
    assert.deepEqual(
      sent.slice(-2).map((r) => r[2]),
      ['HANDLED_BY_MUNICIPALITY', 'HANDLED_BY_MUNICIPALITY'],
    );
    await reports.confirmResolution(1, 11);
    await notices(
      'resolution_feedback_received',
      'Thank you. Your feedback was received.',
      [1],
      ['/dashboard/reports/11'],
    );
    await assert.rejects(reports.confirmResolution(1, 12));
    await reports.disputeReport(2, 13, 'SECRET citizen dispute');
    await notices(
      'resolution_feedback_received',
      'Thank you. Your feedback was received.',
    );
    await reports.confirmResolution(3, 21); // 3g's ancestor-owner rule is unchanged.
    assert.equal(
      (
        await pg`SELECT href FROM notifications WHERE recipient_id = 3 AND type = 'resolution_feedback_received'`
      )[0].href,
      '/dashboard/reports/21',
    );
    checks++;
    const listed = await notifications.listForPrincipal(
      { type: 'citizen', citizenId: 1 },
      { limit: 100 },
    );
    for (const item of listed.items) {
      assert.deepEqual(Object.keys(item).sort(), [
        'createdAt',
        'href',
        'id',
        'message',
        'readAt',
        'title',
        'type',
      ]);
      assert.equal(item.href, '/dashboard/reports/11');
    }
    // Legacy rows can carry a ticket entity id or an invalid href. Neither
    // is allowed to turn into a citizen probing link.
    await notifications.create({
      recipientType: 'citizen',
      recipientId: 1,
      type: 'legacy',
      title: 'Old',
      message: 'Old',
      href: '/dashboard/reports/13',
      entityType: 'ticket',
      entityId: 999,
    });
    assert.equal(
      (await notifications.listForPrincipal({ type: 'citizen', citizenId: 1 }))
        .items[0].href,
      null,
    );
    checks++;
    await pg`ALTER TABLE notifications ADD CONSTRAINT fail_delivery CHECK (type <> 'ticket_reassigned') NOT VALID`;
    await tickets.reassignOffice(
      3,
      admin,
      'MDRRMO',
      'SECRET notification failure',
    );
    assert.equal(
      (await pg`SELECT assigned_office FROM tickets WHERE id = 3`)[0]
        .assigned_office,
      'MDRRMO',
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM admin_audit_events WHERE target_id = 3`
      )[0].n,
      1,
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM routing_actions WHERE ticket_id = 3`
      )[0].n,
      1,
    );
    await pg`ALTER TABLE notifications DROP CONSTRAINT fail_delivery`;
    await pg`INSERT INTO tickets (id, category, status, assigned_office) VALUES (4, 'Localized Flooding', 'Reported', 'MEO')`;
    await pg`INSERT INTO reports (id, ticket_id, citizen_id, title) VALUES (41,4,1,'Failure A'),(42,4,2,'Failure B')`;
    await pg`ALTER TABLE notifications ADD CONSTRAINT fail_second_recipient CHECK (type <> 'ticket_referred' OR recipient_id <> 2) NOT VALID`;
    await tickets.logReferral(
      4,
      admin,
      'DPWH',
      'SECRET partial fan-out failure',
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM notifications WHERE href IN ('/dashboard/reports/41','/dashboard/reports/42')`
      )[0].n,
      0,
      'savepoint rolls back the whole fan-out',
    );
    await pg`ALTER TABLE notifications DROP CONSTRAINT fail_second_recipient`;
    await pg`ALTER TABLE notifications ADD CONSTRAINT fail_all_delivery CHECK (false) NOT VALID`;
    await focal.acknowledge(41, focalAdmin, 'SECRET acknowledgment failure');
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM acknowledgments WHERE ticket_id = 4`
      )[0].n,
      1,
    );
    await tickets.advanceStatus(4, admin, null, undefined);
    await tickets.advanceStatus(4, admin, null, undefined);
    await tickets.advanceStatus(
      4,
      admin,
      'SECRET failed resolved notice',
      undefined,
      'EXTERNAL_REFERRAL',
    );
    await tickets.returnToReview(4, admin, 'SECRET failed return notice');
    assert.equal(
      (await pg`SELECT status FROM tickets WHERE id = 4`)[0].status,
      'Under Review',
    );
    await tickets.advanceStatus(4, admin, null, undefined);
    await tickets.advanceStatus(
      4,
      admin,
      'SECRET failed resolved notice',
      undefined,
      'MUNICIPAL_ACTION_COMPLETED',
    );
    await reports.confirmResolution(1, 41);
    await reports.disputeReport(2, 42, 'SECRET failed feedback receipt');
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM resolution_feedback WHERE ticket_id = 4`
      )[0].n,
      2,
    );
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM notifications WHERE href IN ('/dashboard/reports/41','/dashboard/reports/42')`
      )[0].n,
      0,
    );
    await pg`ALTER TABLE notifications DROP CONSTRAINT fail_all_delivery`;
    checks += 7;
    await tickets.rejectTicket(
      3,
      { ...admin, office: 'MDRRMO' },
      'Unchanged rejection reason',
    );
    assert.equal(
      (
        await pg`SELECT message FROM notifications WHERE type = 'ticket_rejected'`
      )[0].message,
      'Your report was not accepted: Unchanged rejection reason',
    );
    assert.equal(sent.at(-1)[2], 'Unchanged rejection reason');
    assert.equal(
      (
        await pg`SELECT count(*)::int n FROM admin_audit_events WHERE metadata->>'reason' LIKE 'SECRET%'`
      )[0].n > 0,
      true,
    );
    checks += 2;
    await pg`UPDATE tickets SET resolved_at = NULL, resolution_outcome = NULL WHERE id = 1`;
    await pg`DELETE FROM notifications WHERE type = 'ticket_resolved'`;
    const legacyRecipients = await pg.begin((tx) =>
      tickets.notifyCitizensOfStatus(tx, 1, 'Resolved'),
    );
    await notices('ticket_resolved', 'Your report has been marked resolved.');
    await tickets.sendResolvedEmails(legacyRecipients);
    assert.deepEqual(
      sent.slice(-2).map((r) => r[2]),
      [null, null],
    );
    console.log(
      `PGlite citizen notifications: ${checks} check groups passed (real services, drizzle-wrapped postgres.js; no external email).`,
    );
  } finally {
    await raw.end();
    await server.stop();
    await memory.close();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
