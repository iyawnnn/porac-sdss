import { NextRequest, NextResponse } from "next/server";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";

// Manual/testing trigger for the recompute logic in lib/triage/recompute.ts.
// Not on a Vercel cron schedule — see that file for why (Hobby plan only
// allows once-daily cron; this is called on-demand instead).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await recomputeActiveTicketUrgency();
  return NextResponse.json(result);
}
