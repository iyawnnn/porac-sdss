import type {
  OperationalMetrics,
  DistributionRow,
} from "@/lib/types/admin-dashboard";
import { metricDuration } from "@/lib/utils/metric-duration";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function Numbers({ rows }: { rows: DistributionRow[] }) {
  return (
    <dl className="grid gap-2">
      {rows.map((row) => (
        <div
          className="flex items-baseline justify-between gap-3"
          key={row.label}
        >
          <dt className="text-sm">{row.label}</dt>
          <dd className="font-mono tabular-nums">
            {row.count.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function OperationalMetricsPanels({
  metrics,
  medianResolutionHours,
}: {
  metrics: OperationalMetrics;
  medianResolutionHours: number | null;
}) {
  return (
    <section
      aria-label="Operational ticket metrics"
      className="grid gap-3 sm:grid-cols-2"
    >
      <Card>
        <CardHeader>
          <CardTitle>Pending vs resolved</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Tickets, all time. Pending excludes Rejected.
          </p>
          <Numbers
            rows={[
              { label: "Pending", count: metrics.ticketCounts.pending },
              { label: "Resolved", count: metrics.ticketCounts.resolved },
              { label: "Rejected", count: metrics.ticketCounts.rejected },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Resolution outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Resolved tickets, all time
          </p>
          <Numbers rows={metrics.resolutionOutcomes} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Acknowledgments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">Active tickets</p>
          <Numbers
            rows={[
              {
                label: "Acknowledged",
                count: metrics.acknowledgments.acknowledged,
              },
              {
                label: "Awaiting acknowledgment",
                count: metrics.acknowledgments.awaiting,
              },
            ]}
          />
          <dl className="mt-3">
            <dt className="text-sm text-muted-foreground">
              Median time to acknowledge · acknowledged in the last 30 days
            </dt>
            <dd className="font-mono">
              {metricDuration(metrics.acknowledgments.medianHours30d)}
            </dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Median resolution time</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <dt className="text-sm text-muted-foreground">
              Tickets resolved in the last 30 days
            </dt>
            <dd className="mt-2 font-mono text-xl">
              {metricDuration(medianResolutionHours)}
            </dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Legacy tickets without a recorded resolution date are excluded.
          </p>
        </CardContent>
      </Card>
      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle>Hazard Information (advisory)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Advisory only, not a risk score
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Applicable flood and landslide tickets, all time; current results
            only.
          </p>
          <Numbers rows={metrics.hazardInformation} />
        </CardContent>
      </Card>
    </section>
  );
}
