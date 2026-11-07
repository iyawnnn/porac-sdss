import type { TransactionSql } from 'postgres';
import { OPERATIONAL_CONSTRAINTS } from '../../src/contracts/schemas';

// Only INSERTs. The existing setup/teardown retires this distinctive prefix
// and clears resolution fields atomically; audit history is never cleaned.
export async function insertNewExportFixtures(tx: TransactionSql) {
  const [citizen] = await tx<{ id: number; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name FROM citizens WHERE email='citizen1@porac.ph'
  `;
  if (!citizen) throw new Error('New export fixture citizen is missing.');
  const result = [];
  for (const office of ['MEO', 'MDRRMO'] as const) {
    const [staff] = await tx<{ id: number; name: string }[]>`
      SELECT id, first_name || ' ' || last_name AS name FROM admins
      WHERE office=${office}::office AND account_type='PERSONNEL' AND NOT is_focal AND is_active
      ORDER BY id LIMIT 1
    `;
    if (!staff) throw new Error('New export fixture needs operational staff.');
    const ticketIds: number[] = [];
    const reportIds: number[] = [];
    const references: string[] = [];
    const statuses = [
      'Reported',
      'In Progress',
      'Resolved',
      'Rejected',
      'Reported',
    ] as const;
    for (const [index, status] of statuses.entries()) {
      const [ticket] = await tx<{ id: number }[]>`
        INSERT INTO tickets (category,barangay_id,member_count,assigned_office,initial_assigned_office,status,geom,
          priority_index,created_at,merged_into_ticket_id,resolution_outcome,resolved_at)
        SELECT 'Pothole / Road Surface Damage',barangay_id,1,${office}::office,${office}::office,${status}::ticket_status,geom,
          90,'2001-01-01T16:00:00.000Z'::timestamptz,${index === 4 ? ticketIds[0] : null},NULL,NULL
        FROM tickets WHERE merged_into_ticket_id IS NULL ORDER BY id DESC LIMIT 1 RETURNING id
      `;
      if (!ticket)
        throw new Error('New export fixture needs an existing location.');
      // Dashboard trends replay history; a non-Reported fixture needs its
      // initial transition just as tickets created by the main fixture helper do.
      if (status !== 'Reported') {
        await tx`
          INSERT INTO status_history (ticket_id,status,admin_id,admin_name,changed_at)
          VALUES (${ticket.id},${status}::ticket_status,${staff.id},${staff.name},
            '2001-01-01T17:00:00.000Z'::timestamptz)
        `;
      }
      const [report] = await tx<{ id: number; tracking_reference: string }[]>`
        INSERT INTO reports (ticket_id,citizen_id,title,description,citizen_severity,image_url,submitted_category,
          geom,pin_geom,flags,created_at)
        SELECT id,${citizen.id},${`E2E reporting fixture ${office} ${ticket.id}`},'PRIVATE_EXPORT_DESCRIPTION','Critical',
          '/uploads/reports/01_poblacion.jpg',category,geom,geom,ARRAY['MISSING_METADATA']::text[],
          '2001-01-01T16:00:00.000Z'::timestamptz FROM tickets WHERE id=${ticket.id}
        RETURNING id,tracking_reference
      `;
      ticketIds.push(ticket.id);
      reportIds.push(report.id);
      references.push(report.tracking_reference);
    }
    const assessedConditions = `E2E reporting fixture ${office} assessed conditions`;
    await tx`
      INSERT INTO operational_assessments (ticket_id,assessed_by_admin_id,assessed_by_name,assessed_conditions,
        safety_implications,operational_constraints,recommended_action,interim_mitigation,
        deferment_or_referral_reason,remarks,actual_action,supporting_evidence_url,created_at,updated_by_admin_id,updated_by_name)
      VALUES (${ticketIds[0]},${staff.id},${staff.name},${assessedConditions},'Fixture safety',
        ${JSON.stringify({ selected: [OPERATIONAL_CONSTRAINTS[0]], notes: { [OPERATIONAL_CONSTRAINTS[0]]: 'Fixture constraint note' } })}::jsonb,
        'Fixture recommended action','Fixture interim mitigation',E'Deferment: Fixture deferment\nReferral: Fixture referral',
        'Fixture assessment remarks','Fixture actual action','https://example.test/staff-evidence',
        '2001-01-01T16:00:00.000Z'::timestamptz,${staff.id},${staff.name})
    `;
    for (const status of [
      'pending',
      'in_progress',
      'completed',
      'cancelled',
    ] as const) {
      const [workOrder] = await tx<{ id: number }[]>`
        INSERT INTO work_orders (ticket_id,title,notes,assigned_office,status,created_by_admin_id,
          completed_at,cancelled_at,cancelled_by_admin_id,cancellation_reason,created_at,updated_at)
        VALUES (${ticketIds[0]},'E2E reporting fixture work','PRIVATE_WORK_ORDER_NOTE',${office}::office,${status},${staff.id},
          ${status === 'completed' ? '2001-01-02T00:00:00.000Z' : null}::timestamptz,
          ${status === 'cancelled' ? '2001-01-02T00:00:00.000Z' : null}::timestamptz,
          ${status === 'cancelled' ? staff.id : null},${status === 'cancelled' ? 'Fixture cancellation' : null},
          '2001-01-01T16:00:00.000Z'::timestamptz,'2001-01-02T00:00:00.000Z'::timestamptz)
        RETURNING id
      `;
      await tx`
        INSERT INTO work_order_status_history (work_order_id,status,admin_id,admin_name,changed_at)
        VALUES (${workOrder.id},'pending',${staff.id},${staff.name},'2001-01-01T16:00:00.000Z'::timestamptz)
      `;
      if (status !== 'pending') {
        await tx`
          INSERT INTO work_order_status_history (work_order_id,status,admin_id,admin_name,changed_at)
          VALUES (${workOrder.id},${status},${staff.id},${staff.name},'2001-01-02T00:00:00.000Z'::timestamptz)
        `;
      }
    }
    result.push({
      office,
      ticketIds,
      reportIds,
      references,
      assessedConditions,
      citizenName: citizen.name,
    });
  }
  return result;
}
