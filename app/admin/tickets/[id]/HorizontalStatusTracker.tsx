const STEPS = ["Reported", "Under Review", "In Progress", "Resolved"] as const;

const GLASS_CARD = "bg-white/90 border border-slate-200/60 rounded-xl p-5 shadow-sm";

type StepState = "done" | "active" | "upcoming" | "rejected";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-white" aria-hidden="true">
        <path d="M5 10.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "rejected") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-white" aria-hidden="true">
        <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function StepNode({ state }: { state: StepState }) {
  if (state === "done") return <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500"><StepIcon state={state} /></div>;
  if (state === "rejected") return <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500"><StepIcon state={state} /></div>;
  if (state === "active") {
    return (
      <div className="relative flex h-9 w-9 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400 opacity-40" />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 ring-4 ring-indigo-100">
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </div>
      </div>
    );
  }
  return <div className="h-9 w-9 rounded-full border-2 border-slate-300" />;
}

export function HorizontalStatusTracker({
  currentStatus,
  createdAt,
  history,
}: {
  currentStatus: string;
  createdAt: string;
  history: { status: string; changed_at: string }[];
}) {
  const isRejected = currentStatus === "Rejected";
  const reachedAt: Record<string, string> = { Reported: createdAt };
  for (const h of history) if (!(h.status in reachedAt)) reachedAt[h.status] = h.changed_at;

  const lastReachedIndex = STEPS.reduce((max, step, i) => (step in reachedAt ? i : max), 0);
  // Rejection can land on any step; the node right after the last reached one
  // becomes the rejected branch marker instead of its normal label.
  const rejectedNodeIndex = isRejected ? Math.min(lastReachedIndex + 1, STEPS.length - 1) : -1;
  const currentIndex = isRejected ? lastReachedIndex : STEPS.indexOf(currentStatus as (typeof STEPS)[number]);

  return (
    <div className={GLASS_CARD}>
      <div className="flex items-start">
        {STEPS.map((step, i) => {
          const isRejectedNode = i === rejectedNodeIndex;
          const state: StepState = isRejectedNode ? "rejected" : i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
          const label = isRejectedNode ? "Rejected" : step;
          const ts = isRejectedNode ? reachedAt.Rejected : reachedAt[step];

          return (
            <div key={step} className="flex flex-1 items-start last:flex-none">
              <div className="flex w-24 flex-col items-center text-center">
                <StepNode state={state} />
                <p className={`mt-2 text-xs ${state === "upcoming" ? "text-slate-400" : "font-semibold text-slate-800"}`}>
                  {label}
                </p>
                <p className="text-[11px] text-slate-400">{ts ? formatTimestamp(ts) : "—"}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mt-[18px] h-0.5 flex-1 rounded-full ${
                    i < currentIndex && !isRejectedNode ? (isRejected ? "bg-rose-400" : "bg-emerald-500") : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
