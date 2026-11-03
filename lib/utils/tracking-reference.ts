// The citizen-side tracking reference helpers (manuscript revision Phase 6,
// step 6b). Mirrors api/src/reports/citizen-report-view.ts
// normalizeTrackingReference: PRC-<4-digit year>-<report id, 6 to 12
// digits>, upper case.
const TRACKING_REFERENCE_PATTERN = /^PRC-\d{4}-\d{6,12}$/;

export const REFERENCE_NOT_FOUND = "No report found with that reference.";

// The normalized reference, or null when it can never be a tracking
// reference.
export function normalizeReferenceInput(input: string): string | null {
  const ref = input.trim().toUpperCase();
  return TRACKING_REFERENCE_PATTERN.test(ref) ? ref : null;
}
