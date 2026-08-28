import Link from "next/link";
import { AlertTriangle, Ticket as TicketIcon, TrendingUp, CheckCircle2, ArrowLeftIcon, MountainIcon, type LucideIcon } from "lucide-react";
import type { BarangayProfile as BarangayProfileData } from "@/lib/types/admin-barangay-insights";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "../shared/EmptyState";
import { StatusPill } from "../shared/StatusPill";
import { BarangayTrendChart } from "./BarangayTrendChart";
import { CategoryBreakdownList } from "./CategoryBreakdownList";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatElevation(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} m`;
}

function KpiTile({ icon: Icon, label, tint, value }: { icon: LucideIcon; label: string; tint: string; value: number }) {
  return (
    <Card className="py-0 shadow-xs">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon aria-hidden="true" className="size-4.5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="truncate text-xs text-muted-foreground" title={label}>{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Office toggle is plain links (?office=), not client-side state — a full
// page revisit is cheap for a read-only profile and keeps this component
// server-renderable end to end aside from the two chart primitives, which
// are already client components regardless.
function OfficeToggle({ barangayId, office }: { barangayId: number; office: "MEO" | "MDRRMO" | undefined }) {
  const options: { value: "MEO" | "MDRRMO" | undefined; label: string }[] = [
    { value: undefined, label: "All offices" },
    { value: "MEO", label: "MEO" },
    { value: "MDRRMO", label: "MDRRMO" },
  ];
  return (
    <div aria-label="Office" className="flex gap-1 rounded-lg border p-1" role="group">
      {options.map((opt) => (
        <Link
          aria-current={office === opt.value ? "true" : undefined}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            office === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          href={opt.value ? `/admin/barangay-insights/${barangayId}?office=${opt.value}` : `/admin/barangay-insights/${barangayId}`}
          key={opt.label}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

export function BarangayProfile({
  profile,
  office,
  isSystemAdmin = false,
}: {
  profile: BarangayProfileData;
  office: "MEO" | "MDRRMO" | undefined;
  isSystemAdmin?: boolean;
}) {
  const ticketsHref = `/admin/tickets?barangayId=${profile.barangay_id}`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" href="/admin/barangay-insights">
            <ArrowLeftIcon aria-hidden="true" className="size-3" />
            Back to Barangay Insights
          </Link>
          <h1 className="font-heading text-base font-semibold">{profile.barangay_name}</h1>
        </div>
        {isSystemAdmin && <OfficeToggle barangayId={profile.barangay_id} office={office} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon={TicketIcon} label="Total Tickets" tint="bg-slate-100 text-slate-600" value={profile.kpis.total_tickets} />
        <KpiTile icon={TrendingUp} label="Active Tickets" tint="bg-blue-50 text-blue-600" value={profile.kpis.active_tickets} />
        <KpiTile icon={CheckCircle2} label="Resolved Tickets" tint="bg-emerald-50 text-emerald-600" value={profile.kpis.resolved_tickets} />
        <KpiTile icon={AlertTriangle} label="High Urgency Tickets" tint="bg-red-50 text-red-600" value={profile.kpis.high_urgency_tickets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0">
          <CardHeader className="border-b pb-3">
            <CardTitle>Category Breakdown</CardTitle>
            <CardDescription>All-time ticket categories for this barangay.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <CategoryBreakdownList categories={profile.categoryBreakdown} />
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader className="border-b pb-3">
            <CardTitle>Incident Trend</CardTitle>
            <CardDescription>New tickets over the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <BarangayTrendChart data={profile.incidentTrend} />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0">
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2"><MountainIcon aria-hidden="true" className="size-4" />Elevation Summary</CardTitle>
          <CardDescription>DEM-derived elevation for this barangay (display only — not a filter).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 p-4">
          <div><p className="text-xs text-muted-foreground">Minimum</p><p className="font-mono text-lg font-semibold">{formatElevation(profile.elevation.elevation_min)}</p></div>
          <div><p className="text-xs text-muted-foreground">Average</p><p className="font-mono text-lg font-semibold">{formatElevation(profile.elevation.elevation_avg)}</p></div>
          <div><p className="text-xs text-muted-foreground">Maximum</p><p className="font-mono text-lg font-semibold">{formatElevation(profile.elevation.elevation_max)}</p></div>
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
          <div>
            <CardTitle>Recent Tickets</CardTitle>
            <CardDescription>Most recent 10 tickets for this barangay.</CardDescription>
          </div>
          <Link className="text-sm text-brand-600 hover:underline" href={ticketsHref}>View all in Ticket Queue</Link>
        </CardHeader>
        <CardContent className="p-0">
          {profile.recentTickets.length === 0 ? (
            <EmptyState className="items-start p-4 text-left" title="No tickets recorded for this barangay yet." />
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6">Ticket</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Urgency</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="pr-6 text-center">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.recentTickets.map((t) => {
                  const urgencyBadge = getUrgencyBadgeConfig(t.priority_score);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="pl-6">
                        <Link className="font-medium hover:underline" href={`/admin/tickets/${t.id}`}>
                          {t.title ?? `Ticket #${t.id}`}
                        </Link>
                        <div className="text-xs text-muted-foreground">Ticket <span className="font-mono">#{t.id}</span></div>
                      </TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={urgencyBadge.className} variant="outline">
                          {urgencyBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center"><StatusPill status={t.status} /></TableCell>
                      <TableCell className="pr-6 text-center text-xs text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
