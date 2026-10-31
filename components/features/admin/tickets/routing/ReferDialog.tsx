"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { postRouting, ROUTING_REASON_MAX_LENGTH } from "./postRouting";

// Suggested targets only — the manuscript's explicit referral examples. The
// API takes the agency as free text (at most 200 characters, never MEO or
// MDRRMO — that is a Reassign), so "Other" falls through to a text input.
const SUGGESTED_AGENCIES = ["MENRO", "DPWH", "Water utility provider", "Electric utility provider", "Barangay office", "Other"];
const AGENCY_MAX_LENGTH = 200;

// Manual Refer (manuscript pp. 43–44; manuscript revision Phase 5, step 5a):
// records that the ticket was referred to an external agency, with a
// required reason, in routing_actions. The responsible office and the
// ticket's status do not change. The API re-checks the routing rule and
// refuses a repeat of the latest referral to the same agency; its message
// is shown as is.
export function ReferDialog({
  open,
  onOpenChange,
  actionPath,
  ticketId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionPath: string;
  ticketId: number;
}) {
  const router = useRouter();
  const [agency, setAgency] = useState(SUGGESTED_AGENCIES[0]);
  const [customAgency, setCustomAgency] = useState("");
  const [reason, setReason] = useState("");
  const [agencyError, setAgencyError] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setAgency(SUGGESTED_AGENCIES[0]);
    setCustomAgency("");
    setReason("");
    setAgencyError("");
    setReasonError("");
    setError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function confirm() {
    const resolvedAgency = agency === "Other" ? customAgency.trim() : agency;
    const nextAgencyError = resolvedAgency ? "" : "Enter the agency's name.";
    const nextReasonError = reason.trim() ? "" : "A reason is required.";
    setAgencyError(nextAgencyError);
    setReasonError(nextReasonError);
    if (nextAgencyError || nextReasonError) return;
    setError("");
    setSubmitting(true);
    const result = await postRouting(actionPath, "refer", { agency: resolvedAgency, reason: reason.trim() });
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    close();
    router.refresh();
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refer Ticket #{ticketId}</DialogTitle>
          <DialogDescription>
            Records a referral to an external agency. The responsible office and the ticket&apos;s status do not change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="refer-agency">
            Refer to
          </label>
          <Select onValueChange={setAgency} value={agency}>
            <SelectTrigger aria-label="Referral agency" className="w-full" id="refer-agency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUGGESTED_AGENCIES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agency === "Other" && (
            <Input
              aria-describedby={agencyError ? "refer-agency-error" : undefined}
              aria-invalid={agencyError ? true : undefined}
              aria-label="Referral agency name"
              maxLength={AGENCY_MAX_LENGTH}
              onChange={(e) => setCustomAgency(e.target.value)}
              placeholder="Agency name"
              value={customAgency}
            />
          )}
          {agencyError && (
            <p className="text-xs text-destructive" id="refer-agency-error">
              {agencyError}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="refer-reason">
            Reason (required)
          </label>
          <Textarea
            aria-describedby={reasonError ? "refer-reason-error" : undefined}
            aria-invalid={reasonError ? true : undefined}
            id="refer-reason"
            maxLength={ROUTING_REASON_MAX_LENGTH}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError && e.target.value.trim()) setReasonError("");
            }}
            placeholder="Why it goes to this agency (contact, reference number, context)"
            rows={3}
            value={reason}
          />
          {reasonError && (
            <p className="text-xs text-destructive" id="refer-reason-error">
              {reasonError}
            </p>
          )}
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
          <Button disabled={submitting} onClick={confirm}>
            {submitting ? "Recording…" : "Record referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
