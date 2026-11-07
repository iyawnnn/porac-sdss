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
