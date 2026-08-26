"use client";

import { useState } from "react";
import { BanIcon, CheckCheckIcon, CircleCheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import type { ModerationAction } from "@/lib/types/admin-moderation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface BulkModerationResult {
  action: string;
  ok: number[];
  failed: { id: number; reason: string }[];
}

type BulkDialog = ModerationAction | null;

// The only place on this page that moderates more than one report, so it owns
// the confirm step for all three actions. Nothing here fires on a single click:
// each one writes an audit row and a citizen notification per report, and
// quarantine additionally hides reports from the public map.
//
// Every action reports { ok, failed } rather than success or failure. There is
// no bulk endpoint — the workspace loops the single-report route, so a mixed
// selection routinely half-succeeds, and the admin has to be told which reports
// did not move and why.
export function FlaggedBulkBar({
  selectedIds,
  onClearSelection,
  onModerate,
  exportHref,
  busy,
  result,
  onDismissResult,
}: {
  selectedIds: number[];
  onClearSelection: () => void;
  onModerate: (input: { action: ModerationAction; note?: string; canonicalReportId?: number }) => void;
  exportHref: string;
  busy: boolean;
  result: BulkModerationResult | null;
  onDismissResult: () => void;
}) {
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const [note, setNote] = useState("");
  const [canonicalId, setCanonicalId] = useState("");

  const count = selectedIds.length;
  const plural = count === 1 ? "" : "s";

  function close() {
    setDialog(null);
    setNote("");
    setCanonicalId("");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--brand-border)] bg-[var(--brand-subtle)] px-3.5 py-2">
        <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-primary">
          <CheckCheckIcon aria-hidden="true" className="size-4" strokeWidth={2} />
          {count} report{plural} selected
        </span>
        <span aria-hidden="true" className="h-[18px] w-px bg-[var(--brand-border)]" />

        <BulkButton
          disabled={busy}
          icon={CircleCheckIcon}
          label="Dismiss flags"
          onClick={() => setDialog("dismiss")}
        />
        <BulkButton
          disabled={busy}
          icon={BanIcon}
          label="Quarantine"
          onClick={() => setDialog("quarantine")}
        />
        <BulkButton
          disabled={busy}
          icon={CopyIcon}
          label="Mark duplicate"
          onClick={() => setDialog("duplicate")}
        />
        {/* A plain link, not a fetch: the CSV is a file download, and the ids
            ride as an export-only query param the list endpoint never sees. */}
        <a
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-card px-2.5 text-xs font-medium whitespace-nowrap transition-colors hover:border-primary"
          href={exportHref}
        >
          <DownloadIcon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          Export selection
        </a>

        <Button
          className="ml-auto h-7 px-2 text-xs text-primary"
          onClick={onClearSelection}
          size="sm"
          variant="ghost"
        >
          Clear selection
        </Button>
      </div>

      {result && (
        <div className="flex flex-wrap items-start gap-3 border-b border-border bg-muted px-3.5 py-2.5 text-[13px]">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {result.action}: {result.ok.length} of {result.ok.length + result.failed.length}{" "}
              applied
              {result.failed.length > 0 && `, ${result.failed.length} failed`}
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {result.failed.map((failure) => (
                  <li key={failure.id}>
                    <span className="font-mono">#{failure.id}</span> {failure.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button className="h-7 px-2 text-xs" onClick={onDismissResult} size="sm" variant="ghost">
            Dismiss
          </Button>
        </div>
      )}

      <Dialog onOpenChange={(open) => !open && close()} open={dialog === "dismiss"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Dismiss flags on {count} report{plural}?
            </DialogTitle>
            <DialogDescription>
              Each report stays visible exactly as it is — dismissing clears the review, not the
              report. One activity-log entry is written per report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-dismiss-note">
              Moderation note (optional)
            </label>
            <Textarea
              id="bulk-dismiss-note"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why these flags are not a problem"
              value={note}
            />
          </div>
          <DialogFooter>
            <Button onClick={close} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                const value = note.trim() || undefined;
                close();
                onModerate({ action: "dismiss", note: value });
              }}
            >
              Dismiss {count} flag{plural}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && close()} open={dialog === "quarantine"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Quarantine {count} report{plural}?
            </DialogTitle>
            <DialogDescription>
              Quarantine hides each report from the public map immediately. The note is required and
              is stored on every report in this selection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {/* Required, mirroring the server: moderation.service.ts rejects a
                quarantine with no note. Asking once and sending the same note
                for the selection is the honest reading of a bulk decision —
                the moderator made one judgement, not N of them. */}
            <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-quarantine-note">
              Moderation note (required)
            </label>
            <Textarea
              id="bulk-quarantine-note"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why these reports are being hidden"
              value={note}
            />
          </div>
          <DialogFooter>
            <Button onClick={close} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!note.trim()}
              onClick={() => {
                const value = note.trim();
                close();
                onModerate({ action: "quarantine", note: value });
              }}
            >
              Quarantine {count} report{plural}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && close()} open={dialog === "duplicate"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark {count} report{plural} as duplicate?
            </DialogTitle>
            <DialogDescription>
              Every selected report is marked a duplicate of the same canonical report. If they
              duplicate different originals, mark them one at a time from the review drawer instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-canonical-id">
              Canonical report ID
            </label>
            <Input
              id="bulk-canonical-id"
              onChange={(e) => setCanonicalId(e.target.value)}
              placeholder="e.g. 96"
              type="number"
              value={canonicalId}
            />
          </div>
          <DialogFooter>
            <Button onClick={close} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!canonicalId.trim()}
              onClick={() => {
                const value = Number(canonicalId);
                close();
                onModerate({ action: "duplicate", canonicalReportId: value });
              }}
            >
              Mark {count} duplicate{plural}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof BanIcon;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-card px-2.5 text-xs font-medium whitespace-nowrap transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}
