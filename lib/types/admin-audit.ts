import type { AdminOffice, AdminRole } from "./admin-admins";

export type AdminAuditActionType =
  | "admin_created"
  | "admin_role_updated"
  | "ticket_status_advanced"
  | "ticket_reassigned"
  | "report_moderated";

export type AdminAuditTargetType = "admin" | "ticket" | "report";

export interface AdminAuditRow {
  id: number;
  actor_admin_id: number;
  actor_name: string;
  actor_email: string;
  actor_role: AdminRole;
  actor_office: AdminOffice | null;
  action_type: AdminAuditActionType;
  target_type: AdminAuditTargetType;
  target_id: number;
  target_summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PaginatedAdminAudit {
  events: AdminAuditRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
