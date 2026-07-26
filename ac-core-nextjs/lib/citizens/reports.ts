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
  created_at: string;
}

export async function getMyReports(citizenId: number) {
  return sql<MyReportRow[]>`
    SELECT
      r.id, r.ticket_id, r.title, t.category, r.citizen_severity, r.image_url,
      t.status, t.urgency_band, r.created_at
    FROM reports r
    JOIN tickets t ON t.id = r.ticket_id
    WHERE r.citizen_id = ${citizenId}
    ORDER BY r.created_at DESC
  `;
}
