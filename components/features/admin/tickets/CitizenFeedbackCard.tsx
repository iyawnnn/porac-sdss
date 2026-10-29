import type { TicketCitizenFeedback } from "@/lib/types/admin-tickets";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Ticket Detail's "Citizen feedback" block (Appendix H RESOLUTION_FEEDBACK;
// manuscript revision Phase 3, step 3g): how many reporters confirmed or
// disputed the resolution, and each answer with its time and, for a
// dispute, its reason — shown to the responsible office, like the dispute
// card above it. Each reporter answers once; no reporter identity is shown.
export function CitizenFeedbackCard({ feedback }: { feedback: TicketCitizenFeedback }) {
  return (
    <Card data-testid="citizen-feedback">
      <CardContent className="p-4">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Citizen feedback</p>
        <p className="mt-1 text-sm text-ink-900" data-testid="citizen-feedback-summary">
          {feedback.confirmed} confirmed, {feedback.disputed} disputed
        </p>
        {feedback.responses.length === 0 ? (
          <p className="mt-2 text-xs text-ink-500">No reporter has answered yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {feedback.responses.map((response, i) => (
              <li
                className="rounded-md border border-line-200 p-2.5"
                data-testid="citizen-feedback-response"
                key={`${response.created_at}-${i}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {response.feedback_type === "CONFIRMED" ? (
                    <Badge className="bg-status-resolved-tint text-status-resolved-ink" variant="outline">
                      Confirmed fixed
                    </Badge>
                  ) : (
                    <Badge className="bg-red-50 text-red-700" variant="outline">
                      Disputed
                    </Badge>
                  )}
                  <span className="text-xs text-ink-500">{new Date(response.created_at).toLocaleString()}</span>
                </div>
                {response.feedback_type === "DISPUTED" && response.reason && (
                  <p className="mt-1.5 text-sm text-ink-900">{response.reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
