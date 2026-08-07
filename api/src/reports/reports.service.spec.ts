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

// The duplicate-merge candidate query (Issue #4) sits behind ~7 injected
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
describe('duplicate-merge query wiring (Issue #4)', () => {
  const reportsServiceSource = readFileSync(join(__dirname, 'reports.service.ts'), 'utf8');

  it('imports the shared duplicate-merge window constant', () => {
    expect(reportsServiceSource).toMatch(
      /import\s*{\s*DUPLICATE_MERGE_WINDOW_DAYS\s*}\s*from\s*['"]\.\.\/common\/utils\/duplicate-detection['"]/,
    );
  });

  it("uses make_interval with the named constant, not a hardcoded interval literal", () => {
    expect(reportsServiceSource).toMatch(/make_interval\(days => \$\{DUPLICATE_MERGE_WINDOW_DAYS\}\)/);
    expect(reportsServiceSource).not.toMatch(/interval\s*'7 days'/);
    expect(reportsServiceSource).not.toMatch(/interval\s*"7 days"/);
  });

  it('retains the strict greater-than boundary against created_at', () => {
    expect(reportsServiceSource).toMatch(/created_at > now\(\) - make_interval/);
  });

  it('retains the active-status filter alongside the temporal cutoff', () => {
    expect(reportsServiceSource).toMatch(
      /status IN \('Reported', 'Under Review', 'In Progress'\)/,
    );
  });
});

// Same rationale as the block above — no DB test harness to mock this
// transaction end-to-end, so the atomicity guarantee (notification insert
// happens via `tx`, not a separate post-commit call) is asserted on the
// source text instead.
describe('notification wiring stays inside the submit transaction', () => {
  const reportsServiceSource = readFileSync(join(__dirname, 'reports.service.ts'), 'utf8');

  it('uses createInTx (not the standalone create()) for both the new-ticket and merge paths', () => {
    const matches = reportsServiceSource.match(/this\.notifications\.createInTx\(tx,/g);
    expect(matches).toHaveLength(3);
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
    ).toHaveLength(3);
    expect(reportsServiceSource).toMatch(
      /recipientType: 'admin',[\s\S]*?recipientOffice: office,[\s\S]*?type: 'new_citizen_report',[\s\S]*?title: 'New citizen report'/,
    );
    expect(reportsServiceSource).toMatch(
      /category\} report in \$\{barangay\.name\}[\s\S]*?Ticket #\$\{ticket\.id\}, Report #\$\{report\.id\}/,
    );
    expect(reportsServiceSource).toMatch(/href: `\/admin\/tickets\/\$\{ticket\.id\}`/);
  });

  it('keeps the admin new-report notification out of the duplicate-merge branch', () => {
    const mergeBranch = reportsServiceSource.slice(
      reportsServiceSource.indexOf('if (existing) {'),
      reportsServiceSource.indexOf('\n      const urgency = computeUrgency', reportsServiceSource.indexOf('if (existing) {')),
    );
    expect(mergeBranch).toContain("type: 'report_merged'");
    expect(mergeBranch).not.toContain("type: 'new_citizen_report'");
    expect(mergeBranch).not.toContain("title: 'New citizen report'");
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
    if (start === -1) throw new Error(`method ${name} not found in reports.service.ts`);
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
  ];

  it.each(CITIZEN_UNSAFE_COLUMNS)(
    'getMyReports never selects %s',
    (column) => {
      expect(getMyReports).not.toContain(column);
    },
  );

  it.each(CITIZEN_UNSAFE_COLUMNS)(
    'getMyReportDetail never selects %s',
    (column) => {
      expect(getMyReportDetail).not.toContain(column);
    },
  );

  const EXPECTED_ROW_FIELDS = ['t.assigned_office', 't.member_count', 'r.moderation_status'];

  it.each(EXPECTED_ROW_FIELDS)('getMyReports selects %s for the list view', (field) => {
    expect(getMyReports).toContain(field);
  });

  it.each([...EXPECTED_ROW_FIELDS, 'r.moderated_at', 't.resolution_notes'])(
    'getMyReportDetail selects %s',
    (field) => {
      expect(getMyReportDetail).toContain(field);
    },
  );

  it('both queries derive is_merged from this report being later than the ticket\'s earliest report, not a stored column', () => {
    const isMergedPattern = /r\.id != \(SELECT MIN\(id\) FROM reports WHERE ticket_id = r\.ticket_id\) AS is_merged/;
    expect(getMyReports).toMatch(isMergedPattern);
    expect(getMyReportDetail).toMatch(isMergedPattern);
  });
});
