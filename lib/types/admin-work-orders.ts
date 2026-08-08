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

export interface PaginatedWorkOrders {
  workOrders: WorkOrderRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
