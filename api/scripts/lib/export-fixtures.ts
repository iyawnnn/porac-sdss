import type { TransactionSql } from 'postgres';

// Insert-only export fixtures, retained across runs. Tests narrow by these
// report ids, never by a shared first row or an audit total.
export async function insertExportFixtures(tx: TransactionSql) {
  const [citizen] = await tx<{ id: number; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name FROM citizens
    WHERE email = 'citizen1@porac.ph'
  `;
  if (!citizen) throw new Error('Export fixture citizen is missing.');
  const result = [];
  for (const office of ['MEO', 'MDRRMO'] as const) {
    const [ticket] = await tx<{ id: number }[]>`
      INSERT INTO tickets (category, barangay_id, member_count, assigned_office, initial_assigned_office, status, geom)
      SELECT 'Pothole / Road Surface Damage', barangay_id, 1, ${office}::office, ${office}::office, 'Reported', geom
      FROM tickets WHERE merged_into_ticket_id IS NULL ORDER BY id DESC LIMIT 1
      RETURNING id
    `;
    if (!ticket)
      throw new Error('Export fixture needs an existing ticket location.');
    const title = `E2E export private title ${office} ${ticket.id}`;
    const [report] = await tx<{ id: number; tracking_reference: string }[]>`
      INSERT INTO reports (ticket_id, citizen_id, title, description, citizen_severity, image_url, submitted_category, geom, pin_geom, flags)
      SELECT id, ${citizen.id}, ${title}, 'Private export fixture description', 'Medium',
        '/uploads/reports/01_poblacion.jpg', category, geom, geom, ARRAY['MISSING_METADATA']::text[]
      FROM tickets WHERE id = ${ticket.id} RETURNING id, tracking_reference
    `;
    result.push({
      office,
      ticketId: ticket.id,
      reportId: report.id,
      trackingReference: report.tracking_reference,
      title,
      citizenName: citizen.name,
    });
  }
  return result;
}
