import { sql } from '../lib/seed-db';
import {
  lockE2EStaffAccounts,
  retireE2EAdmins,
} from '../lib/retire-e2e-admins';
import { E2E_ADMIN_ACCOUNTS } from '../../../e2e/test-credentials';

// Referenced assessment creators are retired, never deleted (0048 FK).
// Demo staff accounts do not match the e2e- prefix; they are locked instead
// (IAN-26). Audit rows remain untouched.
async function main() {
  try {
    console.log('E2E account cleanup:', {
      ...(await retireE2EAdmins(sql)),
      lockedStaff: await lockE2EStaffAccounts(
        sql,
        E2E_ADMIN_ACCOUNTS.map((a) => a.email),
      ),
    });
  } finally {
    await sql.end();
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
