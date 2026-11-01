export type WorkOrderStatus = "pending" | "in_progress" | "completed" | "cancelled";
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = ["pending", "in_progress", "completed", "cancelled"];

// Mirrors api/src/admin/work-order.rules.ts (manuscript revision Phase 5,
// step 5b) for UI gating only; the API enforces the same rules.
// pending -> in_progress -> completed; pending or in_progress -> cancelled
// (with a reason, through the Cancel dialog). Completed and Cancelled are
// final for every field.
export const WORK_ORDER_NEXT_STATUS: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
  pending: "in_progress",
  in_progress: "completed",
};
export function isFinalWorkOrder(status: WorkOrderStatus): boolean {
  return status === "completed" || status === "cancelled";
}
export const ASSESSMENT_REQUIRED_MESSAGE = "Add an Operational Assessment first.";
export const WORK_ORDER_CANCELLATION_REASON_MAX_LENGTH = 1000;

export interface WorkOrderRow {
  id: number;
  ticket_id: number;
  title: string;
  notes: string | null;
  assigned_office: "MEO" | "MDRRMO";
  assigned_admin_id: number | null;
  status: WorkOrderStatus;
  due_date: string | null;
  created_by_admin_id: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // Step 5b. All NULL on a Work Order cancelled before 5b (legacy).
  cancellation_reason: string | null;
  cancelled_by_admin_id: number | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  replacement_work_order_id: number | null;
}

// The list endpoint's own row shape — adds the linked ticket's
// already-computed Operational Priority (priority_index), joined
// server-side, never recomputed here.
export interface WorkOrderListRow extends WorkOrderRow {
  priority_index: number | null;
}

export interface WorkOrderPerformanceCounts {
  pendingWorkOrders: number;
  inProgressWorkOrders: number;
  overdueWorkOrders: number;
  completedWorkOrdersThisWeek: number;
}

export interface PaginatedWorkOrders {
  workOrders: WorkOrderListRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  kpis: WorkOrderPerformanceCounts;
}
