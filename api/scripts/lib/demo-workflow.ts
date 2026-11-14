import type { Sql } from 'postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  AdminSession,
  CitizenSession,
} from '../../src/auth/session.service';
import type { SubmitReportResult } from '../../src/reports/reports.service';
import type { ReportInput } from '../../src/contracts/schemas';
import { renderExifImage } from '../../../lib/utils/generate-exif-image';
import { demoServices, DemoMediaService } from './demo-services';

export const DEMO_IP = '127.0.0.1';
export const DEMO_SCENARIOS: readonly {
  key: string;
  category: ReportInput['category'];
  evidence?: 'forty' | 'sixty' | 'stale' | 'missing' | 'future' | 'no-gps';
}[] = [
  {
    key: 'municipal-completion-confirm',
    category: 'Pothole / Road Surface Damage',
  },
  {
    key: 'suggestion-18m-staff-merge-dispute',
    category: 'Pothole / Road Surface Damage',
  },
  { key: 'outside-suggestion-22m', category: 'Pothole / Road Surface Damage' },
  {
    key: 'three-day-pothole-40m-no-flag',
    category: 'Pothole / Road Surface Damage',
    evidence: 'forty',
  },
  {
    key: 'location-mismatch-60m',
    category: 'Pothole / Road Surface Damage',
    evidence: 'sixty',
  },
  {
    key: 'flood-27h-classified-zero-rain',
    category: 'Localized Flooding',
    evidence: 'stale',
  },
  {
    key: 'missing-capture-time',
    category: 'Streetlight Out',
    evidence: 'missing',
  },
  {
    key: 'future-flood-no-classification-rain-unavailable',
    category: 'Localized Flooding',
    evidence: 'future',
  },
  {
    key: 'no-gps-hazard-unavailable',
    category: 'Localized Flooding',
    evidence: 'no-gps',
  },
  { key: 'hazard-pending', category: 'Rain-Induced Slope Failure/Landslide' },
  { key: 'cancelled-work-order', category: 'Pothole / Road Surface Damage' },
  { key: 'pending-work-order', category: 'Clogged Drainage / Damaged Culvert' },
  { key: 'in-progress-work-order', category: 'Localized Flooding' },
  { key: 'external-referral-resolution', category: 'Localized Flooding' },
  {
    key: 'focal-and-operational-routing',
    category: 'Pothole / Road Surface Damage',
  },
];

export function requireDemo(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export async function requireEmptyDemoTarget(pg: Sql) {
  const [row] = await pg<
    { occupied: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM tickets) OR EXISTS(SELECT 1 FROM reports)
    OR EXISTS(SELECT 1 FROM work_orders) OR EXISTS(SELECT 1 FROM operational_assessments)
    OR EXISTS(SELECT 1 FROM notifications) OR EXISTS(SELECT 1 FROM admin_audit_events)
    OR EXISTS(SELECT 1 FROM rate_limit_events WHERE created_at>now()-interval '24 hours') AS occupied`;
  requireDemo(
    !row.occupied,
    'Demo refused: operational target or recent submission history is not empty. Nothing was reset; use a fresh disposable target.',
  );
}

export async function loadDemoActors(pg: Sql) {
  const staff = await pg<
    {
      id: number;
      email: string;
      name: string;
      office: 'MEO' | 'MDRRMO';
      is_focal: boolean;
    }[]
  >`
    SELECT id,email,concat_ws(' ',first_name,last_name) name,office,is_focal FROM admins
    WHERE account_type='PERSONNEL' AND is_active=true ORDER BY id`;
  const actor = (office: 'MEO' | 'MDRRMO', focal: boolean): AdminSession => {
    const row = staff.find((a) => a.office === office && a.is_focal === focal);
    requireDemo(
      row,
      'Demo needs active MEO, MDRRMO and Focal Personnel accounts.',
    );
    return {
      adminId: row.id,
      email: row.email,
      adminName: row.name,
      accountType: 'PERSONNEL',
      office,
      isFocal: focal,
    };
  };
  const rows = await pg<
    { id: number; email: string; name: string }[]
  >`SELECT id,email,concat_ws(' ',first_name,last_name) name FROM citizens
    WHERE email=ANY(ARRAY['citizen1@porac.ph','citizen2@porac.ph','citizen3@porac.ph','citizen4@porac.ph','citizen5@porac.ph']) ORDER BY email`;
  requireDemo(
    rows.length === 5,
    'Demo needs the five seed:users accounts before it starts.',
  );
  const citizens: CitizenSession[] = rows.map((c) => ({
    citizenId: c.id,
    email: c.email,
    citizenName: c.name,
  }));
  return {
    meo: actor('MEO', false),
    mdrrmo: actor('MDRRMO', false),
    focal: actor('MDRRMO', true),
    citizens,
  };
}

export async function demoPoint(pg: Sql, metres: number) {
  const [point] = await pg<
    { lat: number; lng: number }[]
  >`SELECT ST_Y(g) lat,ST_X(g) lng FROM (
    SELECT ST_Project(ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326)::geography,${metres}::double precision,0::double precision)::geometry g) p`;
  return point;
}

export async function runDemoWorkflow(
  pg: Sql,
  db: PostgresJsDatabase,
  media: DemoMediaService,
) {
  // Read all prerequisites before generating/uploading media or creating records.
  // A partial failed run is preserved; a retry refuses it instead of erasing history.
  await requireEmptyDemoTarget(pg);
  const actors = await loadDemoActors(pg);
  const svc = demoServices(pg, db, media);
  const points = await Promise.all(
    DEMO_SCENARIOS.map((_, i) =>
      demoPoint(pg, i === 0 ? 0 : i === 1 ? 18 : i === 2 ? -22 : i * 150),
    ),
  );
  for (const point of points)
    requireDemo(
      await svc.barangays.findBarangayForPoint(point.lat, point.lng),
      'Demo point is outside the imported municipality; import the reference geometry first.',
    );
  const submissions: (SubmitReportResult & { scenario: string })[] = [];
  for (const [i, scenario] of DEMO_SCENARIOS.entries()) {
    const pin = points[i];
    const photo =
      scenario.evidence === 'forty' || scenario.evidence === 'sixty'
        ? await demoPoint(
            pg,
            i * 150 + (scenario.evidence === 'forty' ? 40 : 60),
          )
        : pin;
    const hours =
      scenario.evidence === 'stale'
        ? 27
        : scenario.evidence === 'forty'
          ? 72
          : scenario.evidence === 'future'
            ? -4
            : 0;
    const image = await renderExifImage({
      ...photo,
      date:
        scenario.evidence === 'missing'
          ? null
          : new Date(Date.now() - hours * 3600000),
      gps: scenario.evidence !== 'no-gps',
      variant: i + 500,
    });
    const result = await svc.reports.submit(
      actors.citizens[i % 5],
      DEMO_IP,
      {
        ...pin,
        title: 'Phase 8c demo ' + scenario.key,
        description: 'Demonstration submitted through the real report service.',
        category: scenario.category,
        citizenSeverity: 'High',
      },
      image,
    );
    requireDemo(
      /^PRC-\d{4}-\d{6,}$/.test(result.trackingReference),
      'Missing generated tracking reference.',
    );
    const [stored] = await pg<{ flags: string[]; member_count: number }[]>`
      SELECT r.flags, t.member_count FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ${result.reportId}
    `;
    requireDemo(
      stored.member_count === 1,
      'Submission unexpectedly merged a report.',
    );
    const expected =
      scenario.evidence === 'sixty'
        ? 'LOCATION_MISMATCH'
        : scenario.evidence === 'stale'
          ? 'STALE_EVIDENCE'
          : scenario.evidence === 'missing'
            ? 'MISSING_METADATA'
            : scenario.evidence === 'future'
              ? 'TIMESTAMP_ANOMALY'
              : null;
    if (expected)
      requireDemo(
        stored.flags.includes(expected),
        'Evidence scenario did not produce ' + expected,
      );
    else
      requireDemo(
        !stored.flags.some((f) =>
          [
            'LOCATION_MISMATCH',
            'STALE_EVIDENCE',
            'MISSING_METADATA',
            'TIMESTAMP_ANOMALY',
          ].includes(f),
        ),
        'Unexpected evidence flag on ' + scenario.key,
      );
    submissions.push({ scenario: scenario.key, ...result });
    await svc.focal.screenSeverity(result.reportId, actors.focal, {
      status: 'NO_CONCERN_NOTED',
      remarks:
        'Demonstration review; evidence flags remain available to personnel.',
    });
    await svc.focal.acknowledge(
      result.reportId,
      actors.focal,
      'Intake acknowledged for demonstration.',
    );
  }
  const near = await svc.related.forTicket(submissions[0].ticketId, actors.meo);
  const candidate = near?.candidates.find(
    (c) => c.ticketId === submissions[1].ticketId,
  );
  requireDemo(
    near?.radiusM === 20 && candidate?.distanceM === 18,
    'Pothole 18 m suggestion was not produced at radius 20 m.',
  );
  requireDemo(
    !near.candidates.some((c) => c.ticketId === submissions[2].ticketId),
    'Pothole 22 m ticket was incorrectly suggested.',
  );
  const suggestion =
    'Possibly related to Ticket #' + candidate.ticketId + ', 18 m away';
  await svc.grouping.merge(
    {
      survivorTicketId: submissions[0].ticketId,
      mergedTicketId: submissions[1].ticketId,
      reason:
        'Staff inspected the suggested reports and confirmed the same road defect.',
    },
    actors.meo,
  );

  const workOrders: number[] = [];
  for (const index of [0, 10, 11, 12]) {
    const ticketId = submissions[index].ticketId,
      admin = index === 12 ? actors.mdrrmo : actors.meo;
    await svc.tickets.advanceStatus(ticketId, admin, undefined, undefined);
    await svc.assessment.upsert(ticketId, admin, {
      assessedConditions: 'Site inspected and reported conditions confirmed.',
      recommendedAction: 'Complete the documented municipal field action.',
      safetyImplications: 'Use temporary access control.',
      operationalConstraints: [],
      interimMitigation: 'Temporary warning barriers installed.',
    });
    const wo = await svc.orders.create(
      {
        ticketId,
        title: 'Demo field action ' + submissions[index].scenario,
        notes: 'Assessment completed before creating this order.',
        assignedAdminId: admin.adminId,
        dueDate: null,
      },
      admin,
    );
    if (index === 0 || index === 12)
      await svc.orders.setStatus(wo.id, 'in_progress', admin);
    if (index === 0) await svc.orders.setStatus(wo.id, 'completed', admin);
    if (index === 10)
      await svc.orders.cancel(
        wo.id,
        {
          reason:
            'Inspection found the planned work requires a different method; cancelled with a recorded reason.',
        },
        admin,
      );
    workOrders.push(wo.id);
  }
  await svc.tickets.advanceStatus(
    submissions[0].ticketId,
    actors.meo,
    undefined,
    undefined,
  );
  await svc.tickets.advanceStatus(
    submissions[0].ticketId,
    actors.meo,
    'Municipal field work completed and inspected.',
    undefined,
    'MUNICIPAL_ACTION_COMPLETED',
  );
  await svc.reports.answerResolution(
    actors.citizens[0].citizenId,
    submissions[0].ticketId,
    'CONFIRMED',
    null,
  );
  await svc.reports.answerResolution(
    actors.citizens[1].citizenId,
    submissions[0].ticketId,
    'DISPUTED',
    'A remaining defect still needs review.',
  );

  const external = submissions[13];
  await svc.focal.refer(
    external.reportId,
    actors.focal,
    'DENR-MGB',
    'Flood hazard requires the external agency assessment.',
  );
  await svc.tickets.advanceStatus(
    external.ticketId,
    actors.mdrrmo,
    undefined,
    undefined,
  );
  await svc.tickets.advanceStatus(
    external.ticketId,
    actors.mdrrmo,
    undefined,
    undefined,
  );
  await svc.tickets.advanceStatus(
    external.ticketId,
    actors.mdrrmo,
    'Referred to the responsible agency with coordination documented.',
    undefined,
    'EXTERNAL_REFERRAL',
  );
  const routing = submissions[14];
  await svc.focal.reassign(
    routing.reportId,
    actors.focal,
    'MDRRMO',
    'Initial review requests emergency access coordination.',
  );
  await svc.tickets.advanceStatus(
    routing.ticketId,
    actors.mdrrmo,
    undefined,
    undefined,
  );
  await svc.tickets.reassignOffice(
    routing.ticketId,
    actors.mdrrmo,
    'MEO',
    'Review confirmed municipal engineering responsibility.',
  );
  await svc.tickets.logReferral(
    routing.ticketId,
    actors.meo,
    'DPWH',
    'Coordinate adjoining national-road works before municipal repair.',
  );

  // Pending is deliberately no completed lookup. Other states pass scripted
  // provider results through the real persistence services, never raw fixtures.
  for (const [index, status] of [
    [5, 'CLASSIFIED'],
    [7, 'NO_CLASSIFICATION'],
    [8, 'TEMPORARILY_UNAVAILABLE'],
  ] as const) {
    svc.hazard.result = {
      lookupStatus: status,
      susceptibilityCode: status === 'CLASSIFIED' ? 'H' : null,
      susceptibilityLabel: status === 'CLASSIFIED' ? 'High' : null,
      failureReason:
        status === 'TEMPORARILY_UNAVAILABLE'
          ? 'Offline demonstration source unavailable'
          : null,
    };
    await svc.hazard.lookup(submissions[index].ticketId);
  }
  svc.rainfall.result = { ok: true, rainfallMm: 0, observationAt: new Date() };
  await svc.rainfall.refresh(submissions[5].ticketId, 'manual');
  svc.rainfall.result = {
    ok: false,
    failureReason: 'Offline demonstration rainfall source unavailable',
  };
  await svc.rainfall.refresh(submissions[7].ticketId, 'manual');
  return {
    submissions,
    workOrders,
    suggestion,
    potholeRadiusM: near.radiusM,
    excluded22mTicketId: submissions[2].ticketId,
    pendingHazardTicketId: submissions[9].ticketId,
  };
}
