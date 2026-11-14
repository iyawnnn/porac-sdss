import bcrypt from 'bcryptjs';
import { sql } from '../lib/seed-db';
import {
  E2E_ADMIN_ACCOUNTS,
  assertStaffPasswordConfigured,
} from '../../../e2e/test-credentials';

// Provisions the admin accounts Playwright's global setup (e2e/global-setup.ts)
// and every admin-suite spec log in as. Idempotent by design (ON CONFLICT
// upsert on the unique `email` column, not a plain insert like seed-admin.ts's
// generic CLI) so it is safe to run on every test invocation without erroring
// on a duplicate or leaving stale accounts on a shared dev database.
//
// This is separate from seed-admin.ts (which stays a manual, arg-driven CLI
// for provisioning a *real* admin) so production databases are never expected
// to contain these demo credentials.
async function main() {
  assertStaffPasswordConfigured();
  for (const account of E2E_ADMIN_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    await sql`
      INSERT INTO admins (first_name, last_name, email, password_hash, office, account_type, is_focal, role)
      VALUES (
        ${account.firstName}, ${account.lastName}, ${account.email}, ${passwordHash}, ${account.office}::office,
        ${account.accountType}::admin_account_type, ${account.isFocal}, ${account.role}::admin_role
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        office = EXCLUDED.office,
        account_type = EXCLUDED.account_type,
        is_focal = EXCLUDED.is_focal,
        role = EXCLUDED.role,
        is_active = true
    `;
    console.log(`Seeded E2E admin: ${account.email} (${account.office})`);
  }

  const [{ count: ticketCount }] = await sql<
    { count: string }[]
  >`SELECT count(*)::text AS count FROM tickets`;
  if (Number(ticketCount) === 0) {
    console.warn(
      '\n[seed-e2e-admins] No tickets found — Playwright specs that assert on real ticket/report ' +
        'data (admin-flagged, admin-dashboard, smoke) will fail their data assertions. Run ' +
        '`pnpm --prefix api seed:demo-presentation` once on an empty disposable target ' +
        'to populate the 15-report demo (an existing dataset is refused).\n',
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
