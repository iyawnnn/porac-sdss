import { readFileSync } from 'fs';
import { join } from 'path';
import { OUTSIDE_MUNICIPALITY_MESSAGE } from './reports.service';

describe('OUTSIDE_MUNICIPALITY_MESSAGE', () => {
  it('does not hardcode a barangay count', () => {
    // Regression guard: the barangay count has changed before (GADM's 33 ->
    // PSGC's 29) and the rejection message drifted out of sync with it.
    // Any digit directly adjacent to "barangay" would reintroduce that bug.
    expect(OUTSIDE_MUNICIPALITY_MESSAGE).not.toMatch(/\d+\s*barangay/i);
    expect(OUTSIDE_MUNICIPALITY_MESSAGE).not.toMatch(/barangay\w*\s*\d+/i);
  });

  it('still communicates the municipality boundary rejection', () => {
    expect(OUTSIDE_MUNICIPALITY_MESSAGE).toMatch(/Municipality of Porac/);
    expect(OUTSIDE_MUNICIPALITY_MESSAGE).toMatch(/barangay/i);
  });
});

// Manuscript revision Phase 1, step 3: automatic grouping is gone — every
// report creates its own ticket (handoff Decision 1). Background on why this
// file asserts on source text: the old duplicate-merge candidate query (Issue #4) sat behind ~7 injected
// services (rate limiting, barangay resolution, elevation, weather, EXIF/
// perceptual-hash comparison) that all hit the DB before the merge query
// itself runs, and this repo has no DB test harness (no testcontainers,
// no pg-mem — confirmed by inspecting every existing spec/e2e-spec file,
// all of which either test pure functions or mock PG with a bare
// `jest.fn()` that can't distinguish one query from another). Fully
// mocking that chain to reach the merge query would itself be a small
// integration-test framework, which this task explicitly avoids. These
// regression guards instead assert on the source text directly — the
// same "can't silently drift back to a hardcoded literal" guarantee as
// the OUTSIDE_MUNICIPALITY_MESSAGE tests above, applied to the SQL
// template instead of a returned string. They verify the query is wired
// to the shared constant, not that PostgreSQL's boundary math is correct
// (that syntax was confirmed directly against the dev database during
// implementation, not re-verified here).
describe('automatic grouping removed from submit() (Phase 1, step 3)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const submitBody = reportsServiceSource.slice(
    reportsServiceSource.indexOf('  async submit('),
    reportsServiceSource.indexOf('  private async notifyFocalIntake('),
  );

  it('no longer looks up an existing ticket to merge into', () => {
    expect(submitBody).not.toMatch(/ST_DWithin/);
    expect(submitBody).not.toMatch(/DUPLICATE_MERGE_WINDOW_DAYS/);
    expect(submitBody).not.toMatch(/make_interval/);
    expect(submitBody).not.toMatch(/radiusForCategory/);
    expect(reportsServiceSource).not.toMatch(
      /common\/utils\/duplicate-detection/,
    );
  });

  it('never updates an existing ticket (member_count, centroid) during submission', () => {
    expect(submitBody).not.toMatch(/UPDATE tickets/);
    expect(submitBody).not.toMatch(/ST_Centroid/);
    expect(submitBody).not.toMatch(/member_count = /);
  });

  it('no longer sends the automatic report_merged notification', () => {
    expect(reportsServiceSource).not.toMatch(/type: 'report_merged'/);
  });

  it('drops the merge-only advisory lock', () => {
    expect(submitBody).not.toMatch(/pg_advisory_xact_lock/);
  });

  it('always inserts a new ticket with member_count 1 and reports merged: false', () => {
    expect(submitBody.match(/INSERT INTO tickets/g)).toHaveLength(1);
    expect(submitBody).toMatch(/\$\{category\}, \$\{barangay\.id\}, 1,/);
    expect(submitBody).toMatch(/merged: false,\s*memberCount: 1,/);
    expect(submitBody).not.toMatch(/merged: true/);
  });

  it('still records the rate-limit event inside the submission transaction', () => {
    expect(submitBody).toMatch(/this\.rateLimit\.recordRateLimitEvent\(\s*tx,/);
  });
});

// Same rationale as the block above (no DB test harness) — regression guard
// for Phase 5's fix: the public hazard map's active-ticket query previously
// omitted 'Under Review' from its status filter while every other "active"
// query site in the codebase (including the block above) used all three.
describe('public hazard map active-status filter (Phase 5)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  it('includes Under Review alongside Reported and In Progress', () => {
    expect(reportsServiceSource).toMatch(
      /t\.status IN \('Reported', 'Under Review', 'In Progress'\)/,
    );
  });

  it('does not use the old two-status filter anywhere', () => {
    expect(reportsServiceSource).not.toMatch(
      /status IN \('Reported', 'In Progress'\)/,
    );
  });
});

// Same rationale as the block above — no DB test harness to mock this
// transaction end-to-end, so the atomicity guarantee (notification insert
// happens via `tx`, not a separate post-commit call) is asserted on the
// source text instead.
describe('notification wiring stays inside the submit transaction', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  it('uses createInTx (not the standalone create()) for the new-ticket, dispute, and Focal-fan-out paths', () => {
    // 4: citizen ack (new ticket) + admin office notification (new ticket)
    // + dispute + notifyFocalIntake's own single createInTx call site. The
    // automatic-merge citizen notification went away in Phase 1, step 3.
    const matches = reportsServiceSource.match(
      /this\.notifications\.createInTx\(tx,/g,
    );
    expect(matches).toHaveLength(4);
  });

  it('does not call the standalone create() from submit()', () => {
    expect(reportsServiceSource).not.toMatch(/this\.notifications\.create\(\{/);
  });
});

describe('new-report admin notification wiring', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  it('creates exactly one citizen acknowledgement and one office-targeted admin notification for a new ticket', () => {
    expect(
      reportsServiceSource.match(/this\.notifications\.createInTx\(tx,/g),
    ).toHaveLength(4);
    expect(reportsServiceSource).toMatch(
      /recipientType: 'admin',[\s\S]*?recipientOffice: office,[\s\S]*?type: 'new_citizen_report',[\s\S]*?title: 'New citizen report'/,
    );
    expect(reportsServiceSource).toMatch(
      /category\} report in \$\{barangay\.name\}[\s\S]*?Ticket #\$\{ticket\.id\}, Report #\$\{report\.id\}/,
    );
    expect(reportsServiceSource).toMatch(
      /href: `\/admin\/tickets\/\$\{ticket\.id\}`/,
    );
  });

  it('sends exactly one office-targeted new-report notification per submission (no merge branch any more)', () => {
    expect(
      reportsServiceSource.match(/type: 'new_citizen_report'/g),
    ).toHaveLength(1);
    expect(reportsServiceSource).not.toMatch(/if \(existing\) \{/);
  });

  it('citizen receipt wording does not claim Under Review at submission time', () => {
    expect(reportsServiceSource).not.toMatch(/now under review/i);
    expect(reportsServiceSource).toMatch(
      /Your report has been received and routed for municipal review\./,
    );
  });
});

// Batch 2 (Focal intake): Focal has municipality-wide intake visibility, so
// every new report must notify active Focal accounts directly (since Phase 1,
// step 3 every report starts its own ticket, so there is one call site). Source-text
// assertions, same rationale as the blocks above (no DB test harness).
describe('Focal intake fan-out wiring (new report notifications)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  it('calls notifyFocalIntake once, for the new ticket every report creates', () => {
    const matches = reportsServiceSource.match(/this\.notifyFocalIntake\(tx,/g);
    expect(matches).toHaveLength(1);
  });

  it('fans out to active focal admins by direct recipientId, never recipientOffice', () => {
    const method = reportsServiceSource.slice(
      reportsServiceSource.indexOf('private async notifyFocalIntake('),
      reportsServiceSource.indexOf('async getMyReports('),
    );
    expect(method).toMatch(/role = 'focal' AND is_active = true/);
    expect(method).toMatch(/recipientId: admin\.id/);
    expect(method).not.toMatch(/recipientOffice/);
  });

  it("uses its own notification type, distinct from the office-wide 'new_citizen_report'", () => {
    const method = reportsServiceSource.slice(
      reportsServiceSource.indexOf('private async notifyFocalIntake('),
      reportsServiceSource.indexOf('async getMyReports('),
    );
    expect(method).toMatch(/type: 'new_intake_report'/);
  });
});

// Same rationale as the blocks above (no DB test harness) — these guard the
// citizen Report Tracking feature's two hard requirements: (1) a citizen can
// only ever read their own reports, (2) the query never selects a column
// that would leak fraud-detection internals or another citizen's data to
// the frontend. Both are asserted on the SQL template text itself, scoped
// to just the getMyReports/getMyReportDetail method bodies so an unrelated
// query elsewhere in the file can't accidentally satisfy the assertion.
describe('citizen report-tracking ownership and data exposure (getMyReports/getMyReportDetail)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  function methodBody(name: string): string {
    const start = reportsServiceSource.indexOf(`async ${name}(`);
    if (start === -1)
      throw new Error(`method ${name} not found in reports.service.ts`);
    const nextMethodMarkers = ['\n  async ', '\n}'];
    const ends = nextMethodMarkers
      .map((marker) => reportsServiceSource.indexOf(marker, start + 1))
      .filter((i) => i !== -1);
    const end = Math.min(...ends);
    return reportsServiceSource.slice(start, end);
  }

  const getMyReports = methodBody('getMyReports');
  const getMyReportDetail = methodBody('getMyReportDetail');

  it('getMyReports scopes to the requesting citizen only', () => {
    expect(getMyReports).toMatch(/WHERE r\.citizen_id = \$\{citizenId\}/);
  });

  it('getMyReportDetail scopes to the requesting citizen only (ownership + existence in one clause)', () => {
    expect(getMyReportDetail).toMatch(
      /WHERE r\.id = \$\{reportId\} AND r\.citizen_id = \$\{citizenId\}/,
    );
  });

  const CITIZEN_UNSAFE_COLUMNS = [
    'exif_data',
    'r.flags',
    'image_phash',
    'location_mismatch_m',
    'moderation_note',
    'moderated_by',
    'elevation_factor',
    'precipitation_factor',
    'cluster_factor',
    // Admin-only dispute reasoning and work-order internals — never surfaced
    // to the citizen who submitted the report (see the Case Closure Summary
    // card's scope: status/notes/photo/date/feedback state only).
    'dispute_reason',
    'work_orders',
  ];

  it.each(CITIZEN_UNSAFE_COLUMNS)('getMyReports never selects %s', (column) => {
    expect(getMyReports).not.toContain(column);
  });

  it.each(CITIZEN_UNSAFE_COLUMNS)(
    'getMyReportDetail never selects %s',
    (column) => {
      expect(getMyReportDetail).not.toContain(column);
    },
  );

  const EXPECTED_ROW_FIELDS = [
    't.assigned_office',
    't.member_count',
    'r.moderation_status',
  ];

  it.each(EXPECTED_ROW_FIELDS)(
    'getMyReports selects %s for the list view',
    (field) => {
      expect(getMyReports).toContain(field);
    },
  );

  it.each([
    ...EXPECTED_ROW_FIELDS,
    'r.moderated_at',
    't.resolution_notes',
    't.resolution_image_url',
  ])('getMyReportDetail selects %s', (field) => {
    expect(getMyReportDetail).toContain(field);
  });

  it("both queries derive is_merged from this report being later than the ticket's earliest report, not a stored column", () => {
    const isMergedPattern =
      /r\.id != \(SELECT MIN\(id\) FROM reports WHERE ticket_id = r\.ticket_id\) AS is_merged/;
    expect(getMyReports).toMatch(isMergedPattern);
    expect(getMyReportDetail).toMatch(isMergedPattern);
  });

  it("getMyReportDetail exposes disputed_at and resolution_confirmed_at so the UI can hide the feedback prompt once already resolved-feedback'd", () => {
    expect(getMyReportDetail).toContain('t.disputed_at');
    expect(getMyReportDetail).toContain('t.resolution_confirmed_at');
  });

  // Batch 2 (Focal intake): the citizen timeline needs to know whether/when
  // Focal acknowledged this specific report — sourced directly from
  // report_acknowledgments.acknowledged_at (never derived from the first
  // intake action; see FocalIntakeService.deriveIntakeState's own docblock
  // for why those are deliberately different sources of truth).
  it('getMyReportDetail sources acknowledgedAt directly from report_acknowledgments, via LEFT JOIN so an unacknowledged report still returns', () => {
    expect(getMyReportDetail).toMatch(
      /LEFT JOIN report_acknowledgments ra ON ra\.report_id = r\.id/,
    );
    expect(getMyReportDetail).toContain('ra.acknowledged_at');
  });

  // Note: methodBody's slice runs up to the next `\n  async `, which also
  // sweeps up disputeReport's own leading docblock comment (a pre-existing
  // quirk of this helper, not something to fix here) — so this assertion
  // deliberately checks only fields the SQL template itself could contain,
  // not words that might legitimately appear in a neighboring comment.
  it('getMyReportDetail never exposes Focal-internal intake data (actions, remarks, actor identity)', () => {
    expect(getMyReportDetail).not.toContain('report_intake_actions');
    expect(getMyReportDetail).not.toContain('acknowledged_by_admin_id');
    expect(getMyReportDetail).not.toContain('acknowledged_by_name');
    expect(getMyReportDetail).not.toContain('ra.remarks');
  });
});

// Same rationale as the blocks above (no DB test harness) — the citizen
// resolution-feedback/dispute loop (CLAUDE.md: a workflow signal layered on
// top of Resolved, never a scoring input) is asserted on source text: the
// ownership+existence clause, the resolved-only and duplicate-dispute
// guards, the race-safe UPDATE, and the notification wiring.
describe('disputeReport (citizen resolution-feedback loop)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  function methodBody(name: string): string {
    const start = reportsServiceSource.indexOf(`async ${name}(`);
    if (start === -1)
      throw new Error(`method ${name} not found in reports.service.ts`);
    const nextMethodMarkers = ['\n  async ', '\n}'];
    const ends = nextMethodMarkers
      .map((marker) => reportsServiceSource.indexOf(marker, start + 1))
      .filter((i) => i !== -1);
    const end = Math.min(...ends);
    return reportsServiceSource.slice(start, end);
  }

  const disputeReport = methodBody('disputeReport');

  it('scopes to the requesting citizen only (ownership + existence in one clause)', () => {
    expect(disputeReport).toMatch(
      /WHERE r\.id = \$\{reportId\} AND r\.citizen_id = \$\{citizenId\}/,
    );
  });

  it('only allows disputes on resolved tickets', () => {
    expect(disputeReport).toMatch(/row\.status !== 'Resolved'/);
    expect(disputeReport).toContain('Only resolved tickets can be disputed.');
  });

  it('rejects a duplicate active dispute both before and via the race-safe UPDATE guard', () => {
    expect(disputeReport).toMatch(/if \(row\.disputed_at\)/);
    expect(disputeReport).toMatch(
      /WHERE id = \$\{row\.ticket_id\} AND disputed_at IS NULL/,
    );
  });

  it('never touches urgency_score, priority_score, priority_index, or urgency_band', () => {
    for (const column of [
      'urgency_score',
      'priority_score',
      'priority_index',
      'urgency_band',
    ]) {
      expect(disputeReport).not.toContain(column);
    }
  });

  it('does not roll ticket.status back — only sets disputed_at/dispute_reason', () => {
    expect(disputeReport).toMatch(
      /SET disputed_at = now\(\), dispute_reason = \$\{trimmedReason\}/,
    );
    expect(disputeReport).not.toMatch(/SET\s+status\s*=/);
  });

  it('rejects a reason over TICKET_DISPUTE_REASON_MAX_LENGTH via the named constant, not a bare literal', () => {
    expect(reportsServiceSource).toMatch(
      /import\s*{\s*TICKET_DISPUTE_REASON_MAX_LENGTH\s*}\s*from\s*['"]\.\.\/contracts\/schemas['"]/,
    );
    expect(disputeReport).toMatch(
      /trimmedReason\.length > TICKET_DISPUTE_REASON_MAX_LENGTH/,
    );
    expect(disputeReport).not.toMatch(/trimmedReason\.length > 1000/);
  });

  it('creates an office-targeted admin notification linking to the admin ticket detail, inside the same transaction', () => {
    expect(disputeReport).toMatch(/this\.notifications\.createInTx\(tx,/);
    expect(disputeReport).toMatch(
      /recipientType: 'admin',[\s\S]*?recipientOffice: row\.assigned_office,[\s\S]*?type: 'ticket_disputed'/,
    );
    expect(disputeReport).toMatch(
      /href: `\/admin\/tickets\/\$\{row\.ticket_id\}`/,
    );
  });
});

// Same rationale as the block above — the positive-path resolution
// confirmation (CLAUDE.md: a workflow signal layered on top of Resolved,
// never a scoring input) mirrors disputeReport's ownership/resolved-only/
// race-safe-UPDATE shape, plus its own already-disputed and
// already-confirmed guards.
describe('confirmResolution (citizen resolution-feedback loop, positive path)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  function methodBody(name: string): string {
    const start = reportsServiceSource.indexOf(`async ${name}(`);
    if (start === -1)
      throw new Error(`method ${name} not found in reports.service.ts`);
    const nextMethodMarkers = ['\n  async ', '\n}'];
    const ends = nextMethodMarkers
      .map((marker) => reportsServiceSource.indexOf(marker, start + 1))
      .filter((i) => i !== -1);
    const end = Math.min(...ends);
    return reportsServiceSource.slice(start, end);
  }

  const confirmResolution = methodBody('confirmResolution');

  it('scopes to the requesting citizen only (ownership + existence in one clause)', () => {
    expect(confirmResolution).toMatch(
      /WHERE r\.id = \$\{reportId\} AND r\.citizen_id = \$\{citizenId\}/,
    );
  });

  it('only allows confirmation on resolved tickets', () => {
    expect(confirmResolution).toMatch(/row\.status !== 'Resolved'/);
    expect(confirmResolution).toContain(
      'Only resolved tickets can be confirmed.',
    );
  });

  it('rejects confirmation when the ticket is already disputed', () => {
    expect(confirmResolution).toMatch(/if \(row\.disputed_at\)/);
  });

  it('rejects a duplicate confirmation both before and via the race-safe UPDATE guard', () => {
    expect(confirmResolution).toMatch(/if \(row\.resolution_confirmed_at\)/);
    expect(confirmResolution).toMatch(
      /WHERE id = \$\{row\.ticket_id\} AND resolution_confirmed_at IS NULL AND disputed_at IS NULL/,
    );
  });

  it('never touches urgency_score, priority_score, priority_index, or urgency_band', () => {
    for (const column of [
      'urgency_score',
      'priority_score',
      'priority_index',
      'urgency_band',
    ]) {
      expect(confirmResolution).not.toContain(column);
    }
  });

  it('does not roll ticket.status back — only sets resolution_confirmed_at', () => {
    expect(confirmResolution).toMatch(/SET resolution_confirmed_at = now\(\)/);
    expect(confirmResolution).not.toMatch(/SET\s+status\s*=/);
  });
});

// Same rationale as the blocks above (no DB test harness) — hardening item
// 5: computeDHash now returns string | null (MediaService degrades
// gracefully on a malformed image instead of throwing), so the duplicate-
// image scan must not reach hammingDistanceHex with a null phash. Asserted
// on source text since exercising submit() end-to-end would need the same
// DB-mocking framework this file's other guards already avoid building.
describe('duplicate-image scan is guarded against a null phash (hardening item 5)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  it('wraps the recent-phashes query and hammingDistanceHex scan in a phash !== null check', () => {
    const scanStart = reportsServiceSource.indexOf('recentPhashes');
    const guardStart = reportsServiceSource.lastIndexOf(
      'if (phash !== null)',
      scanStart,
    );
    expect(guardStart).toBeGreaterThan(-1);

    const hammingCallIndex = reportsServiceSource.indexOf(
      'hammingDistanceHex(phash,',
      scanStart,
    );
    expect(hammingCallIndex).toBeGreaterThan(scanStart);

    // No unrelated code (e.g. the Cloudinary upload) sits between the guard
    // opening and the hammingDistanceHex call — confirms the whole scan,
    // not just part of it, is inside the null check.
    const between = reportsServiceSource.slice(guardStart, hammingCallIndex);
    expect(between).not.toContain('uploadImage');
  });

  it('still computes EXIF and phash unconditionally before the guard (upload/report creation are not skipped)', () => {
    expect(reportsServiceSource).toMatch(
      /const exif = await this\.media\.extractExif\(imageBuffer\);\s*\n\s*const phash = await this\.media\.computeDHash\(imageBuffer\);/,
    );
    expect(reportsServiceSource).toMatch(
      /const imageUrl = await this\.media\.uploadImage\(imageBuffer\);/,
    );
  });
});

// Manuscript revision Phase 1, step 6c: citizens are shown no system score.
// The my-reports list, my-report detail and public map queries select no
// Hazard Urgency (and no Operational Priority) column, and the submit
// response no longer returns the elevation. Source-text assertions, same
// rationale as the blocks above (no DB harness for these queries).
describe('citizen responses carry no system score (Phase 1, step 6c)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const SYSTEM_SCORE_COLUMNS =
    /urgency_band|urgency_score|priority_score|urgency_level|priority_index/;

  function methodBody(name: string): string {
    const start = reportsServiceSource.indexOf(`async ${name}(`);
    if (start === -1)
      throw new Error(`method ${name} not found in reports.service.ts`);
    const ends = ['\n  async ', '\n}']
      .map((marker) => reportsServiceSource.indexOf(marker, start + 1))
      .filter((i) => i !== -1);
    // Comment lines dropped: the next method's doc comment falls inside the
    // slice and legitimately names these columns.
    return reportsServiceSource
      .slice(start, Math.min(...ends))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
  }

  it.each(['getMyReports', 'getMyReportDetail', 'getPublicHazardMapData'])(
    '%s selects no Hazard Urgency or Operational Priority column',
    (name) => {
      expect(methodBody(name)).not.toMatch(SYSTEM_SCORE_COLUMNS);
    },
  );

  it('the submit response has no elevationM key', () => {
    const returned = reportsServiceSource.match(
      /return \{\s*reportId: result\.reportId[\s\S]*?\};/,
    );
    expect(returned).not.toBeNull();
    expect(returned![0]).toContain('barangay: barangay.name');
    expect(returned![0]).not.toMatch(/elevationM/);

    const resultType = reportsServiceSource.slice(
      reportsServiceSource.indexOf('export interface SubmitReportResult'),
      reportsServiceSource.indexOf('export interface MyReportRow'),
    );
    expect(resultType).not.toMatch(/elevationM\s*:/);
  });
});

// Manuscript revision Phase 1, step 6d (Appendix L, Citizen Web-GIS Map;
// Table 12): the public map is a privacy-limited view. Other citizens'
// reports send no title, photo or exact pin — coordinates are rounded on the
// server — and only the fields the wireframe's "Selected report" panel shows.
describe('public map privacy-limited view (Phase 1, step 6d)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const start = reportsServiceSource.indexOf('async getPublicHazardMapData(');
  // Comment lines dropped so the method's own explanatory comments (which
  // name the excluded fields) can't satisfy or trip the assertions.
  const method = reportsServiceSource
    .slice(start, reportsServiceSource.indexOf('\n}', start))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const ticketSelect = method.slice(
    method.indexOf('t.id, t.category'),
    method.indexOf('FROM tickets t'),
  );

  it('rounds the coordinates to 3 decimal places on the server', () => {
    expect(method).toContain('ROUND(ST_Y(t.geom)::numeric, 3)');
    expect(method).toContain('ROUND(ST_X(t.geom)::numeric, 3)');
    expect(method).not.toMatch(/(?<!ROUND\()ST_[XY]\(t\.geom\)/);
  });

  it('never selects the title, photo, description, reporter, EXIF, flags, scores or notes', () => {
    expect(method).not.toMatch(/\btitle\b|image_url|description/);
    expect(ticketSelect).not.toMatch(
      /citizen_id|exif|flags|urgency_|priority_|notes/,
    );
  });

  it('still selects own_report_id, assigned_office, created_at and updated_at', () => {
    expect(ticketSelect).toContain('own.id AS own_report_id');
    expect(ticketSelect).toContain('t.assigned_office');
    expect(ticketSelect).toContain('t.created_at AS reported_at');
    expect(ticketSelect).toContain('t.updated_at AS last_updated_at');
  });
});
