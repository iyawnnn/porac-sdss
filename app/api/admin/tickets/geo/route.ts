import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/raw";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";

export interface AdminTicketGeoRow {
  id: number;
  category: string;
  status: string;
  assigned_office: string;
  barangay_name: string;
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
}

export async function GET(req: NextRequest) {
  await recomputeActiveTicketUrgency();

  const officeParam = req.nextUrl.searchParams.get("office");
  const office = officeParam === "MEO" || officeParam === "MDRRMO" ? officeParam : null;
  const tickets = await sql<AdminTicketGeoRow[]>`
    SELECT t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
      t.urgency_score, t.urgency_band, t.priority_index, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
      r.title, r.image_url
    FROM tickets t
    JOIN barangays b ON b.id = t.barangay_id
    LEFT JOIN LATERAL (
      SELECT title, image_url FROM reports
      WHERE reports.ticket_id = t.id
      ORDER BY reports.id ASC
      LIMIT 1
    ) r ON true
    WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
      AND (${office}::text IS NULL OR t.assigned_office = ${office}::office)
  `;

  return NextResponse.json(tickets);
}