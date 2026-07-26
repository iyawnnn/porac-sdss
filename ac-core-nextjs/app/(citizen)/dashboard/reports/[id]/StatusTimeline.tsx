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
        const info = reached[step];
        return (
          <div key={step} className="flex-1 flex flex-col items-center text-center">
            <div className="flex items-center w-full">
              <div className={`flex-1 h-0.5 ${i === 0 ? "invisible" : isReached ? "bg-blue-600" : "bg-gray-300"}`} />
              <div
                className={`w-4 h-4 rounded-full flex-shrink-0 ${
                  isReached ? "bg-blue-600" : "bg-gray-300"
                }`}
              />
              <div
                className={`flex-1 h-0.5 ${
                  i === STEPS.length - 1 ? "invisible" : isReached && i < currentIndex ? "bg-blue-600" : "bg-gray-300"
                }`}
              />
            </div>
            <p className={`text-xs font-medium mt-2 ${isReached ? "text-gray-900" : "text-gray-400"}`}>
              {step}
            </p>
            {info && (
              <p className="text-[11px] text-gray-500 mt-0.5">
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
