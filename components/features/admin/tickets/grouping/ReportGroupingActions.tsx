"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RegroupReportResult, RelatedTicketCandidate, RemoveReportResult } from "@/lib/types/admin-related-tickets";
import { postGrouping } from "./postGrouping";

const REASON_MAX_LENGTH = 1000;

// Per-report "Remove from ticket…" and "Move to another ticket…" on a
// multi-report ticket (manuscript revision Phase 3, step 3d; Decisions 11,
// 12). Remove gives the report a ticket of its own, routed as a new
// submission would be; Move puts it on a related ticket the server says is
// eligible. Both need a reason and show the server's message on failure.
export function ReportGroupingActions({
  ticketId,
  report,
  removeBlocked,
  moveTargets,
  moveBlocked,
}: {
  ticketId: number;
  report: { id: number; tracking_reference: string };
  removeBlocked: string | null;
  moveTargets: RelatedTicketCandidate[];
  moveBlocked: string | null;
}) {
  const [dialog, setDialog] = useState<"remove" | "move" | null>(null);

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <ActionButton blocked={removeBlocked} label="Remove from ticket…" onClick={() => setDialog("remove")} />
      <ActionButton blocked={moveBlocked} label="Move to another ticket…" onClick={() => setDialog("move")} />
      <GroupingReasonDialog
        confirmLabel="Remove report"
        description={`Report ${report.tracking_reference} gets a ticket of its own, routed as a new report would be. Ticket #${ticketId} keeps its other reports.`}
        onOpenChange={(open) => setDialog(open ? "remove" : null)}
        open={dialog === "remove"}
        submit={(reason) => postGrouping<RemoveReportResult>("remove-report", { reportId: report.id, reason })}
        title={`Remove report ${report.tracking_reference} from Ticket #${ticketId}`}
      />
      <GroupingReasonDialog
        confirmLabel="Move report"
        description={`Report ${report.tracking_reference} moves to the ticket you choose. Ticket #${ticketId} keeps its other reports.`}
        onOpenChange={(open) => setDialog(open ? "move" : null)}
        open={dialog === "move"}
        submit={(reason, targetId) =>
          postGrouping<RegroupReportResult>("regroup-report", { reportId: report.id, toTicketId: targetId, reason })
        }
        targets={moveTargets}
        title={`Move report ${report.tracking_reference} to another ticket`}
      />
    </div>
  );
}

function ActionButton({ label, blocked, onClick }: { label: string; blocked: string | null; onClick: () => void }) {
  if (blocked === null) {
    return (
      <Button onClick={onClick} size="xs" variant="outline">
        {label}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span aria-label={`${label.replace("…", "")} unavailable: ${blocked}`} className="inline-flex" tabIndex={0}>
          <Button className="pointer-events-none" disabled size="xs" variant="outline">
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{blocked}</TooltipContent>
    </Tooltip>
  );
}

function GroupingReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  targets,
  submit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  // Move only: the eligible related tickets to choose from.
  targets?: RelatedTicketCandidate[];
  submit: (reason: string, targetId: number | null) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [targetId, setTargetId] = useState<number | null>(targets?.length === 1 ? targets[0].ticketId : null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const needsTarget = targets !== undefined;

  function close() {
    setReason("");
    setError("");
    setSubmitting(false);
    setTargetId(targets?.length === 1 ? targets[0].ticketId : null);
    onOpenChange(false);
  }

  async function confirm() {
    setSubmitting(true);
    setError("");
    const result = await submit(reason, targetId);
    if (result.ok) {
      close();
      router.refresh();
    } else {
      setError(result.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {needsTarget && (
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Move to</legend>
            {targets.map((target) => (
              <label
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary"
                key={target.ticketId}
              >
                <input
                  checked={targetId === target.ticketId}
                  className="mt-0.5"
                  name="regroup-target"
                  onChange={() => setTargetId(target.ticketId)}
                  type="radio"
                />
                <span className="min-w-0">
                  <span className="block font-medium">
                    Ticket #{target.ticketId} · {target.distanceM} m away
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {target.status} · {target.assignedOffice} · {target.memberCount} report{target.memberCount === 1 ? "" : "s"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${confirmLabel}-reason`}>
            Reason (required)
          </label>
          <Textarea
            id={`${confirmLabel}-reason`}
            maxLength={REASON_MAX_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this report belongs elsewhere"
            rows={3}
            value={reason}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button disabled={submitting} onClick={close} variant="outline">
            Cancel
          </Button>
          <Button disabled={submitting || reason.trim().length === 0 || (needsTarget && targetId === null)} onClick={confirm}>
            {submitting ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
