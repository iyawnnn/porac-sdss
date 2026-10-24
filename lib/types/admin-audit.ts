import type { AdminAccountType, AdminOffice, AdminRole } from "./admin-admins";

export type AdminAuditActionType =
  | "admin_created"
  | "admin_role_updated"
  | "admin_password_changed"
  | "admin_password_reset"
  | "ticket_status_advanced"
  | "ticket_reassigned"
  | "ticket_referral_noted"
  | "ticket_rejected"
  // Manuscript revision Phase 3, step 3d: staff Merge / Remove / Regroup.
  | "ticket_merged"
  | "report_removed_from_ticket"
  | "report_regrouped"
  | "report_moderated"
  | "work_order_created"
  | "work_order_updated"
  | "work_order_status_changed"
  | "work_order_completed"
  | "work_order_cancelled";

export type AdminAuditTargetType = "admin" | "ticket" | "report" | "work_order";

export interface AdminAuditRow {
  id: number;
  actor_admin_id: number;
  actor_name: string;
  actor_email: string;
  // History: the role the event was written with (never rewritten).
  actor_role: AdminRole;
  actor_account_type: AdminAccountType;
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
