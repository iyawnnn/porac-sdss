import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { moderateReport, type ModerationAction } from "@/lib/admin/moderation";

const ACTIONS: ModerationAction[] = ["dismiss", "quarantine", "duplicate"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, canonicalReportId } = await req.json();
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "action must be dismiss, quarantine, or duplicate" }, { status: 400 });
  }

  const result = await moderateReport(reportId, action, session.adminName, canonicalReportId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
