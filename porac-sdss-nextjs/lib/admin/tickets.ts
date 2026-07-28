import { sql } from "@/lib/db/raw";

export type TicketStatus = "Reported" | "Under Review" | "In Progress" | "Resolved" | "Rejected";
export interface AdminTicketFilters { office?: "MEO" | "MDRRMO"; status?: "active" | "all" | TicketStatus; urgency?: string; barangayId?: number; }
export interface AdminTicketRow { id:number; category:string; barangay_id:number; barangay_name:string; member_count:number; urgency_score:number|null; urgency_band:string|null; assigned_office:string; status:string; created_at:string; }
export async function getTicketsForAdmin(filters:AdminTicketFilters={}) {
 const status=filters.status??"active";
 const statusClause=status==="active"?sql`AND t.status IN ('Reported','Under Review','In Progress')`:status==="all"?sql``:sql`AND t.status = ${status}::ticket_status`;
 return sql<AdminTicketRow[]>`SELECT t.id,t.category,t.barangay_id,b.name AS barangay_name,t.member_count,t.urgency_score,t.urgency_band,t.assigned_office,t.status,t.created_at FROM tickets t JOIN barangays b ON b.id=t.barangay_id WHERE (${filters.office??null}::text IS NULL OR t.assigned_office=${filters.office??null}::office) ${statusClause} AND (${filters.urgency??null}::text IS NULL OR t.urgency_band=${filters.urgency??null}) AND (${filters.barangayId??null}::int IS NULL OR t.barangay_id=${filters.barangayId??null}::int) ORDER BY t.urgency_score DESC NULLS LAST`;
}
export interface TicketDetail {
  id: number;
  category: string;
  barangay_name: string;
  status: string;
  assigned_office: string;
  member_count: number;
  elevation_m: number | null;
  elevation_factor: number | null;
  precipitation_factor: number | null;
  cluster_factor: number | null;
  urgency_score: number | null;
  urgency_band: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketReport {
  id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  created_at: string;
}

export interface TicketStatusHistoryRow {
  status: string;
  admin_name: string | null;
  changed_at: string;
}

export interface TicketReassignmentRow {
  from_office: string;
  to_office: string;
  admin_name: string | null;
  reassigned_at: string;
}

export async function getTicketDetail(id: number) {
  const [ticket] = await sql<TicketDetail[]>`
    SELECT
      t.id, t.category, b.name AS barangay_name, t.status, t.assigned_office,
      t.member_count, t.elevation_m, t.elevation_factor, t.precipitation_factor,
      t.cluster_factor, t.urgency_score, t.urgency_band, t.created_at, t.updated_at
    FROM tickets t
    JOIN barangays b ON b.id = t.barangay_id
    WHERE t.id = ${id}
  `;

  if (!ticket) return null;

  const reports = await sql<TicketReport[]>`
    SELECT id, title, description, citizen_severity, image_url, created_at
    FROM reports WHERE ticket_id = ${id} ORDER BY created_at
  `;

  const history = await sql<TicketStatusHistoryRow[]>`
    SELECT status, admin_name, changed_at
    FROM status_history WHERE ticket_id = ${id} ORDER BY changed_at
  `;

  const reassignments = await sql<TicketReassignmentRow[]>`
    SELECT from_office, to_office, admin_name, reassigned_at
    FROM office_reassignments WHERE ticket_id = ${id} ORDER BY reassigned_at
  `;

  return { ticket, reports, history, reassignments };
}

export interface FlaggedReportRow {
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
}

export async function getFlaggedReports() {
  return sql<FlaggedReportRow[]>`
    SELECT
      r.id, r.ticket_id, r.title, r.citizen_severity, r.image_url, r.flags,
      r.location_mismatch_m, r.exif_captured_at, r.created_at,
      t.category, b.name AS barangay_name
    FROM reports r
    JOIN tickets t ON t.id = r.ticket_id
    JOIN barangays b ON b.id = t.barangay_id
    WHERE r.flags IS NOT NULL AND array_length(r.flags, 1) > 0
    ORDER BY r.created_at DESC
  `;
}
