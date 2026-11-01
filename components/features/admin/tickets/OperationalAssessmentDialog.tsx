"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  OPERATIONAL_ASSESSMENT_EVIDENCE_URL_MAX_LENGTH,
  OPERATIONAL_CONSTRAINTS,
  OPERATIONAL_CONSTRAINT_LABEL,
  OPERATIONAL_CONSTRAINT_NOTE_MAX_LENGTH,
  type OperationalConstraint,
} from "@/lib/types/admin-ticket-constants";
import type { OperationalAssessment } from "@/lib/types/admin-tickets";

// Real production Operational Assessment form — one manageable dialog, not
// a wizard (Batch 3 §15). First save creates the ticket's one current
// assessment; every later save edits that same row (never a second one) —
// see api/src/admin/operational-assessment.service.ts's upsert(). After a
// successful save this calls router.refresh() rather than updating local
// state, so the summary card always reflects server truth.
export function OperationalAssessmentDialog({
  ticketId,
  existing,
  open,
  onOpenChange,
}: {
  ticketId: number;
  existing: OperationalAssessment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [observedConditions, setObservedConditions] = useState(existing?.observedConditions ?? "");
  const [safetyImplications, setSafetyImplications] = useState(existing?.safetyImplications ?? "");
  const [constraints, setConstraints] = useState<OperationalConstraint[]>(
    (existing?.operationalConstraints as OperationalConstraint[] | undefined) ?? [],
  );
  const [recommendedAction, setRecommendedAction] = useState(existing?.recommendedAction ?? "");
  const [temporaryMitigation, setTemporaryMitigation] = useState(existing?.temporaryMitigation ?? "");
  const [defermentReason, setDefermentReason] = useState(existing?.defermentReason ?? "");
  const [referralReason, setReferralReason] = useState(existing?.referralReason ?? "");
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  // Manuscript revision Phase 5, step 5b.
  const [actualAction, setActualAction] = useState(existing?.actualAction ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(existing?.supportingEvidenceUrl ?? "");
  const [constraintNotes, setConstraintNotes] = useState<Record<string, string>>(existing?.operationalConstraintNotes ?? {});
  const [observedError, setObservedError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleConstraint(value: OperationalConstraint) {
    setConstraints((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));
  }

  function resetAndClose() {
    setError("");
    setObservedError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    setError("");
    // Required on every save (Appendix H assessed_conditions); the API
    // refuses a blank one too.
    if (!observedConditions.trim()) {
      setObservedError("Observed conditions are required.");
      return;
    }
    setObservedError("");
    setSubmitting(true);
    // A note only for a constraint that is still checked, and never blank.
    const notes = Object.fromEntries(
      constraints.map((c) => [c, (constraintNotes[c] ?? "").trim()] as const).filter(([, note]) => note),
    );
    const res = await fetch(`/api/admin/tickets/${ticketId}/assessment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observedConditions,
        safetyImplications,
        operationalConstraints: constraints,
        operationalConstraintNotes: notes,
        recommendedAction,
        actualAction: actualAction.trim() || undefined,
        temporaryMitigation,
        defermentReason: defermentReason.trim() || undefined,
        referralReason: referralReason.trim() || undefined,
        remarks: remarks.trim() || undefined,
        supportingEvidenceUrl: evidenceUrl.trim() || null,
      }),
    });
    if (res.ok) {
      resetAndClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not save the assessment.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Assessment" : "Add Assessment"}</DialogTitle>
          <DialogDescription>
            Document your office&apos;s operational evaluation of Ticket #{ticketId}. This is a human record — it does
            not change Operational Priority or the ticket&apos;s status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Observed Conditions (required)">
            <Textarea
              aria-describedby={observedError ? "observed-conditions-error" : undefined}
              aria-invalid={observedError ? true : undefined}
              aria-label="Observed Conditions"
              onChange={(e) => {
                setObservedConditions(e.target.value);
                if (observedError && e.target.value.trim()) setObservedError("");
              }}
              rows={3}
              value={observedConditions}
            />
            {observedError && (
              <p className="text-xs text-destructive" id="observed-conditions-error">{observedError}</p>
            )}
          </Field>
          <Field label="Safety Implications">
            <Textarea onChange={(e) => setSafetyImplications(e.target.value)} rows={3} value={safetyImplications} />
          </Field>
          <Field label="Operational Constraints">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OPERATIONAL_CONSTRAINTS.map((c) => (
                <label className="flex items-center gap-1.5 text-xs text-ink-700" key={c}>
                  <Checkbox checked={constraints.includes(c)} onCheckedChange={() => toggleConstraint(c)} />
                  {OPERATIONAL_CONSTRAINT_LABEL[c]}
                </label>
              ))}
            </div>
            {/* One optional note per checked constraint. */}
            {constraints.length > 0 && (
              <div className="mt-2 space-y-2">
                {OPERATIONAL_CONSTRAINTS.filter((c) => constraints.includes(c)).map((c) => (
                  <Input
                    aria-label={`Note on ${OPERATIONAL_CONSTRAINT_LABEL[c]}`}
                    key={c}
                    maxLength={OPERATIONAL_CONSTRAINT_NOTE_MAX_LENGTH}
                    onChange={(e) => setConstraintNotes((prev) => ({ ...prev, [c]: e.target.value }))}
                    placeholder={`${OPERATIONAL_CONSTRAINT_LABEL[c]}: note (optional)`}
                    value={constraintNotes[c] ?? ""}
                  />
                ))}
              </div>
            )}
          </Field>
          <Field label="Recommended Action">
            <Textarea onChange={(e) => setRecommendedAction(e.target.value)} rows={3} value={recommendedAction} />
          </Field>
          <Field label="Actual Action Taken (optional)">
            <Textarea aria-label="Actual Action Taken" onChange={(e) => setActualAction(e.target.value)} rows={2} value={actualAction} />
          </Field>
          <Field label="Temporary Mitigation / Interim Measures">
            <Textarea onChange={(e) => setTemporaryMitigation(e.target.value)} rows={3} value={temporaryMitigation} />
          </Field>
          <Field label="Supporting Evidence URL (optional)">
            <Input
              aria-label="Supporting Evidence URL"
              inputMode="url"
              maxLength={OPERATIONAL_ASSESSMENT_EVIDENCE_URL_MAX_LENGTH}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://…"
              type="url"
              value={evidenceUrl}
            />
          </Field>
          <Field label="Deferment Reason (optional)">
            <Textarea onChange={(e) => setDefermentReason(e.target.value)} rows={2} value={defermentReason} />
          </Field>
          <Field label="Referral Reason (optional)">
            <Textarea onChange={(e) => setReferralReason(e.target.value)} rows={2} value={referralReason} />
          </Field>
          <Field label="Additional Remarks (optional)">
            <Textarea onChange={(e) => setRemarks(e.target.value)} rows={2} value={remarks} />
          </Field>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={resetAndClose} variant="outline">Cancel</Button>
          <Button disabled={submitting} onClick={handleSubmit}>{submitting ? "Saving…" : "Save Assessment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {children}
    </div>
  );
}
