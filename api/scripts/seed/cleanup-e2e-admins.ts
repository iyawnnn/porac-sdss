import { sql } from '../db';
import { retireE2EAdmins } from '../lib/retire-e2e-admins';

// Referenced assessment creators are retired, never deleted (0048 FK).
// Demo accounts do not match the e2e- prefix. Audit rows remain untouched.
async function main() {
  try {
    console.log('E2E account cleanup:', await retireE2EAdmins(sql));
  } finally {
    await sql.end();
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
