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
}

export async function GET(req: NextRequest) {
  await recomputeActiveTicketUrgency();

  const officeParam = req.nextUrl.searchParams.get("office");
  const office = officeParam === "MEO" || officeParam === "MDRRMO" ? officeParam : null;
  const tickets = await sql<AdminTicketGeoRow[]>`
    SELECT t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
      t.urgency_score, t.urgency_band, t.priority_index, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng
    FROM tickets t
    JOIN barangays b ON b.id = t.barangay_id
    WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
      AND (${office}::text IS NULL OR t.assigned_office = ${office}::office)
  `;

  return NextResponse.json(tickets);
}