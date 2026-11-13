import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Sql } from 'postgres';

// Keep assessment creators addressable by the restrictive FK. Other history
// remains FK-less snapshots, and no historical audit event is touched here.
export async function retireE2EAdmins(sql: Sql) {
  return sql.begin(async (tx) => {
    const retired = await tx`
      UPDATE admins a SET is_active=false, session_valid_after=now()
      WHERE a.email LIKE 'e2e-%@porac.gov.ph' AND a.is_active
        AND EXISTS (SELECT 1 FROM operational_assessments s WHERE s.assessed_by_admin_id=a.id)
    `;
    const deleted = await tx`
      DELETE FROM admins a WHERE a.email LIKE 'e2e-%@porac.gov.ph'
        AND NOT EXISTS (SELECT 1 FROM operational_assessments s WHERE s.assessed_by_admin_id=a.id)
    `;
    return { retired: retired.count, deleted: deleted.count };
  });
}

// IAN-26: after a run the shared staff E2E accounts get an unknowable hash
// and session_valid_after = now(), so neither the run's password nor any
// session issued during it keeps working. seed:e2e-admins (global setup)
// restores them from the private E2E_ADMIN_PASSWORD on the next run, which is
// also the owner's recovery path for these accounts.
export async function lockE2EStaffAccounts(sql: Sql, emails: string[]) {
  const unusable = await bcrypt.hash(randomBytes(32).toString('base64url'), 10);
  const locked = await sql`
    UPDATE admins SET password_hash=${unusable}, session_valid_after=now()
    WHERE email IN ${sql(emails)}
  `;
  return locked.count;
}
