import type { WorkOrderRow } from "@/lib/types/admin-work-orders";

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

// What a Completed or Cancelled Work Order records (manuscript revision
// Phase 5, step 5b), read-only: completion time, or the cancellation reason,
// who and when, and the replacement Work Order if one was named. A Work
// Order cancelled before 5b has no reason on record. Renders nothing for a
// pending or in-progress one.
export function WorkOrderFinalState({
  workOrder,
  replacementHref,
}: {
  workOrder: WorkOrderRow;
  replacementHref: (id: number) => string;
}) {
  if (workOrder.status === "completed") {
    return (
      <p className="mt-1 text-xs text-ink-500" data-testid="work-order-final">
        Completed{workOrder.completed_at ? ` on ${when(workOrder.completed_at)}` : ""}. Final; no further changes.
      </p>
    );
  }
  if (workOrder.status !== "cancelled") return null;
  if (!workOrder.cancelled_at) {
    return (
      <p className="mt-1 text-xs text-ink-500" data-testid="work-order-final">
        Cancelled. No reason recorded (legacy).
      </p>
    );
  }
  return (
    <div className="mt-1 space-y-0.5 text-xs text-ink-500" data-testid="work-order-final">
      <p>
        Cancelled by {workOrder.cancelled_by_name ?? "a staff member"} on {when(workOrder.cancelled_at)}. Final; no
        further changes.
      </p>
      <p className="whitespace-pre-wrap text-ink-700">Reason: {workOrder.cancellation_reason}</p>
      {workOrder.replacement_work_order_id !== null && (
        <p>
          Replaced by{" "}
          <a className="font-medium underline" href={replacementHref(workOrder.replacement_work_order_id)}>
            Work Order #{workOrder.replacement_work_order_id}
          </a>
        </p>
      )}
    </div>
  );
}
