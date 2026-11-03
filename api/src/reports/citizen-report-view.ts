// What a citizen may see of their own report's ticket (manuscript revision
// Phase 6, step 6b). Pure helpers, mapped on the server so the raw staff
// values (the resolution outcome code, a typed referral agency) never reach
// a citizen response.

// The resolution outcome, in citizen terms. Null while the ticket is not
// Resolved, and on a legacy Resolved ticket (resolved_at NULL, resolved
// before Phase 5, step 5c), which the page shows as a neutral "Resolved".
export const CITIZEN_OUTCOMES = [
  'HANDLED_BY_MUNICIPALITY',
  'REFERRED_OUTSIDE',
] as const;
export type CitizenOutcome = (typeof CITIZEN_OUTCOMES)[number];

export function citizenOutcome(input: {
  status: string;
  resolvedAt: string | Date | null;
  outcomeCode: string | null;
}): CitizenOutcome | null {
  if (input.status !== 'Resolved' || input.resolvedAt === null) return null;
  switch (input.outcomeCode) {
    case 'MUNICIPAL_ACTION_COMPLETED':
      return 'HANDLED_BY_MUNICIPALITY';
    case 'EXTERNAL_REFERRAL':
      return 'REFERRED_OUTSIDE';
    default:
      return null;
  }
}

// The Refer dialog's suggested agencies
// (components/features/admin/tickets/routing/ReferDialog.tsx, minus its
// "Other" option). A referral to one of these shows the agency by name; a
// typed "Other" agency, or a referral with no recorded target, shows
// OUTSIDE_AGENCY — free text a staff member typed is never shown to a
// citizen.
export const SUGGESTED_REFERRAL_AGENCIES = [
  'MENRO',
  'DPWH',
  'Water utility provider',
  'Electric utility provider',
  'Barangay office',
] as const;
export const OUTSIDE_AGENCY = 'an outside agency';

export function citizenReferralAgency(referralTarget: string | null): string {
  if (referralTarget === null) return OUTSIDE_AGENCY;
  const target = referralTarget.trim().toLowerCase();
  return (
    SUGGESTED_REFERRAL_AGENCIES.find((a) => a.toLowerCase() === target) ??
    OUTSIDE_AGENCY
  );
}

// The Appendix H tracking reference the reports insert trigger generates
// (migration 0036): PRC-<4-digit year>-<report id, at least 6 digits>.
// Case-insensitive on the prefix; the stored form is upper case.
const TRACKING_REFERENCE_PATTERN = /^PRC-\d{4}-\d{6,12}$/;

// The reference to look up, normalized, or null when it can never match a
// stored reference (the route then answers the same 404 as a missing one).
export function normalizeTrackingReference(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const ref = input.trim().toUpperCase();
  return TRACKING_REFERENCE_PATTERN.test(ref) ? ref : null;
}
