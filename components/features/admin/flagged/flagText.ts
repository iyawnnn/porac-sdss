// Labels for the flag-type filter dropdown (bare prefixes, no instance
// data) — distinct from flagLabel below, which formats one flag instance
// off an actual report (may carry a `:`-delimited suffix).
export const FLAG_TYPE_LABELS: Record<string, string> = {
  LOCATION_MISMATCH: "Location mismatch",
  STALE_PHOTO: "Stale photo",
  NO_EXIF: "No GPS EXIF",
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
  if (flag === "NO_EXIF") return "No GPS EXIF (screenshot/downloaded image?)";
  if (flag === "LOCATION_MISMATCH") return "Pin location doesn't match photo GPS";
  if (flag === "STALE_PHOTO") return "Photo is over 24h old";
  return flag;
}

export function flagEvidence(
  flag: string,
  report: { location_mismatch_m: number | null; exif_captured_at: string | null }
): string {
  if (flag === "LOCATION_MISMATCH" && report.location_mismatch_m !== null) {
    return `${report.location_mismatch_m.toFixed(0)}m from photo's EXIF GPS`;
  }
  if (flag === "STALE_PHOTO" && report.exif_captured_at) {
    const ageHours = (Date.now() - new Date(report.exif_captured_at).getTime()) / (1000 * 60 * 60);
    return `photo taken ${ageHours.toFixed(1)}h before submission`;
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
