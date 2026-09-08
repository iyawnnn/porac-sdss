"use client";

import { useState } from "react";
import { ClipboardListIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { OPERATIONAL_CONSTRAINT_LABEL, type OperationalConstraint } from "@/lib/types/admin-ticket-constants";
import type { OperationalAssessment } from "@/lib/types/admin-tickets";
import { OperationalAssessmentDialog } from "@/components/features/admin/tickets/OperationalAssessmentDialog";

// Third decision-support layer on real Ticket Detail (Batch 3) — Hazard
// Urgency and Operational Priority (both system-generated) live in the
// existing Scoring tab; this card is exclusively the human-entered one.
// Anyone who can load this page already passed OperationalStaffGuard +
// assertOfficeAccess for this exact ticket (see TicketsController.detail),
// so Add/Edit is never gated further on the frontend — the backend
// re-checks current office ownership again at save time regardless (see
// operational-assessment.service.ts's upsert, §10's office-transfer case).
export function OperationalAssessmentPanel({
  ticketId,
  assessment,
}: {
  ticketId: number;
  assessment: OperationalAssessment | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Operational Assessment</p>
          <p className="text-[11px] text-ink-400">Human assessment</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          {assessment ? "Edit Assessment" : "Add Assessment"}
        </Button>
      </div>

      {!assessment ? (
        <EmptyState
          description="Document the responsible office's operational evaluation, constraints, and recommended action."
          icon={ClipboardListIcon}
          title="No assessment recorded yet."
        />
      ) : (
        <div className="space-y-3 text-sm">
          <AssessmentField label="Observed Conditions" value={assessment.observedConditions} />
          <AssessmentField label="Safety Implications" value={assessment.safetyImplications} />
          {assessment.operationalConstraints.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ink-500">Operational Constraints</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {assessment.operationalConstraints.map((c) => (
                  <Badge key={c} variant="outline">
                    {OPERATIONAL_CONSTRAINT_LABEL[c as OperationalConstraint] ?? c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <AssessmentField label="Recommended Action" value={assessment.recommendedAction} />
          <AssessmentField label="Temporary Mitigation / Interim Measures" value={assessment.temporaryMitigation} />
          <AssessmentField label="Deferment Reason" value={assessment.defermentReason} />
          <AssessmentField label="Referral Reason" value={assessment.referralReason} />
          <AssessmentField label="Additional Remarks" value={assessment.remarks} />
          <p className="text-xs text-ink-400">
            Assessed by {assessment.assessedByName ?? "—"} on {new Date(assessment.assessedAt).toLocaleString()}
            {assessment.updatedAt !== assessment.assessedAt && (
              <> · Last updated by {assessment.updatedByName ?? "—"} on {new Date(assessment.updatedAt).toLocaleString()}</>
            )}
          </p>
        </div>
      )}

      <OperationalAssessmentDialog existing={assessment} onOpenChange={setOpen} open={open} ticketId={ticketId} />
    </>
  );
}

function AssessmentField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-700">{value}</p>
    </div>
  );
}
