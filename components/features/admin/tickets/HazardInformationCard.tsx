import type { HazardInformationRow, HazardInformationView } from "@/lib/types/admin-tickets";
import { Card, CardContent } from "@/components/ui/card";
import { HazardRetryButton } from "./HazardRetryButton";

// Ticket Detail's DENR-MGB Hazard Information (manuscript pp. 71–72,
// Appendix H HAZARD_INFORMATION; manuscript revision Phase 4, step 4b).
// Staff only and advisory: the source's own susceptibility code and wording,
// never a risk, urgency, severity or score, and it changes nothing about
// Operational Priority, Work Orders or assessments. NO_CLASSIFICATION means
// the source has no polygon at the point — never "Low" or "safe".
//
// The same state wording as api/src/common/utils/hazard-information.ts's
// HAZARD_STATE_TEXT (the queue / dashboard line and the CSV export).
const NO_CLASSIFICATION_TEXT = "No DENR-MGB classification at this location";

function rowText(row: HazardInformationRow): string {
  if (row.lookup_status === "CLASSIFIED") {
    return row.susceptibility_label ? `${row.susceptibility_code} — ${row.susceptibility_label}` : `${row.susceptibility_code}`;
  }
  if (row.lookup_status === "NO_CLASSIFICATION") return NO_CLASSIFICATION_TEXT;
  return "Temporarily unavailable";
}

const CONTEXT_NAME: Record<HazardInformationRow["hazard_context_type"], string> = {
  FLOOD: "Flood",
  RAIN_INDUCED_LANDSLIDE: "Rain-induced landslide",
};

export function HazardInformationCard({
  hazard,
  ticketId,
  canRetry,
}: {
  hazard: HazardInformationView;
  ticketId: number;
  // Active and not merged away: the API refuses a Retry otherwise.
  canRetry: boolean;
}) {
  const { current } = hazard;
  return (
    <Card data-testid="hazard-information">
      <CardContent className="p-4">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Hazard Information</p>
        <p className="mt-0.5 text-xs text-ink-500" data-testid="hazard-information-advisory">
          Advisory — DENR-MGB susceptibility, not a risk score
        </p>

        {hazard.applicability === "not_applicable" && (
          <p className="mt-2 text-sm text-ink-900" data-testid="hazard-information-state">
            Not applicable
          </p>
        )}

        {hazard.applicability === "no_automated_classification" && (
          <p className="mt-2 text-sm text-ink-900" data-testid="hazard-information-state">
            No automated classification in this version
          </p>
        )}

        {hazard.applicability === "applicable" && (
          <div className="mt-2">
            {hazard.sourceName && (
              <p className="text-xs text-ink-500" data-testid="hazard-information-source">
                {hazard.layerName} · {hazard.sourceName}
              </p>
            )}
            {current === null ? (
              <p className="mt-1 text-sm text-ink-900" data-testid="hazard-information-state">
                Not yet checked
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-ink-900" data-testid="hazard-information-state">
                  {rowText(current)}
                </p>
                <p className="mt-0.5 text-xs text-ink-500" data-testid="hazard-information-checked">
                  {current.lookup_status === "TEMPORARILY_UNAVAILABLE" ? "Last tried" : "Checked"}{" "}
                  {new Date(current.looked_up_at).toLocaleString()}
                </p>
                {current.lookup_status === "TEMPORARILY_UNAVAILABLE" && current.failure_reason && (
                  <p className="mt-0.5 text-xs text-ink-500">Reason: {current.failure_reason}</p>
                )}
                {current.lookup_status === "TEMPORARILY_UNAVAILABLE" && canRetry && <HazardRetryButton ticketId={ticketId} />}
              </>
            )}
          </div>
        )}

        {hazard.history.length > 0 && (
          <details className="mt-3" data-testid="hazard-information-history">
            <summary className="cursor-pointer text-xs font-medium text-ink-700">
              Earlier results ({hazard.history.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {hazard.history.map((row) => (
                <li className="rounded-md border border-line-200 p-2 text-xs" data-testid="hazard-information-history-row" key={row.id}>
                  <span className="text-ink-900">
                    {CONTEXT_NAME[row.hazard_context_type]}: {rowText(row)}
                  </span>
                  <span className="block text-ink-500">
                    Checked {new Date(row.looked_up_at).toLocaleString()}
                    {row.superseded_at && <> · replaced {new Date(row.superseded_at).toLocaleString()}</>}
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
