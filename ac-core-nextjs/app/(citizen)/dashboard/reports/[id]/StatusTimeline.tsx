import type { StatusHistoryStep } from "@/lib/citizens/reports";

const STEPS = ["Reported", "Under Review", "In Progress", "Resolved"];

export default function StatusTimeline({
  currentStatus,
  ticketCreatedAt,
  history,
}: {
  currentStatus: string;
  ticketCreatedAt: string;
  history: StatusHistoryStep[];
}) {
  // status_history only gets a row when an admin advances a ticket — the
  // initial "Reported" state is never logged there, so it's synthesized
  // from the ticket's own creation time.
  const reached: Record<string, { changedAt: string; adminName: string | null }> = {
    Reported: { changedAt: ticketCreatedAt, adminName: null },
  };
  for (const h of history) {
    reached[h.status] = { changedAt: h.changed_at, adminName: h.admin_name };
  }

  const currentIndex = STEPS.indexOf(currentStatus);

  return (
    <div className="flex">
      {STEPS.map((step, i) => {
        const isReached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        // Connector left of this node is filled if the node itself is reached.
        // Connector right of this node is filled only if the *next* node is
        // also reached (i.e. this node is behind the current).
        const leftFilled = isReached;
        const rightFilled = isReached && i < currentIndex;
        const info = reached[step];

        return (
          <div key={step} className="flex-1 flex flex-col items-center text-center">
            <div className="flex items-center w-full">
              {/* Left connector */}
              <div
                className="flex-1 h-0.5"
                style={{
                  visibility: i === 0 ? "hidden" : "visible",
                  background: leftFilled
                    ? "var(--color-brand-500)"
                    : "var(--color-line-200)",
                }}
              />

              {/* Step dot — filled (reached) or ring (current) or line-200 (future) */}
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={
                  isCurrent
                    ? {
                        // brand ring — hollow centre so it reads as "in progress"
                        background: "var(--color-surface)",
                        border: "2px solid var(--color-brand-500)",
                        boxSizing: "border-box",
                      }
                    : isReached
                    ? {
                        background: "var(--color-brand-500)",
                      }
                    : {
                        background: "var(--color-line-200)",
                      }
                }
                aria-label={isCurrent ? `${step} (current)` : step}
              />

              {/* Right connector */}
              <div
                className="flex-1 h-0.5"
                style={{
                  visibility: i === STEPS.length - 1 ? "hidden" : "visible",
                  background: rightFilled
                    ? "var(--color-brand-500)"
                    : "var(--color-line-200)",
                }}
              />
            </div>

            {/* Step label */}
            <p
              className="text-xs font-medium mt-2"
              style={{
                color: isReached
                  ? "var(--color-ink-900)"
                  : "var(--color-ink-400)",
              }}
            >
              {step}
            </p>

            {/* Timestamp + admin name — data style per §6.3 */}
            {info && (
              <p
                className="text-[11px] mt-0.5 font-mono tabular-nums"
                style={{ color: "var(--color-ink-400)" }}
              >
                {new Date(info.changedAt).toLocaleString()}
                {info.adminName ? ` — ${info.adminName}` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
