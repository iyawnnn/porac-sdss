import Link from "next/link";
import { AlertTriangle, Bell, CalendarClock, Flame, ShieldAlert, type LucideIcon } from "lucide-react";
import type { NeedsAttention as NeedsAttentionData } from "@/lib/types/admin-dashboard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CardBodyPanel } from "../shared/CardBodyPanel";
import { CardHeaderRow } from "../shared/CardHeaderRow";

// Compact awareness feed, not a work queue — one aggregate row per
// condition (icon, label, count, short description), never a per-item list.
// The detailed actionable queue lives in DashboardClient's "Highest Urgency
// Actions" table; this rail must not duplicate the same tickets one-by-one.
function AttentionRow({ icon: Icon, tone, label, count, description, href }: { icon: LucideIcon; tone: string; label: string; count: number; description: string; href?: string }) {
  const nonzero = count > 0;
  const row = (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", nonzero ? tone : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", nonzero ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <span className={cn("shrink-0 font-mono text-sm tabular-nums", nonzero ? cn("font-semibold", tone) : "text-muted-foreground")}>{count.toLocaleString()}</span>
    </div>
  );
  if (!href) return row;
  return (
    <Link className="block transition-colors hover:bg-accent" href={href}>
      {row}
    </Link>
  );
}

export function NeedsAttention({ data, flaggedReportsPending }: { data: NeedsAttentionData; flaggedReportsPending: number }) {
  return (
    <Card aria-label="Needs attention" className="flex flex-col gap-0 overflow-hidden rounded-xl bg-muted pt-2 pb-5 dashboard:col-span-3" role="region">
      <CardHeader className="px-4 pb-2">
        <CardHeaderRow>
          <CardTitle className="text-xs font-medium text-muted-foreground">Needs Attention</CardTitle>
          <Bell aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
        </CardHeaderRow>
      </CardHeader>
      <CardBodyPanel className="flex flex-1 flex-col">
        <div className="flex flex-col divide-y divide-border" data-testid="needs-attention-rows">
          {/* /admin/work-orders?overdue=true — real, existing WorkOrdersWorkspace filter. */}
          <AttentionRow
            count={data.overdueWorkOrders.length}
            description="Work orders past their due date"
            href="/admin/work-orders?overdue=true"
            icon={AlertTriangle}
            label="Overdue Work"
            tone="text-destructive"
          />
          {/* No due-date-specific filter exists on Work Orders (only the
              boolean ?overdue=true above) — not linked rather than inventing one. */}
          <AttentionRow
            count={data.dueTodayWorkOrders.length}
            description="Work orders due today"
            icon={CalendarClock}
            label="Due Today"
            tone="text-urgency-medium"
          />
          {/* /admin/tickets?urgency=High — the closest existing Ticket Queue
              filter. A superset of "high urgency AND has open work"; there is
              no narrower existing filter for the exact underlying set. */}
          <AttentionRow
            count={data.highUrgencyTicketsWithOpenWork.length}
            description="High-urgency tickets with unresolved work"
            href="/admin/tickets?urgency=High"
            icon={Flame}
            label="High-Urgency Open Work"
            tone="text-urgency-critical"
          />
          <AttentionRow
            count={flaggedReportsPending}
            description="Reports awaiting moderation review"
            href="/admin/flagged"
            icon={ShieldAlert}
            label="Flagged Reports Pending"
            tone="text-flag"
          />
        </div>
      </CardBodyPanel>
    </Card>
  );
}
