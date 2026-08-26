"use client";

import { useState } from "react";
import {
  Building2Icon,
  CheckCheckIcon,
  CircleArrowRightIcon,
  DownloadIcon,
  WrenchIcon,
} from "lucide-react";
import type { BulkActionResult } from "@/lib/types/admin-tickets";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BulkDialog = "reassign" | "workOrders" | null;

// The bulk bar is the only place in the queue that mutates more than one
// ticket, so it owns the confirm step for every one of those actions. Nothing
// here fires on a single click: bulk work writes an audit row and a citizen
// notification per ticket, which is not something to trigger by mis-click.
//
// Every action reports its outcome as { ok, skipped } rather than success or
// failure. Bulk work loops the single-ticket endpoints server-side, so a mixed
// selection routinely half-succeeds -- and the admin has to be told which
// tickets did not move and why, not just that "some" did not.
export function QueueBulkBar({
  selectedIds,
  onClearSelection,
  onReassign,
  onAdvanceStatus,
  onCreateWorkOrders,
  exportHref,
  busy,
  result,
  onDismissResult,
}: {
  selectedIds: number[];
  onClearSelection: () => void;
  onReassign: (toOffice: "MEO" | "MDRRMO") => void;
  onAdvanceStatus: () => void;
  onCreateWorkOrders: (input: { title: string; dueDate: string }) => void;
  exportHref: string;
  busy: boolean;
  result: { action: string; result: BulkActionResult } | null;
  onDismissResult: () => void;
}) {
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const [office, setOffice] = useState<"MEO" | "MDRRMO">("MEO");
  const [workOrderTitle, setWorkOrderTitle] = useState("");
  const [workOrderDue, setWorkOrderDue] = useState("");

  const count = selectedIds.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--brand-border)] bg-[var(--brand-subtle)] px-3.5 py-2">
        <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-primary">
          <CheckCheckIcon aria-hidden="true" className="size-4" strokeWidth={2} />
          {count} ticket{count === 1 ? "" : "s"} selected
        </span>
        <span aria-hidden="true" className="h-[18px] w-px bg-[var(--brand-border)]" />

        <BulkButton
          disabled={busy}
          icon={Building2Icon}
          label="Assign office"
          onClick={() => setDialog("reassign")}
        />
        <BulkButton
          disabled={busy}
          icon={CircleArrowRightIcon}
          label="Advance status"
          onClick={onAdvanceStatus}
        />
        <BulkButton
          disabled={busy}
          icon={WrenchIcon}
          label="Create work orders"
          onClick={() => setDialog("workOrders")}
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

        <Button className="ml-auto h-7 px-2 text-xs text-primary" onClick={onClearSelection} size="sm" variant="ghost">
          Clear selection
        </Button>
      </div>

      {result && (
        <div className="flex flex-wrap items-start gap-3 border-b border-border bg-muted px-3.5 py-2.5 text-[13px]">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {result.action}: {result.result.ok.length} updated
              {result.result.skipped.length > 0 && `, ${result.result.skipped.length} skipped`}
            </p>
            {result.result.skipped.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {result.result.skipped.map((skip) => (
                  <li key={skip.id}>
                    <span className="font-mono">#{skip.id}</span> {skip.reason}
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

      <Dialog onOpenChange={(open) => !open && setDialog(null)} open={dialog === "reassign"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {count} ticket{count === 1 ? "" : "s"} to an office</DialogTitle>
            <DialogDescription>
              Each ticket is reassigned individually and logged to the activity trail. Tickets already
              assigned to the chosen office are skipped.
            </DialogDescription>
          </DialogHeader>
          <Select onValueChange={(v) => setOffice(v as "MEO" | "MDRRMO")} value={office}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEO">MEO</SelectItem>
              <SelectItem value="MDRRMO">MDRRMO</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={() => setDialog(null)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                setDialog(null);
                onReassign(office);
              }}
            >
              Assign to {office}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setDialog(null)} open={dialog === "workOrders"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a work order on {count} ticket{count === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              One work order per selected ticket, all sharing this title and due date. Work order
              status is its own track and does not change any ticket status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-wo-title">
                Title
              </label>
              <Input
                id="bulk-wo-title"
                onChange={(e) => setWorkOrderTitle(e.target.value)}
                placeholder="e.g. Site inspection and clearing"
                value={workOrderTitle}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-wo-due">
                Due date (optional)
              </label>
              <Input
                id="bulk-wo-due"
                onChange={(e) => setWorkOrderDue(e.target.value)}
                type="date"
                value={workOrderDue}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialog(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!workOrderTitle.trim()}
              onClick={() => {
                setDialog(null);
                onCreateWorkOrders({ title: workOrderTitle.trim(), dueDate: workOrderDue });
                setWorkOrderTitle("");
                setWorkOrderDue("");
              }}
            >
              Create {count} work order{count === 1 ? "" : "s"}
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
  icon: typeof Building2Icon;
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
