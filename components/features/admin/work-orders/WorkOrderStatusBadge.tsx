import { Badge } from "@/components/ui/badge";
import type { WorkOrderStatus } from "@/lib/types/admin-work-orders";

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
};

export function isOverdue(dueDate: string | null, status: WorkOrderStatus): boolean {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge className={config.className} variant="outline">
      {config.label}
    </Badge>
  );
}
