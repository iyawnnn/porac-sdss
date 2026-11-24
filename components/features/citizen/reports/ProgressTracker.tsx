import { Check, X } from "lucide-react";
import { reportProgress, type ProgressStage, type StageState } from "@/lib/utils/report-progress";
import { REPORT_STATUS_FALLBACK, REPORT_STATUS_STYLE } from "@/components/features/citizen/dashboard/reportStatusStyle";
import { cn } from "@/lib/utils";

const STATE_TEXT: Record<StageState, string> = {
  done: "completed",
  current: "current stage",
  skipped: "skipped",
  upcoming: "not reached yet",
  rejected: "not accepted here, the report left the workflow",
  inactive: "not reached, the report was not accepted",
};

const REJECTED = "var(--color-status-rejected-dot)";

// Order-tracking style progress across the four workflow stages. Checks for stages passed, a ring in
// the status colour for the current one, a dashed ring for a stage staff moved past, muted rings ahead.
// A rejection stays on the same four-step track: a red ✕ where the report left it, with the stages
// after it faded and their connector dashed. Every state is also spelled out for screen readers.
export function ProgressTracker({
  status,
  reached,
  dates,
  size = "sm",
}: {
  status: string;
  reached: string[];
  // Detail page: when each stage was entered, shown under its label.
  dates?: Partial<Record<ProgressStage, string>>;
  size?: "sm" | "lg";
}) {
  const { stages } = reportProgress(status, reached);
  const color = (REPORT_STATUS_STYLE[status] ?? REPORT_STATUS_FALLBACK).dot;
  const lg = size === "lg";
  const node = lg ? "size-7" : "size-5";

  return (
    <ol aria-label="Report progress" className="flex">
      {stages.map(({ label, state }, i) => {
        const prev = stages[i - 1]?.state;
        const connectorDone = state === "done" || state === "current" || state === "rejected";
        const connectorDead = state === "inactive" || prev === "rejected";
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-1/2 h-0 w-full -translate-y-1/2 border-t",
                  lg ? "top-3.5" : "top-2.5",
                  connectorDead ? "border-dashed border-border" : connectorDone ? "border-foreground/40" : "border-border",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 flex items-center justify-center rounded-full bg-card",
                node,
                state === "done" && "bg-foreground text-background",
                state === "current" && "border-2",
                state === "skipped" && "border border-dashed border-muted-foreground/60",
                state === "upcoming" && "border border-border",
                state === "inactive" && "border border-dashed border-muted-foreground/40",
                state === "rejected" && "text-white",
              )}
              style={state === "current" ? { borderColor: color } : state === "rejected" ? { background: REJECTED } : undefined}
            >
              {state === "done" && <Check className={lg ? "size-4" : "size-3"} strokeWidth={3} />}
              {state === "current" && <span className={cn("rounded-full", lg ? "size-2.5" : "size-2")} style={{ background: color }} />}
              {state === "rejected" && <X className={lg ? "size-4" : "size-3"} strokeWidth={3} />}
            </span>
            <span
              className={cn(
                "px-0.5 leading-tight",
                lg ? "text-xs sm:text-sm" : "text-[11px]",
                state === "current" || state === "rejected" ? "font-medium text-foreground" : state === "inactive" ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              {label}
              <span className="sr-only">, {STATE_TEXT[state]}</span>
            </span>
            {state === "rejected" && (
              <span aria-hidden="true" className={cn("-mt-1 font-medium leading-tight", lg ? "text-xs" : "text-[11px]")} style={{ color: "var(--color-status-rejected-ink)" }}>
                Not accepted
              </span>
            )}
            {lg && dates?.[label] && (state === "done" || state === "current" || state === "rejected") && (
              <span className="-mt-1 text-[11px] text-muted-foreground tabular-nums sm:text-xs">{dates[label]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
