import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/raw";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticketId = Number(id);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ticket] = await sql<{ status: string }[]>`SELECT status FROM tickets WHERE id = ${ticketId}`;
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const nextStatus = NEXT_STATUS[ticket.status];
  if (!nextStatus) {
    return NextResponse.json({ error: `No transition available from ${ticket.status}` }, { status: 400 });
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE tickets SET status = ${nextStatus}, updated_at = now() WHERE id = ${ticketId}`;
    await tx`
      INSERT INTO status_history (ticket_id, status, admin_id, admin_name, changed_at)
      VALUES (${ticketId}, ${nextStatus}, ${session.adminId}, ${session.adminName}, now())
    `;
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
