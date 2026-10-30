import type { RainfallContextView } from "@/lib/types/admin-tickets";
import { rainfallStateText as rowText } from "@/lib/utils/ui/rainfall";
import { Card, CardContent } from "@/components/ui/card";
import { RainfallRefreshButton } from "./RainfallRefreshButton";

// Ticket Detail's rainfall context (manuscript p. 72, Appendix H
// RAINFALL_CONTEXT; manuscript revision Phase 4, step 4c). Staff only and
// advisory: the current rainfall at the ticket's location, never a risk,
// urgency or score, and it changes nothing about Operational Priority,
// Hazard Information or validity.
//
// A reading of 0 is real and shows as "0 mm"; a failed fetch never does
// (lib/utils/ui/rainfall.ts). Every check below compares rainfall_mm and
// observation_at with null, never by truthiness.

const when = (iso: string) => new Date(iso).toLocaleString();

export function RainfallContextCard({ rainfall, ticketId }: { rainfall: RainfallContextView; ticketId: number }) {
  const { current, applicability } = rainfall;
  // Active, not merged-away, applicable: the API refuses a Refresh otherwise.
  const canRefresh = applicability === "applicable";
  return (
    <Card data-testid="rainfall-context">
      <CardContent className="p-4">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Rainfall</p>
        <p className="mt-0.5 text-xs text-ink-500" data-testid="rainfall-context-advisory">
          Advisory — current rainfall, not a risk score
        </p>

        {applicability === "not_applicable" ? (
          <p className="mt-2 text-sm text-ink-900" data-testid="rainfall-context-state">
            Not applicable
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-xs text-ink-500" data-testid="rainfall-context-source">
              {rainfall.valueLabel} · {current?.source_provider ?? "OpenWeatherMap"}
            </p>
            {applicability === "closed_historical" && (
              <p className="mt-0.5 text-xs text-ink-500" data-testid="rainfall-context-historical">
                Historical — this ticket is closed or merged and is no longer refreshed
              </p>
            )}

            {current === null ? (
              <p className="mt-1 text-sm text-ink-900" data-testid="rainfall-context-state">
                {applicability === "closed_historical" ? "No rainfall context was recorded" : "Not yet fetched"}
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-ink-900" data-testid="rainfall-context-state">
                  {rowText(current)}
                </p>
                {current.status !== "UNAVAILABLE" && current.observation_at !== null && (
                  <p className="mt-0.5 text-xs text-ink-500" data-testid="rainfall-context-observed">
                    Observed {when(current.observation_at)} · fetched {when(current.fetched_at)}
                  </p>
                )}
                {current.status === "UNAVAILABLE" && (
                  <p className="mt-0.5 text-xs text-ink-500" data-testid="rainfall-context-observed">
                    Last tried {when(current.fetched_at)}
                  </p>
                )}
                {current.status === "STALE" && (
                  <p className="mt-0.5 text-xs text-ink-700" data-testid="rainfall-context-stale">
                    Could not refresh
                  </p>
                )}
                {current.status !== "CURRENT" && current.failure_reason && (
                  <p className="mt-0.5 text-xs text-ink-500">Reason: {current.failure_reason}</p>
                )}
              </>
            )}

            {canRefresh && <RainfallRefreshButton ticketId={ticketId} />}
          </div>
        )}

        {rainfall.history.length > 0 && (
          <details className="mt-3" data-testid="rainfall-context-history">
            <summary className="cursor-pointer text-xs font-medium text-ink-700">
              Earlier readings ({rainfall.history.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rainfall.history.map((row) => (
                <li className="rounded-md border border-line-200 p-2 text-xs" data-testid="rainfall-context-history-row" key={row.id}>
                  <span className="text-ink-900">{rowText(row)}</span>
                  <span className="block text-ink-500">
                    {row.observation_at !== null ? <>Observed {when(row.observation_at)} · </> : null}
                    fetched {when(row.fetched_at)}
                    {row.superseded_at && <> · replaced {when(row.superseded_at)}</>}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
