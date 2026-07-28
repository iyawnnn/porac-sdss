import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/raw";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticketId = Number(id);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { toOffice } = await req.json();
  if (toOffice !== "MEO" && toOffice !== "MDRRMO") {
    return NextResponse.json({ error: "toOffice must be MEO or MDRRMO" }, { status: 400 });
  }

  const [ticket] = await sql<{ assigned_office: string }[]>`
    SELECT assigned_office FROM tickets WHERE id = ${ticketId}
  `;
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.assigned_office === toOffice) {
    return NextResponse.json({ error: `Ticket is already assigned to ${toOffice}` }, { status: 400 });
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE tickets SET assigned_office = ${toOffice}, updated_at = now() WHERE id = ${ticketId}`;
    await tx`
      INSERT INTO office_reassignments (ticket_id, from_office, to_office, admin_id, admin_name)
      VALUES (${ticketId}, ${ticket.assigned_office}, ${toOffice}, ${session.adminId}, ${session.adminName})
    `;
  });

  return NextResponse.json({ ok: true, assignedOffice: toOffice });
}
