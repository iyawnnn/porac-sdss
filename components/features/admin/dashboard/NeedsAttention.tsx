import Link from "next/link";
import { AlertTriangle, CalendarClock, Flame } from "lucide-react";
import type { NeedsAttention as NeedsAttentionData } from "@/lib/types/admin-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function EmptyRow({ label }: { label: string }) {
  return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{label}</p>;
}

export function NeedsAttention({ data }: { data: NeedsAttentionData }) {
  return (
    <Card aria-label="Needs attention" className="lg:col-span-2 dashboard:col-span-4" role="region">
      <CardHeader>
        <CardTitle>Needs Attention</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line-100">
          <p className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            <AlertTriangle aria-hidden="true" className="size-3.5 text-red-600" /> Overdue
          </p>
          {data.overdueWorkOrders.length === 0 ? (
            <EmptyRow label="No overdue work orders." />
          ) : (
            <ul className="divide-y">
              {data.overdueWorkOrders.map((wo) => (
                <li className="px-3 py-2" key={wo.id}>
                  <Link className="truncate text-sm font-medium text-brand-600 hover:underline" href={`/admin/tickets/${wo.ticket_id}`}>
                    {wo.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">Due {formatDate(wo.due_date)} {"·"} Ticket #{wo.ticket_id}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-line-100">
          <p className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            <CalendarClock aria-hidden="true" className="size-3.5 text-amber-600" /> Due Today
          </p>
          {data.dueTodayWorkOrders.length === 0 ? (
            <EmptyRow label="Nothing due today." />
          ) : (
            <ul className="divide-y">
              {data.dueTodayWorkOrders.map((wo) => (
                <li className="px-3 py-2" key={wo.id}>
                  <Link className="truncate text-sm font-medium text-brand-600 hover:underline" href={`/admin/tickets/${wo.ticket_id}`}>
                    {wo.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">Ticket #{wo.ticket_id} {"·"} {wo.assigned_office}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-line-100">
          <p className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            <Flame aria-hidden="true" className="size-3.5 text-orange-600" /> High-Urgency, Work Pending
          </p>
          {data.highUrgencyTicketsWithOpenWork.length === 0 ? (
            <EmptyRow label="No high-urgency tickets with open work." />
          ) : (
            <ul className="divide-y">
              {data.highUrgencyTicketsWithOpenWork.map((t) => (
                <li className="flex items-center justify-between gap-2 px-3 py-2" key={t.id}>
                  <div className="min-w-0">
                    <Link className="truncate text-sm font-medium text-brand-600 hover:underline" href={`/admin/tickets/${t.id}`}>
                      Ticket #{t.id}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{t.category}</p>
                  </div>
                  <Badge className="shrink-0" variant="outline">{t.assigned_office}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
