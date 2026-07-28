import { sql } from "@/lib/db/raw";

export interface MyReportRow {
  id: number;
  ticket_id: number;
  title: string;
  category: string;
  citizen_severity: string;
  image_url: string;
  status: string;
  urgency_band: string | null;
  barangay_name: string;
  created_at: string;
}

export async function getMyReports(citizenId: number) {
  return sql<MyReportRow[]>`
    SELECT
      r.id, r.ticket_id, r.title, t.category, r.citizen_severity, r.image_url,
      t.status, t.urgency_band, b.name AS barangay_name, r.created_at
    FROM reports r
    JOIN tickets t ON t.id = r.ticket_id
    JOIN barangays b ON b.id = t.barangay_id
    WHERE r.citizen_id = ${citizenId}
    ORDER BY r.created_at DESC
  `;
}

export interface MyReportDetail {
  id: number;
  ticket_id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  category: string;
  status: string;
  urgency_band: string | null;
  barangay_name: string;
  lat: number;
  lng: number;
  citizen_first_name: string;
  citizen_last_name: string;
  created_at: string;
  ticket_created_at: string;
  ticket_updated_at: string;
}

export interface StatusHistoryStep {
  status: string;
  admin_name: string | null;
  changed_at: string;
}

// `AND r.citizen_id = ${citizenId}` is the authorization check. A wrong-owner
// request and a nonexistent report ID both return null, so callers do not leak ownership.
export async function getMyReportDetail(citizenId: number, reportId: number) {
  const [report] = await sql<MyReportDetail[]>`
    SELECT
      r.id, r.ticket_id, r.title, r.description, r.citizen_severity, r.image_url,
      t.category, t.status, t.urgency_band, b.name AS barangay_name,
      ST_Y(r.pin_geom) AS lat, ST_X(r.pin_geom) AS lng,
      c.first_name AS citizen_first_name, c.last_name AS citizen_last_name,
      r.created_at, t.created_at AS ticket_created_at, t.updated_at AS ticket_updated_at
    FROM reports r
    JOIN tickets t ON t.id = r.ticket_id
    JOIN barangays b ON b.id = t.barangay_id
    JOIN citizens c ON c.id = r.citizen_id
    WHERE r.id = ${reportId} AND r.citizen_id = ${citizenId}
  `;

  if (!report) return null;

  const history = await sql<StatusHistoryStep[]>`
    SELECT status, admin_name, changed_at
    FROM status_history WHERE ticket_id = ${report.ticket_id} ORDER BY changed_at
  `;

  return { report, history };
}
