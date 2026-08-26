"use client";

import { useState } from "react";
import Link from "next/link";
import { BanIcon, ChevronDownIcon, ChevronUpIcon, CircleCheckIcon, CopyIcon } from "lucide-react";
import type { ModerationAction, ModerationQueueRow } from "@/lib/types/admin-moderation";
import { computeRiskScore, getFlagCategory, riskBand } from "@/lib/utils/flag-risk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { FlagBadge } from "../FlagBadge";
import { flagEvidence, flagLabel, moderationStatusLabel } from "../flagText";

// The three weights computeRiskScore adds up, restated for the explanation line
// only. They are NOT a second scoring implementation — the number shown is
// always computeRiskScore's, and this map just names where it came from.
// lib/utils/flag-risk.ts is the one place a weight may change.
const CATEGORY_WEIGHT_LABEL: Record<string, number> = {
  duplicate: 35,
  location: 30,
  authenticity: 25,
  other: 15,
};

const RISK_TONE: Record<string, { surface: string; border: string; chip: string; ink: string }> = {
  high: {
    surface: "bg-urgency-critical-tint",
    border: "border-urgency-critical-edge",
    chip: "bg-urgency-critical text-white",
    ink: "text-urgency-critical-ink",
  },
  medium: {
    surface: "bg-urgency-medium-tint",
    border: "border-urgency-medium-edge",
    chip: "bg-urgency-medium-ink text-white",
    ink: "text-urgency-medium-ink",
  },
  low: {
    surface: "bg-urgency-low-tint",
    border: "border-urgency-low-edge",
    chip: "bg-urgency-low-ink text-white",
    ink: "text-urgency-low-ink",
  },
};

const SECTION_LABEL_CLASS =
  "text-[10px] font-bold tracking-[0.09em] text-muted-foreground uppercase";

// Why the score is what it is, in the moderator's words rather than the
// formula's. Deterministic and inspectable on purpose — a moderator who cannot
// tell where a number came from will not trust it, and this one decides whether
// a citizen's report gets hidden.
function riskExplanation(flags: string[]): string {
  const categories = [...new Set(flags.map((f) => getFlagCategory(f).key))];
  if (categories.length === 0) return "No signals fired on this report.";
  const parts = categories.map((key) => `${key} ${CATEGORY_WEIGHT_LABEL[key]}`);
  // computeRiskScore adds a flat 10 when a category fires more than once, so
  // the explanation has to account for it or the parts will not sum to the
  // number in the chip beside them.
  const repeated = flags.length > categories.length;
  return `Deterministic heuristic, not a model score. ${parts.join(" + ")}${
    repeated ? " + repeat signal 10" : ""
  }.`;
}

export function FlaggedReviewDrawer({
  report,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onClose,
  onModerated,
}: {
  report: ModerationQueueRow | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onModerated: () => void;
}) {
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={report !== null}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[460px]" side="right">
        {report && (
          <DrawerBody
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            key={report.id}
            onModerated={onModerated}
            onNext={onNext}
            onPrevious={onPrevious}
            report={report}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type PendingAction = ModerationAction | null;

function DrawerBody({
  report,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onModerated,
}: {
  report: ModerationQueueRow;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onModerated: () => void;
}) {
  const score = computeRiskScore(report.flags);
  const tone = RISK_TONE[riskBand(score)];
  const signalCategoryCount = new Set(report.flags.map((f) => getFlagCategory(f).key)).size;
  const cleanRate =
    report.citizen_report_count > 0
      ? Math.round((1 - report.citizen_flag_count / report.citizen_report_count) * 100)
      : 100;
  const isPending = report.moderation_status === null;

  const [pending, setPending] = useState<PendingAction>(null);
  const [note, setNote] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function startAction(action: ModerationAction) {
    setPending(action);
    setNote("");
    setDuplicateId("");
    setActionError(null);
  }

  async function confirmAction() {
    if (!pending) return;
    if (pending === "quarantine" && !note.trim()) {
      setActionError("A moderation note is required to quarantine a report.");
      return;
    }
    if (pending === "duplicate" && !duplicateId.trim()) {
      setActionError("Enter the canonical report ID first.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    const res = await fetch(`/api/admin/reports/${report.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: pending,
        canonicalReportId: pending === "duplicate" ? Number(duplicateId) : undefined,
        note: note.trim() || undefined,
      }),
    });
    const responseData = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setActionError(responseData.error ?? responseData.message ?? "Action failed.");
      return;
    }
    onModerated();
  }

  return (
    <>
      {/* Prev/next walk the filtered list without closing the drawer — a
          moderator working a queue of 27 should not have to re-find their place
          after every decision. */}
      <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[13px] text-muted-foreground">#{report.id}</span>
          <StatusChip status={report.moderation_status} />
        </div>
        <div className="flex items-center gap-0.5">
          <NavButton disabled={!hasPrevious} label="Previous report" onClick={onPrevious}>
            <ChevronUpIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </NavButton>
          <NavButton disabled={!hasNext} label="Next report" onClick={onNext}>
            <ChevronDownIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </NavButton>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <SheetTitle className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">
            {report.title}
          </SheetTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {report.category} &middot; {report.barangay_name} &middot; {report.assigned_office}{" "}
            &middot;{" "}
            <Link className="text-primary hover:underline" href={`/admin/tickets/${report.ticket_id}`}>
              Ticket #{report.ticket_id}
            </Link>
          </p>
        </div>

        <div className={`flex items-start gap-3 rounded-xl border p-3 ${tone.surface} ${tone.border}`}>
          <div
            className={`flex size-[58px] shrink-0 flex-col items-center justify-center rounded-lg ${tone.chip}`}
          >
            <span className="font-mono text-[22px] leading-6 font-semibold tabular-nums">{score}</span>
            <span className="text-[9px] font-bold tracking-[0.08em] uppercase opacity-90">
              {riskBand(score)}
            </span>
          </div>
          <div className="min-w-0">
            <p className={`text-[13px] font-semibold ${tone.ink}`}>
              {signalCategoryCount === 0
                ? "No signals"
                : `${signalCategoryCount} distinct signal ${
                    signalCategoryCount === 1 ? "category" : "categories"
                  }`}
            </p>
            <p className={`mt-0.5 text-[13px] ${tone.ink} opacity-90`}>
              {riskExplanation(report.flags)}
            </p>
          </div>
        </div>

        <ImageLightbox
          alt={`Evidence photo submitted for "${report.title}" in ${report.barangay_name}, flagged for review`}
          src={report.image_url}
        />

        <section>
          <p className={SECTION_LABEL_CLASS}>Flag breakdown</p>
          <ul className="mt-2 space-y-1.5">
            {report.flags.map((flag) => {
              const category = getFlagCategory(flag);
              return (
                <li className="flex items-center gap-2 text-[13px]" key={flag}>
                  <span className="shrink-0">
                    <FlagBadge flag={flag} size="compact" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {flagEvidence(flag, report) || flagLabel(flag)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    +{CATEGORY_WEIGHT_LABEL[category.key]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl border border-border p-3">
          <Fact label="Report / Ticket">
            <span className="font-mono">
              #{report.id} / #{report.ticket_id}
            </span>
          </Fact>
          <Fact label="Citizen severity">{report.citizen_severity}</Fact>
          <Fact label="Office">
            <span className="font-mono">{report.assigned_office}</span>
          </Fact>
          <Fact label="Submitted">{new Date(report.created_at).toLocaleString()}</Fact>
        </dl>

        {report.description && (
          <section>
            <p className={SECTION_LABEL_CLASS}>Description</p>
            <p className="mt-1.5 text-[13px]">{report.description}</p>
          </section>
        )}

        <section className="rounded-xl border border-border bg-[var(--color-surface-subtle)] p-3">
          <p className={SECTION_LABEL_CLASS}>Reporter history</p>
          <p className="mt-1.5 text-[13px]">
            {report.citizen_name} &middot; {report.citizen_report_count} report
            {report.citizen_report_count === 1 ? "" : "s"} submitted, {report.citizen_flag_count}{" "}
            flagged
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-meter-track)]"
            >
              <span
                className="block h-1 rounded-full bg-urgency-low-ink"
                style={{ width: `${cleanRate}%` }}
              />
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {cleanRate}% clean
            </span>
          </div>
        </section>

        {!isPending && (
          <section className="rounded-xl border border-border bg-[var(--color-surface-subtle)] p-3 text-[13px]">
            <p className={SECTION_LABEL_CLASS}>Moderation decision</p>
            <p className="mt-1.5">
              {moderationStatusLabel(report.moderation_status)} by {report.moderated_by ?? "—"}
              {report.moderated_at && ` on ${new Date(report.moderated_at).toLocaleString()}`}
            </p>
            {report.moderation_status === "duplicate" ? (
              <p className="text-muted-foreground">Canonical report #{report.moderation_note}</p>
            ) : (
              report.moderation_note && (
                <p className="text-muted-foreground">&ldquo;{report.moderation_note}&rdquo;</p>
              )
            )}
          </section>
        )}

        {isPending &&
          (pending ? (
            <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-subtle)] p-3">
              {pending === "duplicate" ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium" htmlFor="canonical-report-id">
                    Canonical report ID this duplicates
                  </label>
                  <Input
                    id="canonical-report-id"
                    onChange={(e) => setDuplicateId(e.target.value)}
                    placeholder="e.g. 96"
                    type="number"
                    value={duplicateId}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px]">
                    {pending === "dismiss"
                      ? "Dismiss this flag? The report stays visible as-is."
                      : "Quarantine this report? It is hidden from the public map immediately."}
                  </p>
                  <label className="block text-xs font-medium" htmlFor="moderation-note">
                    Moderation note {pending === "quarantine" ? "(required)" : "(optional)"}
                  </label>
                  <Textarea
                    id="moderation-note"
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why this decision?"
                    value={note}
                  />
                </div>
              )}
              {actionError && <p className="mt-2 text-[13px] text-destructive">{actionError}</p>}
              <div className="mt-3 flex gap-2">
                <Button disabled={submitting} onClick={confirmAction} size="sm">
                  {submitting ? "Working…" : "Confirm"}
                </Button>
                <Button
                  disabled={submitting}
                  onClick={() => setPending(null)}
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </section>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-urgency-low-edge bg-urgency-low-tint text-[13px] font-medium text-urgency-low-ink transition-colors hover:border-urgency-low-ink"
                  onClick={() => startAction("dismiss")}
                  type="button"
                >
                  <CircleCheckIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Dismiss flag
                </button>
                {/* Solid, and the only one of the three that is: quarantine is
                    the only action with an immediate public consequence. */}
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-medium text-background transition-opacity hover:opacity-90"
                  onClick={() => startAction("quarantine")}
                  type="button"
                >
                  <BanIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Quarantine
                </button>
              </div>
              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-[13px] font-medium transition-colors hover:border-primary"
                onClick={() => startAction("duplicate")}
                type="button"
              >
                <CopyIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Mark as duplicate
              </button>
              <p className="text-xs text-muted-foreground">
                Quarantine hides the report from the public map immediately and requires a note.
              </p>
            </div>
          ))}
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={SECTION_LABEL_CLASS}>{label}</dt>
      <dd className="mt-1 text-[13px]">{children}</dd>
    </div>
  );
}

function StatusChip({ status }: { status: string | null }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-muted px-2 text-[11.5px] font-medium text-muted-foreground">
      {moderationStatusLabel(status)}
    </span>
  );
}

function NavButton({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
