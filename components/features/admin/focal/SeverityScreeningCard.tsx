"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SEVERITY_SCREENING_LABEL } from "@/lib/utils/ui/severity-screening";
import type { FocalIntakeDetail, SeverityScreeningOutcome } from "@/lib/types/admin-focal-intake";

const OUTCOMES: SeverityScreeningOutcome[] = ["NO_CONCERN_NOTED", "REQUIRES_OPERATIONAL_VALIDATION"];
const REMARKS_MAX = 1000;

// Focal severity screening (Appendix H REPORTS severity_screening_*,
// manuscript Table 2; manuscript revision Phase 3, step 3f). Replaced the
// old Initial Screening dialog. Saving calls router.refresh() rather than
// keeping local state, so the card always shows what the server stored.
// Advisory only: the citizen's severity and Operational Priority stay as
// they are.
export function SeverityScreeningCard({ report }: { report: FocalIntakeDetail }) {
  const router = useRouter();
  const screening = report.severityScreening;
  const [outcome, setOutcome] = useState<SeverityScreeningOutcome | null>(
    screening.status === "NOT_REVIEWED" ? null : screening.status,
  );
  const [remarks, setRemarks] = useState(screening.remarks ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const blocked = screening.blockedReason !== null;

  async function handleSave() {
    if (!outcome) return;
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/intake/${report.reportId}/severity-screening`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: outcome, remarks: remarks.trim() || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not save the screening.");
    }
  }

  return (
    <Card data-testid="severity-screening">
      <CardContent className="space-y-3 p-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Severity screening</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">Citizen severity: {report.citizenSeverity}</Badge>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm" data-testid="severity-screening-current">
          {screening.status === "NOT_REVIEWED" ? (
            <p className="text-muted-foreground">Not reviewed</p>
          ) : (
            <>
              <p className="font-medium">{SEVERITY_SCREENING_LABEL[screening.status]}</p>
              {screening.remarks && <p className="mt-1 text-sm">&ldquo;{screening.remarks}&rdquo;</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {screening.screenedByName ?? "Focal Personnel"}
                {screening.screenedAt ? ` · ${new Date(screening.screenedAt).toLocaleString()}` : ""}
              </p>
            </>
          )}
        </div>

        {blocked ? (
          <p className="text-xs text-muted-foreground">{screening.blockedReason}</p>
        ) : (
          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="sr-only">Screening outcome</legend>
            <div className="space-y-1.5">
              {OUTCOMES.map((value) => (
                <label className="flex items-center gap-2 text-sm" key={value}>
                  <input
                    checked={outcome === value}
                    className="size-4 accent-[var(--brand)]"
                    name="severity-screening-outcome"
                    onChange={() => setOutcome(value)}
                    type="radio"
                    value={value}
                  />
                  {SEVERITY_SCREENING_LABEL[value]}
                </label>
              ))}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="severity-screening-remarks">
                Remarks (optional)
              </label>
              <Textarea
                id="severity-screening-remarks"
                maxLength={REMARKS_MAX}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                value={remarks}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button disabled={!outcome || submitting} onClick={handleSave} size="sm">
              {submitting ? "Saving…" : "Save"}
            </Button>
          </fieldset>
        )}

        <p className="text-xs text-muted-foreground">
          Screening is advisory; it does not change the citizen&apos;s severity or Operational Priority.
        </p>
      </CardContent>
    </Card>
  );
}
