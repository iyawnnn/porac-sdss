import type { TransactionSql } from 'postgres';

// Insert-only fixtures; the existing retirement path owns later status changes.
export async function insertDashboardMetricFixtures(tx: TransactionSql) {
  const result = [];
  for (const office of ['MEO', 'MDRRMO'] as const) {
    const [staff] = await tx<{ id: number; name: string }[]>`
      SELECT id, first_name || ' ' || last_name AS name FROM admins
      WHERE office=${office}::office AND account_type='PERSONNEL' AND NOT is_focal AND is_active ORDER BY id LIMIT 1
    `;
    const [citizen] = await tx<
      { id: number }[]
    >`SELECT id FROM citizens WHERE email='citizen1@porac.ph'`;
    if (!staff || !citizen)
      throw new Error('Dashboard fixtures require demo accounts.');
    const ids: number[] = [];
    for (let index = 0; index < 8; index++) {
      const status =
        index < 3 || index === 7
          ? 'Reported'
          : index < 6
            ? 'Resolved'
            : 'Rejected';
      const outcome =
        index === 3
          ? 'MUNICIPAL_ACTION_COMPLETED'
          : index === 4
            ? 'EXTERNAL_REFERRAL'
            : null;
      const [ticket] = await tx<{ id: number; barangay_id: number }[]>`
        INSERT INTO tickets(category,barangay_id,member_count,assigned_office,initial_assigned_office,status,geom,
          created_at,merged_into_ticket_id,resolution_outcome,resolved_at,resolved_by_admin_id,resolution_notes)
        SELECT 'Localized Flooding',barangay_id,1,${office}::office,${office}::office,${status}::ticket_status,geom,
          now()-interval '4 days',${index === 7 ? ids[0] : null},${outcome},
          CASE WHEN ${outcome}::text IS NOT NULL THEN now()-interval '1 day' END,
          ${outcome ? staff.id : null},${outcome ? 'E2E metrics resolution' : null}
        FROM tickets WHERE merged_into_ticket_id IS NULL ORDER BY id LIMIT 1 RETURNING id,barangay_id
      `;
      if (!ticket)
        throw new Error('Dashboard fixture needs an existing location.');
      ids.push(ticket.id);
      await tx`
        INSERT INTO reports(ticket_id,citizen_id,title,description,citizen_severity,submitted_category,geom,pin_geom,created_at)
        SELECT id,${citizen.id},${`E2E dashboard metrics fixture ${office} ${ticket.id}`},'Fixture','High',category,geom,geom,created_at
        FROM tickets WHERE id=${ticket.id}
      `;
      if (status !== 'Reported')
        await tx`
        INSERT INTO status_history(ticket_id,status,admin_id,admin_name,changed_at,resolution_outcome,resolution_notes)
        VALUES (${ticket.id},${status}::ticket_status,${staff.id},${staff.name},now()-interval '1 day',${outcome},${outcome ? 'E2E metrics resolution' : null})
      `;
      if (index === 0)
        await tx`
        INSERT INTO acknowledgments(ticket_id,acknowledged_by_admin_id,acknowledged_at)
        VALUES (${ticket.id},${staff.id},now()-interval '3 days')
      `;
      if (index < 2)
        await tx`
        INSERT INTO hazard_information(ticket_id,hazard_context_type,lookup_status,susceptibility_code,susceptibility_label,
          query_geom,looked_up_at)
        SELECT id,'FLOOD',${index === 0 ? 'CLASSIFIED' : 'NO_CLASSIFICATION'}::hazard_lookup_status,
          ${index === 0 ? 'MF' : null},${index === 0 ? 'Moderate' : null},geom,now() FROM tickets WHERE id=${ticket.id}
      `;
    }
    result.push({ office, ticketIds: ids });
  }
  return result;
}
