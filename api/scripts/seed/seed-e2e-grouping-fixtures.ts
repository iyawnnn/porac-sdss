import { sql } from '../db';

// Playwright fixtures for the staff Merge / Remove / Regroup spec
// (e2e/admin-ticket-grouping.spec.ts; manuscript revision Phase 3, step 3d),
// the category / location correction spec
// (e2e/admin-ticket-corrections.spec.ts; step 3e), the Focal severity
// screening spec (e2e/admin-severity-screening.spec.ts; step 3f) and the
// per-citizen resolution feedback spec
// (e2e/citizen-resolution-feedback.spec.ts; step 3g), and the DENR-MGB
// Hazard Information spec (e2e/admin-hazard-information.spec.ts; Phase 4,
// step 4b), whose hazard_information rows are inserted here too, so that
// spec never calls the live service, and the rainfall context spec
// (e2e/admin-rainfall-context.spec.ts; step 4c), whose rainfall_context rows
// are inserted on the same tickets for the same reason, and the manual
// routing spec (e2e/admin-routing.spec.ts; Phase 5, step 5a). The tickets and reports
// are inserted directly, never through POST /reports, so the specs post no
// report: a full run already posts 20, the per-IP hourly limit
// (docs/testing.md). Every fixture report belongs to citizen1 (the step 3g
// ticket also has one by citizen2) and its title starts with one of
// TITLE_PATTERNS' prefixes. Each grouping scenario sits in its own
// spot in Jalung, 80 m from the next (four times the 20 m Pothole radius),
// so it only ever suggests its own pair; the correction fixtures sit about
// 55 m east of those spots, outside every grouping pair's radius.
//
// Run by e2e/global-setup.ts (creates the fixtures and prints their ids on
// one E2E_GROUPING_FIXTURES= line) and e2e/global-teardown.ts (--cleanup).
// Both first retire whatever an earlier run left active: every active ticket
// (or Resolved step 3g feedback ticket) that is not merged away and whose
// reports are all fixture reports is set to Rejected, with a status_history
// row, after its active Work Orders are cancelled, with a
// work_order_status_history row. Its resolution_feedback rows stay as they
// are. Nothing is deleted and no
// history is rewritten; a merged-away fixture ticket stays as the read-only
// history it is.

const TITLE_PREFIX = 'E2E grouping fixture';
const CORRECTION_TITLE_PREFIX = 'E2E correction fixture';
const FEEDBACK_TITLE_PREFIX = 'E2E feedback fixture';
const HAZARD_TITLE_PREFIX = 'E2E hazard fixture';
const ROUTING_TITLE_PREFIX = 'E2E routing fixture';
const TITLE_PATTERNS = [
  `${TITLE_PREFIX}%`,
  `${CORRECTION_TITLE_PREFIX}%`,
  `${FEEDBACK_TITLE_PREFIX}%`,
  `${HAZARD_TITLE_PREFIX}%`,
  `${ROUTING_TITLE_PREFIX}%`,
];
const CATEGORY = 'Pothole / Road Surface Damage';
const CITIZEN_EMAIL = 'citizen1@porac.ph';
const SECOND_CITIZEN_EMAIL = 'citizen2@porac.ph';
const MEO_EMAIL = 'meo@porac.gov.ph';
const FOCAL_EMAIL = 'focal@porac.gov.ph';
const IMAGE_URL = '/uploads/reports/01_poblacion.jpg';
const CLEANUP_ACTOR = 'E2E fixture cleanup';

// The point in Jalung step 3c chose because no ticket of any kind was within
// 400 m; the five spots run 0-330 m north of it. Its referral fixtures there
// are Leaking Pipe, so they never appear among these Pothole suggestions.
const BASE = { lat: 15.06, lng: 120.53 };
const SPOT_STEP_DEG = 80 / 111_320; // 80 m north per scenario
const PAIR_STEP_DEG = 5 / 111_320; // 5 m north within a scenario
const CORRECTION_EAST_DEG = 0.0005; // about 55 m east of the grouping spots
// Hazard Information fixtures: 160 m apart, starting 160 m west of the
// grouping spots, so no two are within the 100 m flood / landslide radius
// of each other or of any other fixture.
const HAZARD_WEST_STEP_DEG = 0.0015;
// Routing fixtures (Phase 5, step 5a): on the grouping column, from 400 m
// north of BASE (past the last grouping spot at 325 m), 30 m apart — beyond
// the 20 m Pothole radius; the one Leaking Pipe fixture has no other of its
// category nearby.
const ROUTING_START_DEG = 400 / 111_320;
const ROUTING_STEP_DEG = 30 / 111_320;

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
      WHERE (
          t.status IN ('Reported', 'Under Review', 'In Progress')
          OR (
            t.status = 'Resolved'
            AND EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id AND r.title LIKE ${`${FEEDBACK_TITLE_PREFIX}%`})
          )
        )
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
    // resolution_outcome is set only on a Resolved ticket (the step 3g one).
    await tx`UPDATE tickets SET status = 'Rejected', resolution_outcome = NULL, updated_at = now() WHERE id = ANY(${ids})`;
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
  const [secondCitizen] = await sql<
    { id: number }[]
  >`SELECT id FROM citizens WHERE email = ${SECOND_CITIZEN_EMAIL}`;
  const [meo] = await sql<{ id: number; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name FROM admins WHERE email = ${MEO_EMAIL}
  `;
  const [focal] = await sql<{ id: number; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name FROM admins WHERE email = ${FOCAL_EMAIL}
  `;
  if (!citizen || !secondCitizen || !meo || !focal)
    throw new Error(
      'citizen1, citizen2, the MEO or the Focal demo admin is missing; run seed:users and seed:e2e-admins first.',
    );

  return sql.begin(async (tx) => {
    const ticket = async (
      at: Point,
      options: {
        office?: Office;
        initialOffice?: Office;
        status?: 'Reported' | 'Under Review' | 'Resolved' | 'Rejected';
        ageDays: number;
        category?: string;
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
          ${options.category ?? CATEGORY}, ${barangay.id}, 0, ${office}, ${options.initialOffice ?? office}, ${status},
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
      citizenId = citizen.id,
      category = CATEGORY,
    ) => {
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, image_url, submitted_category,
          geom, pin_geom, flags, created_at
        )
        VALUES (
          ${ticketId}, ${citizenId}, ${`${prefix}: ${label}`}, 'Inserted by e2e/global-setup.ts.', 'Medium',
          ${IMAGE_URL}, ${category},
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

    // Step 3f severity screening (e2e/admin-severity-screening.spec.ts): an
    // active MEO ticket whose report carries one old general 'screened'
    // intake action. Severity screening replaced that action, so the report
    // still starts NOT_REVIEWED and its intake state is not Screened. 40 m
    // north of the Focal Reported fixture (30 m from the Under Review one),
    // outside the 20 m Pothole radius of both.
    const screening = await correctionTicket(4, 'severity screening', {
      member: 8,
    });
    await tx`
      INSERT INTO report_intake_actions (report_id, action_type, actor_admin_id, actor_name, remarks)
      VALUES (
        ${screening.reportId}, 'screened', ${focal.id}, ${focal.name},
        ${`${CORRECTION_TITLE_PREFIX}: old general screening`}
      )
    `;

    // Step 3g per-citizen resolution feedback
    // (e2e/citizen-resolution-feedback.spec.ts): a Resolved MEO ticket with
    // one report by citizen1 and one by citizen2, and no answer yet. 60 m
    // north of the severity screening fixture; a Resolved ticket is never
    // suggested as related, so it touches no grouping pair.
    const feedbackAt = correctionSpot(4, 20);
    const feedbackTicketId = await ticket(feedbackAt, {
      status: 'Resolved',
      ageDays: 3,
    });
    await tx`
      UPDATE tickets SET resolution_outcome = 'MUNICIPAL_ACTION_COMPLETED',
        resolution_notes = ${`${FEEDBACK_TITLE_PREFIX}: pothole patched`}
      WHERE id = ${feedbackTicketId}
    `;
    const feedback = {
      ticketId: feedbackTicketId,
      citizenAReportId: await report(
        feedbackTicketId,
        feedbackAt,
        'citizen A',
        3,
        FEEDBACK_TITLE_PREFIX,
      ),
      citizenBReportId: await report(
        feedbackTicketId,
        feedbackAt,
        'citizen B',
        3,
        FEEDBACK_TITLE_PREFIX,
        secondCitizen.id,
      ),
    };

    // Phase 4, step 4b: DENR-MGB Hazard Information
    // (e2e/admin-hazard-information.spec.ts). Active MDRRMO tickets, one per
    // panel state, with their hazard_information rows inserted directly at
    // the ticket's location, so Ticket Detail shows each state without a
    // live lookup. The spec never clicks Retry.
    const hazardTicket = async (
      index: number,
      category: string,
      label: string,
      status?: 'Rejected',
    ) => {
      const at = {
        lat: BASE.lat,
        lng: BASE.lng - (index + 1) * HAZARD_WEST_STEP_DEG,
      };
      const ticketId = await ticket(at, {
        office: 'MDRRMO',
        ageDays: 1,
        category,
        status,
      });
      await report(
        ticketId,
        at,
        label,
        1,
        HAZARD_TITLE_PREFIX,
        citizen.id,
        category,
      );
      return ticketId;
    };
    const hazardRow = async (
      ticketId: number,
      row: {
        context: 'FLOOD' | 'RAIN_INDUCED_LANDSLIDE';
        status: 'CLASSIFIED' | 'NO_CLASSIFICATION' | 'TEMPORARILY_UNAVAILABLE';
        code?: string;
        label?: string;
        failureReason?: string;
        // Hours ago; a superseded row is replaced an hour later.
        hoursAgo: number;
        superseded?: boolean;
      },
    ) => {
      await tx`
        INSERT INTO hazard_information (
          ticket_id, hazard_context_type, lookup_status, susceptibility_code,
          susceptibility_label, query_geom, failure_reason, looked_up_at, superseded_at
        )
        VALUES (
          ${ticketId}, ${row.context}, ${row.status}, ${row.code ?? null},
          ${row.label ?? null}, (SELECT geom FROM tickets WHERE id = ${ticketId}),
          ${row.failureReason ?? null}, now() - make_interval(hours => ${row.hoursAgo}),
          ${row.superseded ? tx`now() - make_interval(hours => ${row.hoursAgo - 1})` : null}
        )
      `;
    };
    // 1. Flood, CLASSIFIED (MF), with an earlier NO_CLASSIFICATION result as
    //    history.
    const hazardClassified = await hazardTicket(
      0,
      'Localized Flooding',
      'flood, classified',
    );
    await hazardRow(hazardClassified, {
      context: 'FLOOD',
      status: 'NO_CLASSIFICATION',
      hoursAgo: 5,
      superseded: true,
    });
    await hazardRow(hazardClassified, {
      context: 'FLOOD',
      status: 'CLASSIFIED',
      code: 'MF',
      label: 'Moderate Susceptibility to Flooding',
      hoursAgo: 4,
    });
    // 2. Landslide, NO_CLASSIFICATION.
    const hazardNoClassification = await hazardTicket(
      1,
      'Rain-Induced Slope Failure/Landslide',
      'landslide, no classification',
    );
    await hazardRow(hazardNoClassification, {
      context: 'RAIN_INDUCED_LANDSLIDE',
      status: 'NO_CLASSIFICATION',
      hoursAgo: 3,
    });
    // 3. Flood, TEMPORARILY_UNAVAILABLE just now (under 10 minutes old, so
    //    opening it starts no background retry), with the Retry button.
    const hazardUnavailable = await hazardTicket(
      2,
      'Localized Flooding',
      'flood, unavailable',
    );
    await hazardRow(hazardUnavailable, {
      context: 'FLOOD',
      status: 'TEMPORARILY_UNAVAILABLE',
      failureReason: 'Timed out after 8 s',
      hoursAgo: 0,
    });
    // 4. Landslide with no row: "Not yet checked". (The API for an e2e run
    //    starts with HAZARD_INFORMATION_LOOKUPS=disabled, so opening it
    //    starts no live lookup; docs/testing.md.)
    const hazardNotChecked = await hazardTicket(
      3,
      'Rain-Induced Slope Failure/Landslide',
      'landslide, not yet checked',
    );
    // 5. Lahar: no automated classification. 6. Another category: not
    //    applicable.
    const hazardLahar = await hazardTicket(
      4,
      'Lahar or Volcanic Debris-Flow Threat',
      'lahar',
    );
    const hazardNotApplicable = await hazardTicket(
      5,
      'Fallen Tree or Storm-Related Road Obstruction',
      'not applicable',
    );

    // Phase 4, step 4c: rainfall context (e2e/admin-rainfall-context.spec.ts)
    // on the same tickets, one per panel state, inserted directly at the
    // ticket's location so Ticket Detail shows each state without a live
    // call. The API for an e2e run starts with RAINFALL_LOOKUPS=disabled, so
    // opening a ticket whose reading is over 10 minutes old (or missing)
    // writes nothing either (docs/testing.md). The spec never clicks Refresh.
    const rainfallRow = async (
      ticketId: number,
      row: {
        status: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
        // 0 is a real reading: passed through with ??, never ||.
        mm: number | null;
        failureReason?: string;
        // Minutes ago it was fetched (and observed 5 minutes earlier); a
        // superseded row is replaced 30 minutes later.
        minutesAgo: number;
        superseded?: boolean;
      },
    ) => {
      await tx`
        INSERT INTO rainfall_context (
          ticket_id, status, rainfall_mm, source_provider, observation_at,
          fetched_at, query_geom, failure_reason, superseded_at
        )
        VALUES (
          ${ticketId}, ${row.status}, ${row.mm ?? null}, 'OpenWeatherMap',
          ${row.status === 'UNAVAILABLE' ? null : tx`now() - make_interval(mins => ${row.minutesAgo + 5})`},
          now() - make_interval(mins => ${row.minutesAgo}),
          (SELECT geom FROM tickets WHERE id = ${ticketId}), ${row.failureReason ?? null},
          ${row.superseded ? tx`now() - make_interval(mins => ${row.minutesAgo - 30})` : null}
        )
      `;
    };
    // a. Flood: CURRENT 0 mm fetched just now, with an earlier 4.5 mm
    //    reading as history.
    await rainfallRow(hazardClassified, {
      status: 'CURRENT',
      mm: 4.5,
      minutesAgo: 120,
      superseded: true,
    });
    await rainfallRow(hazardClassified, {
      status: 'CURRENT',
      mm: 0,
      minutesAgo: 0,
    });
    // b. Landslide: STALE, last known 3.2 mm, a refresh that timed out.
    await rainfallRow(hazardNoClassification, {
      status: 'STALE',
      mm: 3.2,
      failureReason: 'Timed out after 5 s',
      minutesAgo: 90,
    });
    // c. Flood: UNAVAILABLE (no earlier value), tried just now.
    await rainfallRow(hazardUnavailable, {
      status: 'UNAVAILABLE',
      mm: null,
      failureReason: 'HTTP 503',
      minutesAgo: 0,
    });
    // d. The landslide ticket with no Hazard Information has no rainfall
    //    either: "Not yet fetched". Lahar and Fallen Tree: "Not applicable".
    // e. A Rejected flood ticket with its stored 12.5 mm: shown as
    //    historical, never refreshed. Already closed, so nothing retires it.
    const rainfallClosed = await hazardTicket(
      6,
      'Localized Flooding',
      'flood, closed',
      'Rejected',
    );
    await rainfallRow(rainfallClosed, {
      status: 'CURRENT',
      mm: 12.5,
      minutesAgo: 600,
    });

    // Phase 5, step 5a: manual routing (e2e/admin-routing.spec.ts). MEO
    // tickets, one per routing rule; the spec reassigns and refers through
    // the UI and checks the refusals through the API.
    const routingTicket = async (
      index: number,
      label: string,
      options: {
        status?: 'Reported' | 'Under Review' | 'Rejected';
        category?: string;
        workOrder?: boolean;
      } = {},
    ) => {
      const at = {
        lat: BASE.lat + ROUTING_START_DEG + index * ROUTING_STEP_DEG,
        lng: BASE.lng,
      };
      const category = options.category ?? CATEGORY;
      const ticketId = await ticket(at, {
        status: options.status,
        ageDays: 1,
        category,
      });
      const reportId = await report(
        ticketId,
        at,
        label,
        1,
        ROUTING_TITLE_PREFIX,
        citizen.id,
        category,
      );
      if (options.workOrder) {
        const [wo] = await tx<{ id: number }[]>`
          INSERT INTO work_orders (ticket_id, title, assigned_office, status, created_by_admin_id)
          VALUES (${ticketId}, ${`${ROUTING_TITLE_PREFIX}: patch the pothole`}, 'MEO', 'pending', ${meo.id})
          RETURNING id
        `;
        await tx`
          INSERT INTO work_order_status_history (work_order_id, status, admin_id, admin_name)
          VALUES (${wo.id}, 'pending', ${meo.id}, ${meo.name})
        `;
      }
      return { ticketId, reportId };
    };
    const routing = {
      // Focal may route it: Reported, no Work Order.
      focalReported: await routingTicket(0, 'Focal, Reported'),
      // Focal may not: Under Review, or Reported with a pending Work Order.
      focalUnderReview: await routingTicket(1, 'Focal, Under Review', {
        status: 'Under Review',
      }),
      focalWorkOrder: await routingTicket(2, 'Focal, Work Order', {
        workOrder: true,
      }),
      // MEO refers and reassigns it: a referral category, Under Review.
      meoReferral: await routingTicket(3, 'MEO, referral', {
        status: 'Under Review',
        category: 'Leaking Pipe / Water Supply Concern',
      }),
      // MEO may not route it: a pending Work Order.
      meoWorkOrder: await routingTicket(4, 'MEO, Work Order', {
        status: 'Under Review',
        workOrder: true,
      }),
      // Nobody routes it, and Ticket Detail hides Reassign, New Work Order
      // and Add Assessment. Already closed, so nothing retires it.
      rejected: await routingTicket(5, 'Rejected', { status: 'Rejected' }),
    };

    return {
      routing,
      hazard: {
        classifiedTicketId: hazardClassified,
        noClassificationTicketId: hazardNoClassification,
        unavailableTicketId: hazardUnavailable,
        notCheckedTicketId: hazardNotChecked,
        laharTicketId: hazardLahar,
        notApplicableTicketId: hazardNotApplicable,
      },
      rainfall: {
        currentZeroTicketId: hazardClassified,
        staleTicketId: hazardNoClassification,
        unavailableTicketId: hazardUnavailable,
        notFetchedTicketId: hazardNotChecked,
        laharTicketId: hazardLahar,
        notApplicableTicketId: hazardNotApplicable,
        closedTicketId: rainfallClosed,
      },
      feedback,
      corrections: {
        withinOffice,
        toMdrrmo,
        blockedByWorkOrder,
        location: { ...location, fromBarangay: here.name, target },
        focalReported,
        focalUnderReview,
      },
      screening,
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
