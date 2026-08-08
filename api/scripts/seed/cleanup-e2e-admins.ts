import { sql } from "../db";

// Deletes throwaway admin accounts created by Playwright specs
// (e2e/admin-management.spec.ts, e2e/admin-password.spec.ts,
// e2e/admin-activity-log.spec.ts) on prior test runs. Every such account is
// created with an email starting "e2e-" at @porac.gov.ph — a convention
// those specs already follow; keep any future throwaway-admin test on the
// same convention so it gets cleaned up here too.
//
// admins.id has no FK references from any other table (status_history,
// office_reassignments, work_orders, admin_audit_events all store
// actor/assignee admin ids as FK-less snapshot columns, by existing
// design), so this is a safe plain DELETE — no cascade risk, no orphaned
// rows. Never matches the three real seeded demo admins (sysadmin@/meo@/
// mdrrmo@porac.gov.ph), which don't use the "e2e-" prefix.
//
// Run before seed-e2e-admins.ts in e2e/global-setup.ts so every fresh
// Playwright invocation starts from a bounded admin count instead of
// accumulating rows (and rendering time on /admin/admins) run over run.
async function main() {
  const deleted = await sql`
    DELETE FROM admins WHERE email LIKE 'e2e-%@porac.gov.ph'
  `;
  console.log(`Deleted ${deleted.count} throwaway E2E admin account(s).`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
