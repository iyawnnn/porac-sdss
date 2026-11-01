"use client";

import { useState } from "react";
import { ClipboardListIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { OPERATIONAL_CONSTRAINT_LABEL, type OperationalConstraint } from "@/lib/types/admin-ticket-constants";
import type { OperationalAssessment } from "@/lib/types/admin-tickets";
import { OperationalAssessmentDialog } from "@/components/features/admin/tickets/OperationalAssessmentDialog";

// Human decision-support layer on real Ticket Detail (Batch 3) — the
// system-generated Operational Priority lives in the existing Scoring tab;
// this card is exclusively the human-entered one.
// Anyone who can load this page already passed OperationalStaffGuard +
// assertOfficeAccess for this exact ticket (see TicketsController.detail),
// so Add/Edit is never gated further on the frontend — the backend
// re-checks current office ownership again at save time regardless (see
// operational-assessment.service.ts's upsert, §10's office-transfer case).
export function OperationalAssessmentPanel({
  ticketId,
  assessment,
  readOnly = false,
}: {
  ticketId: number;
  assessment: OperationalAssessment | null;
  // A merged-away ticket (manuscript revision Phase 3, step 3d) or a
  // Rejected one (step 5b: the API refuses both).
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Operational Assessment</p>
          <p className="text-[11px] text-ink-400">Human assessment</p>
        </div>
        {!readOnly && (
          <Button onClick={() => setOpen(true)} size="sm" variant="outline">
            {assessment ? "Edit Assessment" : "Add Assessment"}
          </Button>
        )}
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
              {assessment.operationalConstraints.some((c) => assessment.operationalConstraintNotes[c]) && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-ink-700">
                  {assessment.operationalConstraints
                    .filter((c) => assessment.operationalConstraintNotes[c])
                    .map((c) => (
                      <li key={c}>
                        <span className="font-medium">{OPERATIONAL_CONSTRAINT_LABEL[c as OperationalConstraint] ?? c}:</span>{" "}
                        {assessment.operationalConstraintNotes[c]}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
          <AssessmentField label="Recommended Action" value={assessment.recommendedAction} />
          <AssessmentField label="Actual Action Taken" value={assessment.actualAction} />
          <AssessmentField label="Temporary Mitigation / Interim Measures" value={assessment.temporaryMitigation} />
          {assessment.supportingEvidenceUrl && (
            <div>
              <p className="text-xs font-medium text-ink-500">Supporting Evidence</p>
              <a
                className="mt-0.5 block text-sm break-all text-primary underline"
                href={assessment.supportingEvidenceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {assessment.supportingEvidenceUrl}
              </a>
            </div>
          )}
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
