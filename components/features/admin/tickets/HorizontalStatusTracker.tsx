"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUS_STYLE } from "../shared/StatusPill";

const STEPS = ["Reported", "Under Review", "In Progress", "Resolved"] as const;
const REJECTED_STYLE = TICKET_STATUS_STYLE.Rejected;
// "Done" reuses the Resolved status's own ink color, not an urgency token —
// urgency and status are separate meaning-channels (DESIGN.md §1) and must
// never share a hue by coincidence.
const DONE_STYLE = TICKET_STATUS_STYLE.Resolved;

type StepState = "done" | "active" | "upcoming" | "rejected";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function StepNode({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <div className="flex size-8 items-center justify-center rounded-full text-white" style={{ background: DONE_STYLE.ink }}>
        <CheckIcon aria-hidden="true" className="size-4" />
      </div>
    );
  }
  if (state === "rejected") {
    return (
      <div className="flex size-8 items-center justify-center rounded-full text-white" style={{ background: REJECTED_STYLE.ink }}>
        <XIcon aria-hidden="true" className="size-4" />
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="relative flex size-8 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-400 opacity-40 motion-reduce:hidden" />
        <div className="relative flex size-8 items-center justify-center rounded-full bg-brand-500 ring-4 ring-brand-100">
          <span className="size-2 rounded-full bg-white" />
        </div>
      </div>
    );
  }
  return <div className="size-8 rounded-full border-2 border-line-200" />;
}

export function HorizontalStatusTracker({
  ticketId,
  currentStatus,
  createdAt,
  history,
  nextStatus,
}: {
  ticketId: number;
  currentStatus: string;
  createdAt: string;
  history: { status: string; changed_at: string }[];
  nextStatus: string | undefined;
}) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);

  const isRejected = currentStatus === "Rejected";
  const reachedAt: Record<string, string> = { Reported: createdAt };
  for (const h of history) if (!(h.status in reachedAt)) reachedAt[h.status] = h.changed_at;

  const lastReachedIndex = STEPS.reduce((max, step, i) => (step in reachedAt ? i : max), 0);
  const rejectedNodeIndex = isRejected ? Math.min(lastReachedIndex + 1, STEPS.length - 1) : -1;
  const currentIndex = isRejected ? lastReachedIndex : STEPS.indexOf(currentStatus as (typeof STEPS)[number]);

  async function advanceStatus() {
    setAdvancing(true);
    await fetch(`/api/admin/tickets/${ticketId}/status`, { method: "POST" });
    router.refresh();
    setAdvancing(false);
  }

  function handleAdvanceClick() {
    if (nextStatus === "Resolved") {
      setShowResolveModal(true);
      return;
    }
    void advanceStatus();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start overflow-x-auto">
          {STEPS.map((step, i) => {
            const isRejectedNode = i === rejectedNodeIndex;
            const state: StepState = isRejectedNode ? "rejected" : i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
            const label = isRejectedNode ? "Rejected" : step;
            const ts = isRejectedNode ? reachedAt.Rejected : reachedAt[step];

            return (
              <div className="flex flex-1 items-start last:flex-none" key={step}>
                <div className="flex w-20 flex-col items-center text-center sm:w-24">
                  <StepNode state={state} />
                  <p className={`mt-2 text-xs ${state === "upcoming" ? "text-ink-400" : "font-semibold text-ink-900"}`}>{label}</p>
                  <p className="text-[11px] text-ink-400">{ts ? formatTimestamp(ts) : "—"}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mt-[15px] h-0.5 flex-1 rounded-full ${i < currentIndex && !isRejectedNode ? "" : "bg-line-200"}`}
                    style={i < currentIndex && !isRejectedNode ? { background: isRejected ? REJECTED_STYLE.ink : DONE_STYLE.ink } : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 sm:pl-4 sm:border-l sm:border-line-200">
          {nextStatus ? (
            <Button className="w-full sm:w-auto" disabled={advancing} onClick={handleAdvanceClick}>
              {advancing ? "Updating..." : `Advance to ${nextStatus}`}
            </Button>
          ) : (
            <p className="text-sm text-ink-500">{isRejected ? "This ticket was rejected." : "No further status transition."}</p>
          )}
        </div>
      </CardContent>

      <ResolveDialog
        onOpenChange={setShowResolveModal}
        onResolved={() => {
          setShowResolveModal(false);
          router.refresh();
        }}
        open={showResolveModal}
        ticketId={ticketId}
      />
    </Card>
  );
}

function ResolveDialog({
  ticketId,
  open,
  onOpenChange,
  onResolved,
}: {
  ticketId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    const formData = new FormData();
    if (file) formData.append("image", file);
    if (notes.trim()) formData.append("notes", notes.trim());

    const res = await fetch(`/api/admin/tickets/${ticketId}/status`, { method: "POST", body: formData });
    if (res.ok) {
      onResolved();
    } else {
      const data = await res.json();
      setError(data.error ?? "Could not mark this ticket resolved.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-label="Mark ticket resolved" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark ticket resolved</DialogTitle>
          <DialogDescription>Optionally attach a proof-of-completion photo and notes for the record.</DialogDescription>
        </DialogHeader>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-700" htmlFor="resolve-photo">
            Resolution photo
          </label>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Preview of the selected resolution proof photo, not yet uploaded" className="mb-2 h-32 w-full rounded-md object-cover" src={preview} />
          ) : (
            <div className="mb-2 flex h-32 w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">No photo selected</div>
          )}
          <Input accept="image/*" id="resolve-photo" onChange={handleFileChange} type="file" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-700" htmlFor="resolve-notes">
            Completion notes
          </label>
          <Textarea id="resolve-notes" onChange={(e) => setNotes(e.target.value)} placeholder="What was done to resolve this?" rows={3} value={notes} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Resolving..." : "Mark resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
