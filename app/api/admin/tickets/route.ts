import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";
import { getTicketsForAdmin, parseTicketQuery } from "@/lib/admin/tickets";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recomputeResult = await recomputeActiveTicketUrgency();

  const query = Object.fromEntries(req.nextUrl.searchParams) as Record<string, string | undefined>;
  const filters = parseTicketQuery(query, session.office);
  const result = await getTicketsForAdmin(filters);

  return NextResponse.json({ ...result, recompute: recomputeResult });
}
