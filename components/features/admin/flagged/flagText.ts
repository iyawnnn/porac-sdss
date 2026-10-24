// Labels for the flag-type filter dropdown (bare prefixes, no instance
// data) — distinct from flagLabel below, which formats one flag instance
// off an actual report (may carry a `:`-delimited suffix).
export const FLAG_TYPE_LABELS: Record<string, string> = {
  LOCATION_MISMATCH: "Location mismatch (> 50 m)",
  STALE_EVIDENCE: "Stale evidence",
  MISSING_METADATA: "Missing metadata",
  TIMESTAMP_ANOMALY: "Timestamp anomaly",
  DUPLICATE_IMAGE: "Duplicate image",
  BOUNDARY_FALLBACK: "Boundary fallback",
};

export function moderationStatusLabel(status: string | null): string {
  if (status === null) return "Pending";
  if (status === "quarantined") return "Quarantined";
  if (status === "dismissed") return "Dismissed";
  if (status === "duplicate") return "Duplicate";
  return status;
}

export function flagLabel(flag: string): string {
  if (flag.startsWith("DUPLICATE_IMAGE:")) return "Duplicate image";
  if (flag.startsWith("BOUNDARY_FALLBACK:")) return "Barangay boundary fallback";
  return FLAG_TYPE_LABELS[flag] ?? flag;
}

export function flagEvidence(
  flag: string,
  report: { location_mismatch_m: number | null; exif_captured_at: string | null; created_at: string }
): string {
  if (flag === "LOCATION_MISMATCH" && report.location_mismatch_m !== null) {
    return `${report.location_mismatch_m.toFixed(0)}m from photo's EXIF GPS`;
  }
  // Measured against the submission (created_at), as the check itself is.
  const hoursBeforeSubmission = report.exif_captured_at
    ? (new Date(report.created_at).getTime() - new Date(report.exif_captured_at).getTime()) / (1000 * 60 * 60)
    : null;
  if (flag === "STALE_EVIDENCE" && hoursBeforeSubmission !== null) {
    return `photo taken ${hoursBeforeSubmission.toFixed(1)}h before submission`;
  }
  if (flag === "TIMESTAMP_ANOMALY" && hoursBeforeSubmission !== null) {
    return `photo time ${(-hoursBeforeSubmission).toFixed(1)}h after submission`;
  }
  if (flag.startsWith("DUPLICATE_IMAGE:")) {
    const matchedId = flag.split(":")[1];
    return `phash near-match against report #${matchedId}`;
  }
  if (flag.startsWith("BOUNDARY_FALLBACK:")) {
    const [, barangayName, distanceM] = flag.split(":");
    return `snapped to ${barangayName}, ${distanceM}m outside its GADM polygon`;
  }
  return "";
}
