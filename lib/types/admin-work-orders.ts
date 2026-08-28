export type WorkOrderStatus = "pending" | "in_progress" | "completed" | "cancelled";
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = ["pending", "in_progress", "completed", "cancelled"];

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
}

// The list endpoint's own row shape — adds the linked ticket's
// already-computed urgency, joined server-side, never recomputed here.
export interface WorkOrderListRow extends WorkOrderRow {
  priority_score: number | null;
  urgency_level: string | null;
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
