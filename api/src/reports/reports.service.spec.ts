import { readFileSync } from 'fs';
import { basename, join } from 'path';
import type { Sql, TransactionSql } from 'postgres';
import {
  LOCATION_MISMATCH_THRESHOLD_M,
  OUTSIDE_MUNICIPALITY_MESSAGE,
  ReportsService,
  STALE_EVIDENCE_CATEGORIES,
  STALE_EVIDENCE_HOURS,
  TIMESTAMP_ANOMALY_TOLERANCE_HOURS,
  evidenceCheckFlags,
  withPublicMapPositionKeys,
} from './reports.service';
import type { BarangayService } from '../domain/barangay.service';
import type { MediaService } from '../domain/media.service';
import type { RateLimitService } from '../domain/ratelimit.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type { HazardInformationService } from '../domain/hazard-information.service';
import type { NotificationsService } from '../notifications/notifications.service';

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
      /category\} report in \$\{barangay\.name\}[\s\S]*?Ticket #\$\{ticket\.id\}, Report \$\{report\.tracking_reference\}/,
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
    // Phase 2, step 2e: Focal is picked by account type, never by role.
    expect(method).toMatch(
      /account_type = 'PERSONNEL' AND is_focal = true AND is_active = true/,
    );
    expect(method).not.toMatch(/\brole\b/);
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
    // Appendix H tracking reference (manuscript revision Phase 2, step 2b).
    'r.tracking_reference',
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
    // Manuscript revision Phase 5, step 5c: the page's resolved date.
    't.resolved_at',
  ])('getMyReportDetail selects %s', (field) => {
    expect(getMyReportDetail).toContain(field);
  });

  // Manuscript revision Phase 5, step 5c added staff-only status_history
  // columns (from_status, the return reason, the resolution snapshot), and
  // since Phase 6, step 6b the staff name is gone too. The citizen's three
  // queries, as actually executed, are pinned exactly: the history sends
  // status, changed_at and a computed returned boolean only; referrals send
  // the mapped agency and date only; the raw outcome code is mapped and
  // dropped.
  describe('getMyReportDetail, as actually executed (Phase 6, step 6b)', () => {
    function run(detailRow: Record<string, unknown>) {
      const texts: string[] = [];
      const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        if (values.some((v) => v instanceof Date)) {
          throw new Error('A JS Date was passed to raw SQL');
        }
        const text = strings.join('?');
        texts.push(text);
        const rows = text.includes('FROM status_history')
          ? [
              { status: 'Resolved', changed_at: 'a', returned: false },
              { status: 'Under Review', changed_at: 'b', returned: true },
            ]
          : text.includes('FROM routing_actions')
            ? [
                { referral_target: 'dpwh', created_at: 'c' },
                { referral_target: 'Porac Water District', created_at: 'd' },
                { referral_target: null, created_at: 'e' },
              ]
            : [detailRow];
        return {
          then(resolve: (v: unknown) => void) {
            void Promise.resolve(rows).then(resolve);
          },
        };
      }) as unknown as Sql;
      const service = new ReportsService(
        sql,
        {} as BarangayService,
        {} as MediaService,
        {} as RateLimitService,
        {} as OperationalPriorityService,
        {} as NotificationsService,
        {} as HazardInformationService,
      );
      return { texts, result: service.getMyReportDetail(1, 2) };
    }

    const resolvedRow = {
      id: 2,
      ticket_id: 9,
      status: 'Resolved',
      resolved_at: '2026-11-01T00:00:00.000Z',
      outcome_code: 'EXTERNAL_REFERRAL',
    };

    it('pins the history query to status, changed_at and the computed returned flag', async () => {
      const { texts, result } = run(resolvedRow);
      await result;
      const history = texts.find((t) => t.includes('FROM status_history'))!;
      expect(history.replace(/\r\n/g, '\n').trim()).toBe(
        "SELECT status, changed_at, COALESCE(from_status = 'Resolved' AND status = 'Under Review', false) AS returned\n      FROM status_history WHERE ticket_id = ? ORDER BY changed_at, id",
      );
      expect(history).not.toMatch(
        /admin_name|admin_id|\breason\b|resolution_|\*/,
      );
    });

    it('pins the referral query to the target (to map) and the date', async () => {
      const { texts, result } = run(resolvedRow);
      await result;
      const referrals = texts.find((t) => t.includes('FROM routing_actions'))!;
      expect(referrals.replace(/\r\n/g, '\n').trim()).toBe(
        "SELECT referral_target, created_at FROM routing_actions\n      WHERE ticket_id = ? AND action_type = 'REFER'\n      ORDER BY created_at, id",
      );
    });

    it('the detail query reads no staff name, return reason, snapshot, resolver or remarks', async () => {
      const { texts, result } = run(resolvedRow);
      await result;
      const detail = texts[0];
      expect(detail).not.toMatch(
        /admin_name|from_status|sh\.|resolved_by|acknowledged_by|remarks|referral_target|routing_actions/,
      );
      // The outcome code is read only under an internal alias, to be mapped.
      expect(detail.match(/resolution_outcome/g)).toHaveLength(1);
      expect(detail).toContain('t.resolution_outcome AS outcome_code');
    });

    it('returns exactly report, history and referrals, with the outcome mapped and no raw code', async () => {
      const { result } = run(resolvedRow);
      const response = (await result)!;
      expect(Object.keys(response).sort()).toEqual([
        'history',
        'referrals',
        'report',
      ]);
      expect(response.report).not.toHaveProperty('outcome_code');
      expect(response.report.outcome).toBe('REFERRED_OUTSIDE');
      expect(JSON.stringify(response)).not.toMatch(/EXTERNAL_REFERRAL/);
      for (const step of response.history) {
        expect(Object.keys(step).sort()).toEqual([
          'changed_at',
          'returned',
          'status',
        ]);
      }
      expect(response.history.map((s) => s.returned)).toEqual([false, true]);
      expect(response.referrals).toEqual([
        { agency: 'DPWH', referred_at: 'c' },
        { agency: 'an outside agency', referred_at: 'd' },
        { agency: 'an outside agency', referred_at: 'e' },
      ]);
      expect(JSON.stringify(response.referrals)).not.toMatch(
        /Porac Water District/,
      );
    });

    it('a legacy Resolved ticket (no resolved_at) gets no outcome', async () => {
      const { result } = run({
        ...resolvedRow,
        resolved_at: null,
        outcome_code: 'MUNICIPAL_ACTION_COMPLETED',
      });
      expect((await result)!.report.outcome).toBeNull();
    });

    it('a missing or not-owned report returns null without reading history or referrals', async () => {
      const texts: string[] = [];
      const sql = ((strings: TemplateStringsArray) => {
        texts.push(strings.join('?'));
        return {
          then(resolve: (v: unknown) => void) {
            void Promise.resolve([]).then(resolve);
          },
        };
      }) as unknown as Sql;
      const service = new ReportsService(
        sql,
        {} as BarangayService,
        {} as MediaService,
        {} as RateLimitService,
        {} as OperationalPriorityService,
        {} as NotificationsService,
        {} as HazardInformationService,
      );
      expect(await service.getMyReportDetail(1, 2)).toBeNull();
      expect(texts).toHaveLength(1);
    });
  });

  // Phase 6, step 6b: is_merged comes from the ticket_merged audit event
  // that moved this report onto its ticket; the "not the earliest report"
  // rule is only the fallback for a ticket with no such event (the legacy
  // automatic merge). Only a boolean and a time leave the query.
  it('getMyReportDetail derives is_merged from the merge event, with the legacy rule only as the fallback', () => {
    expect(getMyReportDetail).toMatch(
      /WHEN te\.has_event THEN me\.merged_at IS NOT NULL\s+ELSE r\.id != \(SELECT MIN\(id\) FROM reports WHERE ticket_id = r\.ticket_id\)\s+END AS is_merged/,
    );
    expect(getMyReportDetail).toMatch(
      /e\.action_type = 'ticket_merged'\s+AND e\.metadata->'movedReportIds' @> to_jsonb\(r\.id\)/,
    );
    expect(getMyReportDetail).toContain(
      'GREATEST(t.member_count - 1, 0)::int AS other_reports_count',
    );
    // The id list itself is never selected.
    expect(getMyReportDetail).not.toMatch(/metadata->'movedReportIds'\s+AS/);
    expect(getMyReportDetail).not.toMatch(/e\.metadata\s+AS|e\.metadata,/);
  });

  it('getMyReports keeps the legacy is_merged rule (the list view is unchanged in step 6b)', () => {
    expect(getMyReports).toMatch(
      /r\.id != \(SELECT MIN\(id\) FROM reports WHERE ticket_id = r\.ticket_id\) AS is_merged/,
    );
  });

  // Manuscript revision Phase 3, step 3g: only the citizen's OWN answer (the
  // join is on the report's own citizen), never the ticket-level flag
  // another citizen's answer may have set.
  it("getMyReportDetail returns only this citizen's own resolution feedback, not the ticket-level flags", () => {
    expect(getMyReportDetail).toMatch(
      /LEFT JOIN resolution_feedback rf ON rf\.ticket_id = r\.ticket_id AND rf\.citizen_id = r\.citizen_id/,
    );
    expect(getMyReportDetail).toContain('AS my_feedback');
    expect(getMyReportDetail).not.toContain('t.disputed_at');
    expect(getMyReportDetail).not.toContain('t.resolution_confirmed_at');
  });

  // Batch 2 (Focal intake): the citizen timeline needs to know whether/when
  // Focal acknowledged this specific report — sourced directly from
  // report_acknowledgments.acknowledged_at (never derived from the first
  // intake action; see FocalIntakeService.deriveIntakeState's own docblock
  // for why those are deliberately different sources of truth).
  // Phase 6, step 6b: the ticket-level acknowledgment (Appendix H
  // ACKNOWLEDGMENTS) of the report's current ticket and of the ticket a
  // merge moved it from (the row stays on the old ticket id), plus the
  // per-report row as the legacy fallback — the earliest, and a ticket-level
  // row only when it is not earlier than the report. All LEFT JOINs, so an
  // unacknowledged report still returns.
  it('getMyReportDetail takes the earliest of the per-report, current-ticket and pre-merge-ticket acknowledgments', () => {
    expect(getMyReportDetail).toMatch(
      /LEFT JOIN report_acknowledgments ra ON ra\.report_id = r\.id/,
    );
    expect(getMyReportDetail).toMatch(
      /LEFT JOIN acknowledgments ta ON ta\.ticket_id = r\.ticket_id/,
    );
    expect(getMyReportDetail).toMatch(
      /LEFT JOIN acknowledgments oa ON oa\.ticket_id = me\.from_ticket_id/,
    );
    expect(getMyReportDetail).toMatch(
      /LEAST\(\s+ra\.acknowledged_at,\s+CASE WHEN ta\.acknowledged_at >= r\.created_at THEN ta\.acknowledged_at END,\s+CASE WHEN oa\.acknowledged_at >= r\.created_at THEN oa\.acknowledged_at END\s+\) AS acknowledged_at/,
    );
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

// Per-citizen resolution feedback (manuscript revision Phase 3, step 3g):
// the rules themselves are tested by behavior in resolution-feedback.spec.ts.
// These source-text checks keep the wiring that test's stand-in can't see:
// the ownership clause both routes share, the reason limit's named
// constant, and no scoring column or status change anywhere on the path.
describe('resolution feedback wiring (citizen resolution-feedback loop)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  // Up to the next method, comment lines dropped (a neighbouring method's
  // doc comment falls inside the slice).
  function methodBody(name: string): string {
    const start = reportsServiceSource.indexOf(`async ${name}(`);
    if (start === -1)
      throw new Error(`method ${name} not found in reports.service.ts`);
    const ends = ['\n  async ', '\n}']
      .map((marker) => reportsServiceSource.indexOf(marker, start + 1))
      .filter((i) => i !== -1);
    return reportsServiceSource
      .slice(start, Math.min(...ends))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
  }

  const disputeReport = methodBody('disputeReport');
  const confirmResolution = methodBody('confirmResolution');
  const ticketOfMyReport = methodBody('ticketOfMyReport');
  const answerResolution = methodBody('answerResolution');

  it('both routes check report ownership in one clause, then answer for its ticket', () => {
    expect(ticketOfMyReport).toMatch(
      /WHERE r\.id = \$\{reportId\} AND r\.citizen_id = \$\{citizenId\}/,
    );
    for (const body of [disputeReport, confirmResolution]) {
      expect(body).toMatch(/this\.ticketOfMyReport\(citizenId, reportId\)/);
      expect(body).toMatch(/this\.answerResolution\(/);
    }
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

  it('never touches urgency_score, priority_score, priority_index, urgency_band or the status', () => {
    for (const body of [disputeReport, confirmResolution, answerResolution]) {
      expect(body).not.toMatch(
        /urgency_score|priority_score|priority_index|urgency_band/,
      );
      expect(body).not.toMatch(/SET\s+status\s*=/);
    }
  });

  it('the dispute notification links to the admin ticket detail, inside the same transaction', () => {
    expect(answerResolution).toMatch(/this\.notifications\.createInTx\(tx,/);
    expect(answerResolution).toMatch(
      /recipientType: 'admin',[\s\S]*?recipientOffice: ticket\.assigned_office,[\s\S]*?type: 'ticket_disputed'/,
    );
    expect(answerResolution).toMatch(
      /href: `\/admin\/tickets\/\$\{ticket\.ticket_id\}`/,
    );
  });

  it('the dispute notification carries no citizen id', () => {
    const notification = answerResolution.slice(
      answerResolution.indexOf('createInTx('),
      answerResolution.indexOf('});', answerResolution.indexOf('createInTx(')),
    );
    expect(notification).not.toMatch(/citizenId|citizen_id|recipientId/);
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

// The public map is a privacy-limited view (manuscript Appendix L, Citizen
// Web-GIS Map; Table 12; handoff Decision 8). Since manuscript revision
// Phase 6, step 6a another citizen's active report sends only its category,
// status, barangay, rounded pin and reported date, under an opaque
// per-response position key — no ticket number, tracking reference,
// last-updated time or assigned office. own_report_id is the signed-in
// citizen's own report id on their own tickets only.
const PUBLIC_MAP_ROW_KEYS = [
  'barangay_name',
  'category',
  'key',
  'lat',
  'lng',
  'own_report_id',
  'reported_at',
  'status',
];

describe('public map privacy-limited view (Phase 6, step 6a)', () => {
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
  const ticketFrom = method.indexOf('FROM tickets t');
  const ticketSelect = method.slice(
    method.lastIndexOf('SELECT', ticketFrom) + 'SELECT'.length,
    ticketFrom,
  );

  // The output column names of the ticket SELECT, in order: the alias after
  // AS, or the bare column name. Commas inside ROUND(...) are not item
  // separators.
  function outputColumns(selectList: string): string[] {
    const items: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of selectList) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        items.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    items.push(current);
    return items
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => {
        const alias = item.match(/\bAS\s+(\w+)$/i);
        return alias ? alias[1] : item.slice(item.lastIndexOf('.') + 1);
      });
  }

  it('selects exactly the public columns: no ticket id, updated_at or assigned_office as output', () => {
    expect(outputColumns(ticketSelect)).toEqual([
      'category',
      'status',
      'barangay_name',
      'lat',
      'lng',
      'reported_at',
      'own_report_id',
    ]);
    expect(ticketSelect).not.toMatch(
      /\bt\.id\b|updated_at|assigned_office|tracking_reference/,
    );
  });

  it('rounds the coordinates to 3 decimal places on the server', () => {
    expect(method).toContain('ROUND(ST_Y(t.geom)::numeric, 3)');
    expect(method).toContain('ROUND(ST_X(t.geom)::numeric, 3)');
    expect(method).not.toMatch(/(?<!ROUND\()ST_[XY]\(t\.geom\)/);
  });

  it('never selects the title, photo, description, reporter, EXIF, flags, scores or notes', () => {
    expect(method).not.toMatch(/\btitle\b|image_url|description/);
    expect(ticketSelect).not.toMatch(
      /citizen_id|first_name|last_name|email|exif|flags|urgency_|priority_|notes|admin_name/,
    );
  });

  it('keeps the active-status, flagged and merged-away filters', () => {
    expect(method).toContain(
      "WHERE t.status IN ('Reported', 'Under Review', 'In Progress')",
    );
    expect(method).toContain('AND COALESCE(t.flagged, false) = false');
    expect(method).toContain('AND t.merged_into_ticket_id IS NULL');
  });

  it('orders by reported date with a random tiebreak, never by id', () => {
    expect(method).toContain('ORDER BY t.created_at DESC, random()');
    expect(method).not.toMatch(/ORDER BY[^\n]*\bt\.id\b/);
  });

  it('returns the rows only through withPublicMapPositionKeys', () => {
    expect(method).toContain('tickets: withPublicMapPositionKeys(tickets)');
  });

  describe('the response, as actually returned', () => {
    function fakeSql(ticketRows: Record<string, unknown>[]) {
      return ((strings: TemplateStringsArray, ...values: unknown[]) => {
        if (values.some((v) => v instanceof Date)) {
          throw new Error('A JS Date was passed to raw SQL');
        }
        const text = strings.join('?');
        const rows = text.includes('FROM barangays ORDER BY name')
          ? [
              {
                id: 1,
                name: 'Jalung',
                geojson: '{"type":"Point","coordinates":[0,0]}',
              },
            ]
          : ticketRows;
        return {
          then(resolve: (v: unknown) => void) {
            void Promise.resolve(rows).then(resolve);
          },
        };
      }) as unknown as Sql;
    }

    function serviceWith(sql: Sql): ReportsService {
      return new ReportsService(
        sql,
        {} as BarangayService,
        {} as MediaService,
        {} as RateLimitService,
        {} as OperationalPriorityService,
        {} as NotificationsService,
        {} as HazardInformationService,
      );
    }

    // Each DB row also carries fields the query must never send, as if a
    // column crept back in: the response still drops them.
    function dbRow(id: number, ownReportId: number | null) {
      return {
        id,
        ticket_id: id,
        tracking_reference: `PRC-2026-${String(id).padStart(6, '0')}`,
        title: `Report ${id}`,
        assigned_office: 'MEO',
        last_updated_at: '2026-11-02T00:00:00.000Z',
        category: 'Pothole / Road Surface Damage',
        status: 'Reported',
        barangay_name: 'Jalung',
        lat: 15.071,
        lng: 120.542,
        reported_at: `2026-11-0${id % 9}T00:00:00.000Z`,
        own_report_id: ownReportId,
      };
    }

    it('every row has exactly the public key set, and keys are positions, never ids', async () => {
      const result = await serviceWith(
        fakeSql([dbRow(41, null), dbRow(17, 905)]),
      ).getPublicHazardMapData(3);

      expect(result.tickets).toHaveLength(2);
      for (const row of result.tickets) {
        expect(Object.keys(row).sort()).toEqual(PUBLIC_MAP_ROW_KEYS);
      }
      expect(result.tickets.map((t) => t.key)).toEqual(['p1', 'p2']);
      const serialized = JSON.stringify(result.tickets);
      expect(serialized).not.toMatch(/"41"|"17"|\b41\b|\b17\b|PRC-/);
      expect(result.tickets[0].own_report_id).toBeNull();
      expect(result.tickets[1].own_report_id).toBe(905);
      expect(result.barangays.features).toHaveLength(1);
    });

    it('the same ticket gets a different key in another response', async () => {
      const first = await serviceWith(
        fakeSql([dbRow(41, null), dbRow(17, null)]),
      ).getPublicHazardMapData(3);
      // A newer ticket arrived, so ticket 41 is now second.
      const second = await serviceWith(
        fakeSql([dbRow(52, null), dbRow(41, null), dbRow(17, null)]),
      ).getPublicHazardMapData(3);

      const keyOf = (
        tickets: { key: string; reported_at: string }[],
        reportedAt: string,
      ) => tickets.find((t) => t.reported_at === reportedAt)?.key;
      const ticket41ReportedAt = dbRow(41, null).reported_at;
      expect(keyOf(first.tickets, ticket41ReportedAt)).toBe('p1');
      expect(keyOf(second.tickets, ticket41ReportedAt)).toBe('p2');
      // And p1 now names a different ticket.
      expect(second.tickets[0].reported_at).toBe(dbRow(52, null).reported_at);
    });
  });
});

describe('withPublicMapPositionKeys', () => {
  const base = {
    category: 'Localized Flooding',
    status: 'Under Review',
    barangay_name: 'Jalung',
    lat: 15.07,
    lng: 120.54,
    reported_at: '2026-11-01T00:00:00.000Z',
    own_report_id: null,
  };

  it('numbers the rows p1, p2, ... in the order given', () => {
    expect(
      withPublicMapPositionKeys([base, base, base]).map((r) => r.key),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns an empty list for no rows', () => {
    expect(withPublicMapPositionKeys([])).toEqual([]);
  });

  it('copies only the public fields, dropping anything else on the row', () => {
    const leaky = { ...base, id: 7, title: 'secret', assigned_office: 'MEO' };
    const [row] = withPublicMapPositionKeys([leaky]);
    expect(Object.keys(row).sort()).toEqual(PUBLIC_MAP_ROW_KEYS);
    expect(row).toEqual({ key: 'p1', ...base });
  });

  it('never derives the key from a database id', () => {
    const rows = [
      { ...base, own_report_id: 900 },
      { ...base, own_report_id: 3 },
    ];
    expect(withPublicMapPositionKeys(rows).map((r) => r.key)).toEqual([
      'p1',
      'p2',
    ]);
  });
});
// Manuscript revision Phase 1, step 7a: report submission no longer looks up
// elevation or live rain and writes no Hazard Urgency column; new rows leave
// them NULL until Phase 8 drops them. Operational Priority recalculation is
// unchanged. Source-text assertions, same rationale as the blocks above.
describe('submit() no longer calculates Hazard Urgency (Phase 1, step 7a)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const submitBody = reportsServiceSource.slice(
    reportsServiceSource.indexOf('  async submit('),
    reportsServiceSource.indexOf('  private async notifyFocalIntake('),
  );
  const ticketInsert = submitBody.slice(
    submitBody.indexOf('INSERT INTO tickets'),
    submitBody.indexOf(
      'RETURNING id',
      submitBody.indexOf('INSERT INTO tickets'),
    ),
  );
  const reportInsert = submitBody.slice(
    submitBody.indexOf('INSERT INTO reports'),
    submitBody.indexOf(
      'RETURNING id',
      submitBody.indexOf('INSERT INTO reports'),
    ),
  );

  it('makes no elevation, rain, urgency-formula or recompute call', () => {
    expect(submitBody).not.toMatch(
      /findNearestElevation|getCurrentRain1hMm|computeUrgency|recomputeActiveTicketUrgency/,
    );
    expect(submitBody).toContain(
      'await this.operationalPriority.recalculateActiveTickets();',
    );
  });

  it('names none of the eight Hazard Urgency columns in the ticket INSERT', () => {
    expect(ticketInsert.length).toBeGreaterThan(0);
    expect(ticketInsert).not.toMatch(
      /elevation_m|elevation_factor|precipitation_factor|cluster_factor|urgency_score|urgency_band|priority_score|urgency_level/,
    );
  });

  it('no longer writes the report elevation', () => {
    expect(reportInsert.length).toBeGreaterThan(0);
    expect(reportInsert).not.toMatch(/elevation_m/);
  });
});

// Manuscript revision Phase 2, step 2b (Appendix H): tracking_reference is
// generated only by the reports insert trigger (migration 0036), never in
// TypeScript, and is read back with RETURNING; submit() writes
// submitted_category and the ticket's initial_assigned_office explicitly
// (the triggers are the fallback for other insert paths). Source-text
// assertions, same rationale as the blocks above.
describe('tracking reference and initial routing fields (Phase 2, step 2b)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const submitBody = reportsServiceSource.slice(
    reportsServiceSource.indexOf('  async submit('),
    reportsServiceSource.indexOf('  private async notifyFocalIntake('),
  );
  const statement = (start: string) => {
    const i = submitBody.indexOf(start);
    return submitBody.slice(i, submitBody.indexOf('`;', i));
  };
  const reportInsert = statement('INSERT INTO reports');
  const ticketInsert = statement('INSERT INTO tickets');

  it('never builds the tracking reference in TypeScript', () => {
    expect(reportsServiceSource).not.toMatch(/['"`]PRC-/);
    expect(reportsServiceSource).not.toMatch(/padStart/);
    // The INSERT's column list leaves it to the trigger.
    const columnList = reportInsert.slice(0, reportInsert.indexOf(')'));
    expect(columnList).not.toContain('tracking_reference');
  });

  it('reads the trigger-generated reference back and returns it as trackingReference', () => {
    expect(reportInsert).toContain('RETURNING id, tracking_reference');
    expect(submitBody).toContain(
      'trackingReference: report.tracking_reference,',
    );
    expect(submitBody).toContain(
      'trackingReference: result.trackingReference,',
    );
    const resultType = reportsServiceSource.slice(
      reportsServiceSource.indexOf('export interface SubmitReportResult'),
      reportsServiceSource.indexOf('export interface MyReportRow'),
    );
    expect(resultType).toMatch(/trackingReference: string;/);
  });

  it("writes submitted_category as the citizen's chosen category", () => {
    expect(reportInsert).toMatch(/image_url, submitted_category,/);
    expect(reportInsert).toContain('${imageUrl}, ${category},');
  });

  it("writes the ticket's initial_assigned_office as the routed office", () => {
    expect(ticketInsert).toMatch(/assigned_office, initial_assigned_office,/);
    expect(ticketInsert).toContain('${barangay.id}, 1, ${office}, ${office},');
  });
});

// Phase 2, step 2b follow-up: new notifications name a report by its
// tracking reference instead of "Report #<id>" (stored notifications are
// never rewritten). Only the message text changed — type, link and
// recipients are as before.
describe('new notifications name the report by its tracking reference', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );

  it('the citizen submission receipt gives the tracking reference', () => {
    expect(reportsServiceSource).toMatch(
      /type: 'report_received',\s*title: 'Report received',\s*message: `Your report has been received and routed for municipal review\. Tracking reference: \$\{report\.tracking_reference\}\.`,\s*href: `\/dashboard\/reports\/\$\{report\.id\}`,/,
    );
  });

  it("the office's new-report notification names the report by its tracking reference", () => {
    expect(reportsServiceSource).toContain(
      'Ticket #${ticket.id}, Report ${report.tracking_reference}.',
    );
  });

  it('no notification text in reports.service.ts uses "Report #<id>" any more', () => {
    expect(reportsServiceSource).not.toMatch(/Report #\$\{/);
  });

  it('the Focal new-intake notification names the report by its tracking reference', async () => {
    const createInTx = jest.fn().mockResolvedValue(undefined);
    const service = new ReportsService(
      {} as Sql,
      {} as BarangayService,
      {} as MediaService,
      {} as RateLimitService,
      {} as OperationalPriorityService,
      { createInTx } as unknown as NotificationsService,
      {} as HazardInformationService,
    );
    // The only query notifyFocalIntake runs: the active Focal accounts.
    const tx = (() => ({
      then(resolve: (v: unknown) => void) {
        void Promise.resolve([{ id: 5 }, { id: 6 }]).then(resolve);
      },
    })) as unknown as TransactionSql;

    await (
      service as unknown as {
        notifyFocalIntake: (
          tx: TransactionSql,
          params: {
            office: 'MEO' | 'MDRRMO';
            category: string;
            barangayName: string;
            ticketId: number;
            reportId: number;
            trackingReference: string;
          },
        ) => Promise<void>;
      }
    ).notifyFocalIntake(tx, {
      office: 'MEO',
      category: 'Damaged Manhole Cover',
      barangayName: 'Pio',
      ticketId: 12,
      reportId: 34,
      trackingReference: 'PRC-2026-000034',
    });

    expect(createInTx).toHaveBeenCalledTimes(2);
    const calls = createInTx.mock.calls as [unknown, Record<string, unknown>][];
    expect(calls[0][1]).toEqual({
      recipientType: 'admin',
      recipientId: 5,
      type: 'new_intake_report',
      title: 'New incoming report',
      message:
        'Damaged Manhole Cover report in Pio, routed to MEO — Ticket #12, Report PRC-2026-000034.',
      href: '/admin/focal/intake/34',
      entityType: 'report',
      entityId: 34,
    });
    expect(calls[1][1].recipientId).toBe(6);
  });
});

// Manuscript revision Phase 3, step 3b: the evidence-integrity rules
// (manuscript pp. 42–43), at every boundary.
describe('evidenceCheckFlags (Phase 3, step 3b)', () => {
  const SUBMITTED_AT = new Date('2026-10-20T06:00:00.000Z');
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const at = (offsetMs: number) => new Date(SUBMITTED_AT.getTime() + offsetMs);
  const check = (
    overrides: Partial<Parameters<typeof evidenceCheckFlags>[0]>,
  ) =>
    evidenceCheckFlags({
      locationMismatchM: null,
      capturedAt: at(-HOUR),
      submittedAt: SUBMITTED_AT,
      submittedCategory: 'Pothole / Road Surface Damage',
      ...overrides,
    });
  const STALE_LISTED = [
    'Localized Flooding',
    'Rain-Induced Slope Failure/Landslide',
    'Lahar or Volcanic Debris-Flow Threat',
    'Fallen Tree or Storm-Related Road Obstruction',
  ];
  const STALE_LEGACY = [
    'Flooding',
    'Landslide / Slope Failure',
    'Lahar / Debris-Flow Threat',
    'Fallen Tree / Storm-Related Obstruction',
    'Fallen Tree',
  ];

  it('uses the manuscript numbers and the group tolerance', () => {
    expect(LOCATION_MISMATCH_THRESHOLD_M).toBe(50);
    expect(STALE_EVIDENCE_HOURS).toBe(24);
    expect(TIMESTAMP_ANOMALY_TOLERANCE_HOURS).toBe(3);
    expect(STALE_EVIDENCE_CATEGORIES).toEqual([
      ...STALE_LISTED,
      ...STALE_LEGACY,
    ]);
  });

  it('does not flag a pin exactly 50 m from the photo GPS', () => {
    expect(check({ locationMismatchM: 50 })).toEqual([]);
  });

  it('flags LOCATION_MISMATCH at 50.1 m', () => {
    expect(check({ locationMismatchM: 50.1 })).toEqual(['LOCATION_MISMATCH']);
  });

  it('adds no location flag at all when the photo has no usable GPS', () => {
    expect(check({ locationMismatchM: null })).toEqual([]);
  });

  it.each(STALE_LISTED)(
    '%s: a photo taken exactly 24 h before submission is not stale',
    (category) => {
      expect(
        check({ submittedCategory: category, capturedAt: at(-24 * HOUR) }),
      ).toEqual([]);
    },
  );

  it.each(STALE_LISTED)(
    '%s: 24 h + 1 min before submission is STALE_EVIDENCE',
    (category) => {
      expect(
        check({
          submittedCategory: category,
          capturedAt: at(-24 * HOUR - MINUTE),
        }),
      ).toEqual(['STALE_EVIDENCE']);
    },
  );

  it.each(STALE_LEGACY)(
    'legacy %s is checked for staleness too',
    (category) => {
      expect(
        check({
          submittedCategory: category,
          capturedAt: at(-24 * HOUR - MINUTE),
        }),
      ).toEqual(['STALE_EVIDENCE']);
    },
  );

  it('a pothole photo is never stale, however old', () => {
    expect(check({ capturedAt: at(-24 * HOUR - MINUTE) })).toEqual([]);
    expect(check({ capturedAt: at(-365 * 24 * HOUR) })).toEqual([]);
  });

  it('a missing capture time is MISSING_METADATA only, with no staleness inferred', () => {
    expect(
      check({ capturedAt: null, submittedCategory: 'Localized Flooding' }),
    ).toEqual(['MISSING_METADATA']);
  });

  it('a capture time exactly 3 h after submission is not an anomaly', () => {
    expect(
      check({
        capturedAt: at(3 * HOUR),
        submittedCategory: 'Localized Flooding',
      }),
    ).toEqual([]);
  });

  it('3 h + 1 min after submission is TIMESTAMP_ANOMALY, and is not checked for staleness', () => {
    expect(
      check({
        capturedAt: at(3 * HOUR + MINUTE),
        submittedCategory: 'Localized Flooding',
      }),
    ).toEqual(['TIMESTAMP_ANOMALY']);
  });

  it('keeps the location flag first when a capture-time flag also applies', () => {
    expect(check({ locationMismatchM: 120, capturedAt: null })).toEqual([
      'LOCATION_MISMATCH',
      'MISSING_METADATA',
    ]);
  });
});

describe('submit() applies the Phase 3, step 3b evidence rules', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const submitSource = reportsServiceSource.slice(
    reportsServiceSource.indexOf('  async submit('),
    reportsServiceSource.indexOf('  private async notifyFocalIntake('),
  );

  it('runs evidenceCheckFlags on the category the citizen submitted', () => {
    expect(submitSource).toMatch(/\.\.\.evidenceCheckFlags\(\{/);
    expect(submitSource).toMatch(/submittedCategory: category,/);
    expect(submitSource).toMatch(/capturedAt: exif\.capturedAt,/);
  });

  it('no longer writes the retired NO_EXIF or STALE_PHOTO codes', () => {
    expect(reportsServiceSource).not.toMatch(/'NO_EXIF'|'STALE_PHOTO'/);
  });

  it('keeps DUPLICATE_IMAGE and BOUNDARY_FALLBACK as before', () => {
    expect(submitSource).toContain(
      'flags.push(`DUPLICATE_IMAGE:${duplicateMatch.id}`)',
    );
    expect(submitSource).toContain(
      '`BOUNDARY_FALLBACK:${barangay.name}:${Math.round(barangay.fallbackDistanceM ?? 0)}`',
    );
  });
});

// The 0040 migration and its check repeat the stale category list and the
// 50 m threshold in SQL; they must match submit()'s constants.
describe('0040_evidence_flags matches the submit() rules', () => {
  const drizzle = join(__dirname, '..', '..', 'drizzle');
  const categoryLists = (text: string) =>
    [...text.matchAll(/submitted_category (?:NOT )?IN \(([^)]*)\)/g)].map(
      (match) => [...match[1].matchAll(/'([^']*)'/g)].map((name) => name[1]),
    );

  it.each(['0040_evidence_flags.sql', '0040_evidence_flags.check.sql'])(
    '%s lists exactly STALE_EVIDENCE_CATEGORIES',
    (file) => {
      const lists = categoryLists(readFileSync(join(drizzle, file), 'utf8'));
      expect(lists.length).toBeGreaterThan(0);
      for (const list of lists) {
        expect(list).toEqual([...STALE_EVIDENCE_CATEGORIES]);
      }
    },
  );

  it.each(['0040_evidence_flags.sql', '0040_evidence_flags.check.sql'])(
    '%s uses the LOCATION_MISMATCH_THRESHOLD_M distance',
    (file) => {
      const thresholds = [
        ...readFileSync(join(drizzle, file), 'utf8').matchAll(
          /location_mismatch_m > (\d+)/g,
        ),
      ].map((match) => Number(match[1]));
      expect(thresholds.length).toBeGreaterThan(0);
      expect(new Set(thresholds)).toEqual(
        new Set([LOCATION_MISMATCH_THRESHOLD_M]),
      );
    },
  );
});

// Manuscript revision Phase 3, step 3f: Focal's severity screening is
// staff-only. No citizen query selects a screening column, and neither the
// citizen API nor its response types name one, so no citizen response can
// carry the status, remarks, screener or time.
describe('citizen responses carry no severity screening (Phase 3, step 3f)', () => {
  const SCREENING = /severity_screen|severityScreen|screening/i;
  const read = (...path: string[]) =>
    readFileSync(join(__dirname, ...path), 'utf8');

  it('reports.service.ts and reports.controller.ts never mention a screening field', () => {
    expect(read('reports.service.ts')).not.toMatch(SCREENING);
    expect(read('reports.controller.ts')).not.toMatch(SCREENING);
  });

  it('the citizen report types (lib/types/citizens-reports.ts) have no screening field', () => {
    expect(
      read('..', '..', '..', 'lib', 'types', 'citizens-reports.ts'),
    ).not.toMatch(SCREENING);
  });

  it.each(['getMyReports', 'getMyReportDetail', 'getPublicHazardMapData'])(
    '%s selects explicit columns only, never r.* or reports.*',
    (name) => {
      const source = read('reports.service.ts');
      const start = source.indexOf(`async ${name}(`);
      const body = source.slice(start, source.indexOf('\n  async ', start + 1));
      expect(body).toMatch(/SELECT/);
      expect(body).not.toMatch(/\br\.\*|\breports\.\*|SELECT \*/);
    },
  );
});

// Manuscript revision Phase 4, step 4b: DENR-MGB Hazard Information. The
// lookup is fired after the submission commits and never awaited, so a slow
// or failed source can't delay or fail a submission (the service's own
// never-throws and timeout behavior is pinned in
// hazard-information.service.spec.ts). Source-text assertions, same
// rationale as the blocks above.
describe('submit() and Hazard Information (Phase 4, step 4b)', () => {
  const reportsServiceSource = readFileSync(
    join(__dirname, 'reports.service.ts'),
    'utf8',
  );
  const submitBody = reportsServiceSource.slice(
    reportsServiceSource.indexOf('  async submit('),
    reportsServiceSource.indexOf('  private async notifyFocalIntake('),
  );

  it('fires the lookup for the new ticket after the transaction, not awaited', () => {
    const transactionEnd = submitBody.indexOf('// Step 8: post-commit');
    const trigger = submitBody.indexOf(
      'this.hazardInformation.triggerForNewTicket(result.ticketId, category);',
    );
    expect(transactionEnd).toBeGreaterThan(-1);
    expect(trigger).toBeGreaterThan(transactionEnd);
    expect(submitBody).not.toMatch(/await\s+this\.hazardInformation/);
    expect(submitBody.match(/this\.hazardInformation\./g) ?? []).toHaveLength(
      1,
    );
  });

  it('writes no hazard_information row itself', () => {
    expect(submitBody).not.toMatch(/hazard_information/);
  });
});

// Citizens never get Hazard Information: no citizen-facing service or
// controller reads the table or calls the service for data.
describe('citizen endpoints never include Hazard Information (Phase 4, step 4b)', () => {
  const sources = [
    join(__dirname, 'reports.service.ts'),
    join(__dirname, 'reports.controller.ts'),
    join(__dirname, '..', 'citizens', 'account.service.ts'),
    join(__dirname, '..', 'citizens', 'account.controller.ts'),
  ].map((file) => [basename(file), readFileSync(file, 'utf8')]);

  // reports.service.ts holds the service only to fire the lookup for a new
  // ticket (pinned above); it never reads a result.
  it.each(sources)(
    '%s never reads hazard_information or a hazard view',
    (_name, text) => {
      expect(text).not.toMatch(/hazard_information/);
      expect(text).not.toMatch(
        /getForTicket|forTicketDetail|HazardInformationView|\.retry\(/,
      );
    },
  );
});

// Manuscript revision Phase 4, step 4c: rainfall context. Submission has no
// rainfall trigger at all (only Ticket Detail, corrections and the staff
// Refresh refresh it), so a failed or hung weather call can never delay or
// fail a submission; and citizens never get rainfall from any endpoint.
describe('rainfall context stays out of submission and citizen endpoints (Phase 4, step 4c)', () => {
  const sources = [
    join(__dirname, 'reports.service.ts'),
    join(__dirname, 'reports.controller.ts'),
    join(__dirname, '..', 'citizens', 'account.service.ts'),
    join(__dirname, '..', 'citizens', 'account.controller.ts'),
  ].map((file) => [basename(file), readFileSync(file, 'utf8')]);

  it.each(sources)(
    '%s never reads rainfall_context or calls the rainfall service',
    (_name, text) => {
      expect(text).not.toMatch(/rainfall_context|RainfallContext/);
      expect(text).not.toMatch(/rainfall/i);
    },
  );
});
