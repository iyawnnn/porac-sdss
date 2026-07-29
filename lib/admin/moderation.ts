import { sql } from "@/lib/db/raw";

export interface ModerationQueueRow {
  id: number;
  ticket_id: number;
  title: string;
  citizen_severity: string;
  image_url: string;
  flags: string[];
  location_mismatch_m: number | null;
  exif_captured_at: string | null;
  created_at: string;
  category: string;
  barangay_name: string;
  citizen_id: number;
  citizen_name: string;
  citizen_report_count: number;
  citizen_flag_count: number;
}

export async function getModerationQueue() {
  return sql<ModerationQueueRow[]>`
    SELECT
      r.id, r.ticket_id, r.title, r.citizen_severity, r.image_url, r.flags,
      r.location_mismatch_m, r.exif_captured_at, r.created_at,
      t.category, b.name AS barangay_name,
      c.id AS citizen_id, (c.first_name || ' ' || c.last_name) AS citizen_name,
      (SELECT COUNT(*) FROM reports r2 WHERE r2.citizen_id = r.citizen_id)::int AS citizen_report_count,
      (SELECT COUNT(*) FROM reports r3 WHERE r3.citizen_id = r.citizen_id
        AND r3.flags IS NOT NULL AND array_length(r3.flags, 1) > 0)::int AS citizen_flag_count
    FROM reports r
    JOIN tickets t ON t.id = r.ticket_id
    JOIN barangays b ON b.id = t.barangay_id
    JOIN citizens c ON c.id = r.citizen_id
    WHERE r.flags IS NOT NULL AND array_length(r.flags, 1) > 0
      AND r.moderation_status IS NULL
    ORDER BY r.created_at DESC
  `;
}

export interface ModerationStats {
  pending: number;
  quarantined: number;
  dismissed: number;
  avgResolutionHours: number | null;
}

export async function getModerationStats(): Promise<ModerationStats> {
  const [row] = await sql<
    { pending: string; quarantined: string; dismissed: string; avg_hours: number | null }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE moderation_status IS NULL) AS pending,
      COUNT(*) FILTER (WHERE moderation_status = 'quarantined') AS quarantined,
      COUNT(*) FILTER (WHERE moderation_status IN ('dismissed', 'duplicate')) AS dismissed,
      AVG(EXTRACT(EPOCH FROM (moderated_at - created_at)) / 3600)
        FILTER (WHERE moderated_at IS NOT NULL) AS avg_hours
    FROM reports
    WHERE flags IS NOT NULL AND array_length(flags, 1) > 0
  `;
  return {
    pending: Number(row?.pending ?? 0),
    quarantined: Number(row?.quarantined ?? 0),
    dismissed: Number(row?.dismissed ?? 0),
    avgResolutionHours: row?.avg_hours != null ? Number(row.avg_hours) : null,
  };
}

export type ModerationAction = "dismiss" | "quarantine" | "duplicate";

export async function moderateReport(
  reportId: number,
  action: ModerationAction,
  adminName: string,
  canonicalReportId?: number
) {
  const [report] = await sql<{ ticket_id: number; moderation_status: string | null }[]>`
    SELECT ticket_id, moderation_status FROM reports WHERE id = ${reportId}
  `;
  if (!report) return { ok: false as const, error: "Report not found" };
  if (report.moderation_status !== null) {
    return { ok: false as const, error: `Report was already ${report.moderation_status}` };
  }

  if (action === "duplicate") {
    if (!canonicalReportId) return { ok: false as const, error: "canonicalReportId is required" };
    const [canonical] = await sql<{ id: number }[]>`SELECT id FROM reports WHERE id = ${canonicalReportId}`;
    if (!canonical) return { ok: false as const, error: "Canonical report not found" };
  }

  const status = action === "dismiss" ? "dismissed" : action === "quarantine" ? "quarantined" : "duplicate";
  const note = action === "duplicate" ? String(canonicalReportId) : null;

  await sql.begin(async (tx) => {
    await tx`
      UPDATE reports
      SET moderation_status = ${status}, moderation_note = ${note},
        moderated_at = now(), moderated_by = ${adminName}
      WHERE id = ${reportId}
    `;
    if (action === "quarantine") {
      await tx`UPDATE tickets SET flagged = true, updated_at = now() WHERE id = ${report.ticket_id}`;
    }
  });

  return { ok: true as const, status };
}
