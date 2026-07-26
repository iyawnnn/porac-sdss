import Link from "next/link";
import { getFlaggedReports } from "@/lib/admin/tickets";

const FLAG_LABELS: Record<string, string> = {
  NO_EXIF: "No GPS EXIF (screenshot/downloaded image?)",
  LOCATION_MISMATCH: "Pin location doesn't match photo GPS",
  STALE_PHOTO: "Photo is over 24h old",
};

function flagEvidence(
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
  return FLAG_LABELS[flag] ?? "";
}

function flagLabel(flag: string): string {
  if (flag.startsWith("DUPLICATE_IMAGE:")) return "Duplicate image";
  if (flag.startsWith("BOUNDARY_FALLBACK:")) return "Barangay boundary fallback";
  return FLAG_LABELS[flag] ?? flag;
}

export default async function AdminFlaggedPage() {
  const reports = await getFlaggedReports();

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Flagged Reports ({reports.length})</h1>
      <p className="text-sm text-gray-600 mb-6">
        Flags are a signal, not an auto-reject — every report below was still created. Use the
        evidence to decide whether it needs closer review.
      </p>

      <div className="space-y-4">
        {reports.map((r) => (
          <div key={r.id} className="border p-4 rounded flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image_url} alt={r.title} className="w-32 h-32 object-cover rounded" />
            <div className="flex-1">
              <h2 className="font-medium">
                {r.title} —{" "}
                <Link href={`/admin/tickets/${r.ticket_id}`} className="text-blue-600 underline">
                  Ticket #{r.ticket_id}
                </Link>
              </h2>
              <p className="text-xs text-gray-500">
                {r.category} · {r.barangay_name} · reported as {r.citizen_severity} ·{" "}
                {new Date(r.created_at).toLocaleString()}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {r.flags.map((flag) => (
                  <li key={flag}>
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-medium mr-2">
                      {flagLabel(flag)}
                    </span>
                    <span className="text-gray-600">{flagEvidence(flag, r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
        {reports.length === 0 && (
          <p className="text-gray-500">No flagged reports.</p>
        )}
      </div>
    </main>
  );
}
