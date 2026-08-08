import { Badge } from "@/components/ui/badge";
import type { WorkOrderStatus } from "@/lib/types/admin-work-orders";

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
};

export type DueState = "overdue" | "due_today" | "upcoming" | "none";

// A terminal work order (completed/cancelled) never carries a due-state —
// its due date is history, not something to chase.
export function getDueState(dueDate: string | null, status: WorkOrderStatus): DueState {
  if (!dueDate || status === "completed" || status === "cancelled") return "none";
  const due = new Date(dueDate).getTime();
  if (due < Date.now()) return "overdue";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  return due < tomorrowStart.getTime() ? "due_today" : "upcoming";
}

export function isOverdue(dueDate: string | null, status: WorkOrderStatus): boolean {
  return getDueState(dueDate, status) === "overdue";
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge className={config.className} variant="outline">
      {config.label}
    </Badge>
  );
}
