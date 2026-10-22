// How far the pin may be from the photo's GPS before the report is flagged
// LOCATION_MISMATCH (manuscript pp. 42–43; manuscript revision Phase 3, step
// 3b). Mirrors LOCATION_MISMATCH_THRESHOLD_M in
// api/src/reports/reports.service.ts, which sets the flag on the server; the
// citizen report form uses it for its non-blocking warning.
// location-mismatch.test.ts checks the two stay equal.
export const LOCATION_MISMATCH_THRESHOLD_M = 50;

// The same strict "more than" the server uses.
export function isLocationMismatch(distanceM: number): boolean {
  return distanceM > LOCATION_MISMATCH_THRESHOLD_M;
}
