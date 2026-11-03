import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CITIZEN_OUTCOMES,
  OUTSIDE_AGENCY,
  SUGGESTED_REFERRAL_AGENCIES,
  citizenOutcome,
  citizenReferralAgency,
  normalizeTrackingReference,
} from './citizen-report-view';

// Manuscript revision Phase 6, step 6b: what a citizen sees of their own
// report's ticket.
describe('citizenOutcome', () => {
  const resolvedAt = '2026-11-01T00:00:00.000Z';

  it('maps Municipal action completed to HANDLED_BY_MUNICIPALITY', () => {
    expect(
      citizenOutcome({
        status: 'Resolved',
        resolvedAt,
        outcomeCode: 'MUNICIPAL_ACTION_COMPLETED',
      }),
    ).toBe('HANDLED_BY_MUNICIPALITY');
  });

  it('maps External referral to REFERRED_OUTSIDE', () => {
    expect(
      citizenOutcome({
        status: 'Resolved',
        resolvedAt,
        outcomeCode: 'EXTERNAL_REFERRAL',
      }),
    ).toBe('REFERRED_OUTSIDE');
  });

  it('a legacy Resolved ticket (no resolved_at) has no outcome, whatever code 0036 gave it', () => {
    for (const outcomeCode of [
      'MUNICIPAL_ACTION_COMPLETED',
      'EXTERNAL_REFERRAL',
      null,
    ]) {
      expect(
        citizenOutcome({ status: 'Resolved', resolvedAt: null, outcomeCode }),
      ).toBeNull();
    }
  });

  it.each(['Reported', 'Under Review', 'In Progress', 'Rejected'])(
    'a %s ticket has no outcome',
    (status) => {
      expect(
        citizenOutcome({
          status,
          resolvedAt,
          outcomeCode: 'MUNICIPAL_ACTION_COMPLETED',
        }),
      ).toBeNull();
    },
  );

  it('an unknown or missing code has no outcome rather than a raw value', () => {
    expect(
      citizenOutcome({ status: 'Resolved', resolvedAt, outcomeCode: 'OTHER' }),
    ).toBeNull();
    expect(
      citizenOutcome({ status: 'Resolved', resolvedAt, outcomeCode: null }),
    ).toBeNull();
  });

  it('never returns a raw code', () => {
    expect(CITIZEN_OUTCOMES).toEqual([
      'HANDLED_BY_MUNICIPALITY',
      'REFERRED_OUTSIDE',
    ]);
  });
});

describe('citizenReferralAgency', () => {
  it.each(SUGGESTED_REFERRAL_AGENCIES)(
    'shows the suggested agency %s by name',
    (agency) => {
      expect(citizenReferralAgency(agency)).toBe(agency);
      expect(citizenReferralAgency(`  ${agency.toUpperCase()} `)).toBe(agency);
    },
  );

  it('shows a typed "Other" agency as an outside agency', () => {
    expect(citizenReferralAgency('Porac Water District')).toBe(OUTSIDE_AGENCY);
    expect(citizenReferralAgency('Juan at DPWH, call him')).toBe(
      OUTSIDE_AGENCY,
    );
    expect(citizenReferralAgency('Other')).toBe(OUTSIDE_AGENCY);
  });

  it('shows an unrecorded target as an outside agency', () => {
    expect(citizenReferralAgency(null)).toBe(OUTSIDE_AGENCY);
    expect(citizenReferralAgency('')).toBe(OUTSIDE_AGENCY);
  });

  it('matches the Refer dialog suggested list (minus "Other")', () => {
    const dialog = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'components',
        'features',
        'admin',
        'tickets',
        'routing',
        'ReferDialog.tsx',
      ),
      'utf8',
    );
    const list = dialog.match(/const SUGGESTED_AGENCIES = \[([^\]]*)\]/)?.[1];
    expect(list).toBeDefined();
    const names = [...list!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names.filter((n) => n !== 'Other')).toEqual([
      ...SUGGESTED_REFERRAL_AGENCIES,
    ]);
  });
});

// The citizen-facing types (lib/types/citizens-reports.ts) carry none of the
// staff-only status_history or routing fields, and no raw outcome code.
describe('citizen report types (Phase 6, step 6b)', () => {
  const types = readFileSync(
    join(__dirname, '..', '..', '..', 'lib', 'types', 'citizens-reports.ts'),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it.each([
    'admin_name',
    'from_status',
    'reason:',
    'resolution_outcome',
    'referral_target',
    'resolved_by',
    'remarks',
    'outcome_code',
  ])('has no %s field', (field) => {
    const detail = types.slice(
      types.indexOf('export interface MyReportDetail'),
    );
    // The citizen's own feedback reason (MyResolutionFeedback) is theirs.
    const withoutOwnFeedback = detail.replace(
      /export interface MyResolutionFeedback \{[^}]*\}/,
      '',
    );
    expect(withoutOwnFeedback).not.toContain(field);
  });
});

describe('normalizeTrackingReference', () => {
  it('accepts the PRC-YYYY-NNNNNN format, normalized to upper case', () => {
    expect(normalizeTrackingReference('PRC-2026-000123')).toBe(
      'PRC-2026-000123',
    );
    expect(normalizeTrackingReference('  prc-2026-1234567 ')).toBe(
      'PRC-2026-1234567',
    );
  });

  it.each([
    '',
    'PRC-2026-12345',
    'PRC-26-000123',
    'XYZ-2026-000123',
    'PRC-2026-000123; DROP TABLE reports',
    'PRC-2026-0001234567890',
    '123',
  ])('rejects %p', (input) => {
    expect(normalizeTrackingReference(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeTrackingReference(undefined)).toBeNull();
    expect(normalizeTrackingReference(123)).toBeNull();
  });
});
