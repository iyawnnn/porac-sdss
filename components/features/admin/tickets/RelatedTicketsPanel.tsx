import Link from "next/link";
import { StatusPill } from "@/components/features/admin/shared/StatusPill";
import { MergeCandidateButton } from "@/components/features/admin/tickets/grouping/MergeCandidateButton";
import type { RelatedTicketCandidates } from "@/lib/types/admin-related-tickets";

// Suggested related tickets (manuscript pp. 31, 78; manuscript revision
// Phase 3, step 3c): active tickets of the same category within the
// category's radius, nearest first. Suggestions only, since distance alone
// does not establish the same incident; staff confirm with "Merge…" (step
// 3d), which the server allows or explains per candidate. Staff pages only,
// never a citizen page. Operational Personnel open a candidate's Ticket
// Detail; Focal opens its first report in Focal Intake.
export function RelatedTicketsPanel({
  related,
  linkTo,
}: {
  // null when the suggestions couldn't load; the rest of the page still works.
  related: RelatedTicketCandidates | null;
  linkTo: "ticket" | "focal-intake";
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Possibly related tickets</p>
      <p className="mt-1 text-xs text-ink-500">
        Suggested by distance and category only. Staff confirm whether reports are related.
      </p>
      {related === null ? (
        <p className="mt-3 text-sm text-ink-500">Possibly related tickets couldn&apos;t load.</p>
      ) : related.candidates.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          No active tickets of the same category within {related.radiusM} m.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line-100">
          {related.candidates.map((candidate) => {
            const href =
              linkTo === "ticket"
                ? `/admin/tickets/${candidate.ticketId}`
                : candidate.firstReportId !== null
                  ? `/admin/focal/intake/${candidate.firstReportId}`
                  : null;
            const label = `Ticket #${candidate.ticketId} · ${candidate.distanceM} m away`;
            return (
              <li className="py-2.5 first:pt-0 last:pb-0" data-testid={`related-ticket-${candidate.ticketId}`} key={candidate.ticketId}>
                <div className="flex items-start justify-between gap-2">
                  {href ? (
                    <Link className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline" href={href}>
                      {label}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-ink-900">{label}</span>
                  )}
                  {related.viewed.mergedIntoTicketId === null && (
                    <MergeCandidateButton candidate={candidate} viewed={related.viewed} />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                  <StatusPill status={candidate.status} />
                  <span>{candidate.assignedOffice}</span>
                  <span>
                    · {candidate.memberCount} report{candidate.memberCount === 1 ? "" : "s"}
                  </span>
                  {candidate.reportedAt && <span>· Reported {new Date(candidate.reportedAt).toLocaleDateString()}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
