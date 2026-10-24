import { sql } from '../db';

// Playwright fixtures for the staff Merge / Remove / Regroup spec
// (e2e/admin-ticket-grouping.spec.ts; manuscript revision Phase 3, step 3d)
// and the category / location correction spec
// (e2e/admin-ticket-corrections.spec.ts; step 3e). The tickets and reports
// are inserted directly, never through POST /reports, so the specs post no
// report: a full run already posts 20, the per-IP hourly limit
// (docs/testing.md). Every fixture report belongs to citizen1 and its title
// starts with one of TITLE_PREFIXES. Each grouping scenario sits in its own
// spot in Jalung, 80 m from the next (four times the 20 m Pothole radius),
// so it only ever suggests its own pair; the correction fixtures sit about
// 55 m east of those spots, outside every grouping pair's radius.
//
// Run by e2e/global-setup.ts (creates the fixtures and prints their ids on
// one E2E_GROUPING_FIXTURES= line) and e2e/global-teardown.ts (--cleanup).
// Both first retire whatever an earlier run left active: every active ticket
// that is not merged away and whose reports are all fixture reports is set
// to Rejected, with a status_history row, after its active Work Orders are
// cancelled, with a work_order_status_history row. Nothing is deleted and no
// history is rewritten; a merged-away fixture ticket stays as the read-only
// history it is.

const TITLE_PREFIX = 'E2E grouping fixture';
const CORRECTION_TITLE_PREFIX = 'E2E correction fixture';
const TITLE_PATTERNS = [`${TITLE_PREFIX}%`, `${CORRECTION_TITLE_PREFIX}%`];
const CATEGORY = 'Pothole / Road Surface Damage';
const CITIZEN_EMAIL = 'citizen1@porac.ph';
const MEO_EMAIL = 'meo@porac.gov.ph';
const IMAGE_URL = '/uploads/reports/01_poblacion.jpg';
const CLEANUP_ACTOR = 'E2E fixture cleanup';

// The point in Jalung step 3c chose because no ticket of any kind was within
// 400 m; the five spots run 0-330 m north of it. Its referral fixtures there
// are Leaking Pipe, so they never appear among these Pothole suggestions.
const BASE = { lat: 15.06, lng: 120.53 };
const SPOT_STEP_DEG = 80 / 111_320; // 80 m north per scenario
const PAIR_STEP_DEG = 5 / 111_320; // 5 m north within a scenario
const CORRECTION_EAST_DEG = 0.0005; // about 55 m east of the grouping spots

type Office = 'MEO' | 'MDRRMO';
interface Point {
  lat: number;
  lng: number;
}

function spot(index: number, member = 0): Point {
  return {
    lat: BASE.lat + index * SPOT_STEP_DEG + member * PAIR_STEP_DEG,
    lng: BASE.lng,
  };
}

function correctionSpot(index: number, member = 0): Point {
  const p = spot(index, member);
  return { lat: p.lat, lng: p.lng + CORRECTION_EAST_DEG };
}

async function retireLeftovers(): Promise<number> {
  return sql.begin(async (tx) => {
    const tickets = await tx<{ id: number }[]>`
      SELECT t.id FROM tickets t
      WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
        AND t.merged_into_ticket_id IS NULL
        AND EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id AND r.title LIKE ANY(${TITLE_PATTERNS}::text[]))
        AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id AND NOT (r.title LIKE ANY(${TITLE_PATTERNS}::text[])))
      ORDER BY t.id
      FOR UPDATE
    `;
    const ids = tickets.map((t) => t.id);
    if (ids.length === 0) return 0;
    const cancelled = await tx<{ id: number }[]>`
      UPDATE work_orders SET status = 'cancelled', updated_at = now()
      WHERE ticket_id = ANY(${ids}) AND status IN ('pending', 'in_progress')
      RETURNING id
    `;
    for (const wo of cancelled) {
      await tx`
        INSERT INTO work_order_status_history (work_order_id, status, admin_id, admin_name)
        VALUES (${wo.id}, 'cancelled', NULL, ${CLEANUP_ACTOR})
      `;
    }
    await tx`UPDATE tickets SET status = 'Rejected', updated_at = now() WHERE id = ANY(${ids})`;
    for (const id of ids) {
      await tx`
        INSERT INTO status_history (ticket_id, status, admin_id, admin_name)
        VALUES (${id}, 'Rejected', NULL, ${CLEANUP_ACTOR})
      `;
    }
    return ids.length;
  });
}

async function create() {
  const [citizen] = await sql<
    { id: number }[]
  >`SELECT id FROM citizens WHERE email = ${CITIZEN_EMAIL}`;
  const [meo] = await sql<{ id: number; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name FROM admins WHERE email = ${MEO_EMAIL}
  `;
  if (!citizen || !meo)
    throw new Error(
      'citizen1 or the MEO demo admin is missing; run seed:users and seed:e2e-admins first.',
    );

  return sql.begin(async (tx) => {
    const ticket = async (
      at: Point,
      options: {
        office?: Office;
        initialOffice?: Office;
        status?: 'Reported' | 'Under Review';
        ageDays: number;
      },
    ) => {
      const [barangay] = await tx<{ id: number }[]>`
        SELECT id FROM barangays
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${at.lng}, ${at.lat}), 4326))
        LIMIT 1
      `;
      if (!barangay)
        throw new Error(
          `Fixture point ${at.lat}, ${at.lng} is outside every barangay.`,
        );
      const office = options.office ?? 'MEO';
      const status = options.status ?? 'Reported';
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO tickets (
          category, barangay_id, member_count, assigned_office, initial_assigned_office, status, geom, created_at, updated_at
        )
        VALUES (
          ${CATEGORY}, ${barangay.id}, 0, ${office}, ${options.initialOffice ?? office}, ${status},
          ST_SetSRID(ST_MakePoint(${at.lng}, ${at.lat}), 4326),
          now() - make_interval(days => ${options.ageDays}), now() - make_interval(days => ${options.ageDays})
        )
        RETURNING id
      `;
      if (status !== 'Reported') {
        await tx`
          INSERT INTO status_history (ticket_id, status, admin_id, admin_name, changed_at)
          VALUES (${row.id}, ${status}, ${meo.id}, ${meo.name}, now() - make_interval(days => ${options.ageDays}) + interval '1 hour')
        `;
      }
      return row.id;
    };
    const report = async (
      ticketId: number,
      at: Point,
      label: string,
      ageDays: number,
      prefix = TITLE_PREFIX,
    ) => {
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, image_url, submitted_category,
          geom, pin_geom, flags, created_at
        )
        VALUES (
          ${ticketId}, ${citizen.id}, ${`${prefix}: ${label}`}, 'Inserted by e2e/global-setup.ts.', 'Medium',
          ${IMAGE_URL}, ${CATEGORY},
          ST_SetSRID(ST_MakePoint(${at.lng}, ${at.lat}), 4326),
          ST_SetSRID(ST_MakePoint(${at.lng}, ${at.lat}), 4326),
          ARRAY[]::text[], now() - make_interval(days => ${ageDays})
        )
        RETURNING id
      `;
      await tx`UPDATE tickets SET member_count = member_count + 1 WHERE id = ${ticketId}`;
      return row.id;
    };

    // 1. Merge: the older ticket is Under Review; the newer one carries
    //    citizen1's report, whose page then shows the survivor's status.
    const olderTicketId = await ticket(spot(0), {
      status: 'Under Review',
      ageDays: 2,
    });
    await report(olderTicketId, spot(0), 'merge, older ticket', 2);
    const newerTicketId = await ticket(spot(0, 1), { ageDays: 1 });
    const newerReportId = await report(
      newerTicketId,
      spot(0, 1),
      'merge, newer ticket',
      1,
    );

    // 2. Remove: one ticket with two reports.
    const removeTicketId = await ticket(spot(1), { ageDays: 1 });
    const removeReportIds = [
      await report(removeTicketId, spot(1), 'remove, stays', 1),
      await report(removeTicketId, spot(1, 1), 'remove, taken out', 1),
    ];

    // 3. Regroup: a two-report ticket next to a one-report ticket.
    const regroupFromTicketId = await ticket(spot(2), { ageDays: 1 });
    const regroupReportIds = [
      await report(regroupFromTicketId, spot(2), 'regroup, stays', 1),
      await report(regroupFromTicketId, spot(2, 1), 'regroup, moved', 1),
    ];
    const regroupToTicketId = await ticket(spot(2, 2), { ageDays: 1 });
    await report(regroupToTicketId, spot(2, 2), 'regroup, target', 1);

    // 4. Different offices: an MEO ticket next to one reassigned to MDRRMO.
    const meoTicketId = await ticket(spot(3), { ageDays: 1 });
    const meoReportId = await report(
      meoTicketId,
      spot(3),
      'different offices, MEO',
      1,
    );
    const mdrrmoTicketId = await ticket(spot(3, 1), {
      office: 'MDRRMO',
      initialOffice: 'MEO',
      ageDays: 1,
    });
    await report(mdrrmoTicketId, spot(3, 1), 'different offices, MDRRMO', 1);

    // 5. Active Work Order: the newer ticket has a pending Work Order, so it
    //    can't be merged away; the older one (the default survivor) can.
    const workOrderViewedTicketId = await ticket(spot(4), { ageDays: 2 });
    await report(workOrderViewedTicketId, spot(4), 'work order, viewed', 2);
    const workOrderTicketId = await ticket(spot(4, 1), { ageDays: 1 });
    await report(workOrderTicketId, spot(4, 1), 'work order, has one', 1);
    const [workOrder] = await tx<{ id: number }[]>`
      INSERT INTO work_orders (ticket_id, title, assigned_office, status, created_by_admin_id)
      VALUES (${workOrderTicketId}, ${`${TITLE_PREFIX}: patch the pothole`}, 'MEO', 'pending', ${meo.id})
      RETURNING id
    `;
    await tx`
      INSERT INTO work_order_status_history (work_order_id, status, admin_id, admin_name)
      VALUES (${workOrder.id}, 'pending', ${meo.id}, ${meo.name})
    `;

    // Step 3e corrections, all Pothole / Road Surface Damage (MEO) at first.
    const correctionTicket = async (
      index: number,
      label: string,
      options: { status?: 'Reported' | 'Under Review'; member?: number } = {},
    ) => {
      const at = correctionSpot(index, options.member);
      const ticketId = await ticket(at, { status: options.status, ageDays: 1 });
      const reportId = await report(
        ticketId,
        at,
        label,
        1,
        CORRECTION_TITLE_PREFIX,
      );
      return { ticketId, reportId };
    };
    // 6. Category within MEO; citizen1's page then shows "You reported".
    const withinOffice = await correctionTicket(0, 'category within MEO');
    // 7. Category of MDRRMO: the ticket moves, with a Reassign.
    const toMdrrmo = await correctionTicket(1, 'category to MDRRMO');
    // 8. Category of MDRRMO refused: a pending Work Order.
    const blockedByWorkOrder = await correctionTicket(
      2,
      'category blocked by a Work Order',
    );
    const [correctionWorkOrder] = await tx<{ id: number }[]>`
      INSERT INTO work_orders (ticket_id, title, assigned_office, status, created_by_admin_id)
      VALUES (${blockedByWorkOrder.ticketId}, ${`${CORRECTION_TITLE_PREFIX}: patch the pothole`}, 'MEO', 'pending', ${meo.id})
      RETURNING id
    `;
    await tx`
      INSERT INTO work_order_status_history (work_order_id, status, admin_id, admin_name)
      VALUES (${correctionWorkOrder.id}, 'pending', ${meo.id}, ${meo.name})
    `;
    // 9. Location: moved into the nearest other barangay, at a point inside
    //    its polygon.
    const location = await correctionTicket(3, 'location');
    const [here] = await tx<{ id: number; name: string }[]>`
      SELECT b.id, b.name FROM tickets t JOIN barangays b ON b.id = t.barangay_id WHERE t.id = ${location.ticketId}
    `;
    const [target] = await tx<{ name: string; lat: number; lng: number }[]>`
      SELECT name, ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lng
      FROM barangays
      WHERE id <> ${here.id}
      ORDER BY geom <-> (SELECT geom FROM tickets WHERE id = ${location.ticketId})
      LIMIT 1
    `;
    // 10. Focal: a Reported ticket it may correct, and an Under Review one
    //     it may not.
    const focalReported = await correctionTicket(4, 'Focal, Reported');
    const focalUnderReview = await correctionTicket(4, 'Focal, Under Review', {
      status: 'Under Review',
      member: 2,
    });

    return {
      corrections: {
        withinOffice,
        toMdrrmo,
        blockedByWorkOrder,
        location: { ...location, fromBarangay: here.name, target },
        focalReported,
        focalUnderReview,
      },
      merge: { olderTicketId, newerTicketId, newerReportId },
      remove: { ticketId: removeTicketId, reportIds: removeReportIds },
      regroup: {
        fromTicketId: regroupFromTicketId,
        toTicketId: regroupToTicketId,
        reportIds: regroupReportIds,
      },
      differentOffices: { meoTicketId, meoReportId, mdrrmoTicketId },
      workOrder: {
        viewedTicketId: workOrderViewedTicketId,
        ticketId: workOrderTicketId,
      },
    };
  });
}

async function main() {
  const retired = await retireLeftovers();
  console.log(`Retired ${retired} leftover E2E grouping fixture ticket(s).`);
  if (!process.argv.includes('--cleanup')) {
    const fixtures = await create();
    console.log(`E2E_GROUPING_FIXTURES=${JSON.stringify(fixtures)}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
