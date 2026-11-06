// Pure shared contract: imported by both the API and web. No DB imports.
export const AUDIT_ACTIONS = [
  'report_exported',
  'admin_created',
  'admin_role_updated',
  'admin_password_changed',
  'admin_password_reset',
  'admin_deactivated',
  'admin_reactivated',
  'admin_login',
  'admin_login_failed',
  'ticket_status_advanced',
  'ticket_reassigned',
  'ticket_referral_noted',
  'ticket_rejected',
  'ticket_returned_to_review',
  'ticket_category_corrected',
  'ticket_location_corrected',
  'report_moderated',
  'work_order_created',
  'work_order_updated',
  'work_order_status_changed',
  'work_order_completed',
  'work_order_cancelled',
  'report_acknowledged',
  'report_screened',
  'report_severity_screened',
  'report_escalated',
  'operational_assessment_created',
  'operational_assessment_updated',
  'ticket_merged',
  'report_removed_from_ticket',
  'report_regrouped',
] as const;
export type AdminAuditActionType = (typeof AUDIT_ACTIONS)[number];
export const AUDIT_ACTION_LABELS = {
  report_exported: 'Report export',
  admin_created: 'Admin created',
  admin_role_updated: 'Account type/office/Focal updated',
  admin_password_changed: 'Password changed',
  admin_password_reset: 'Password reset',
  admin_deactivated: 'Admin deactivated',
  admin_reactivated: 'Admin reactivated',
  admin_login: 'Admin login',
  admin_login_failed: 'Admin login failed',
  ticket_status_advanced: 'Ticket status advanced',
  ticket_reassigned: 'Ticket reassigned',
  ticket_referral_noted: 'Referral recorded',
  ticket_rejected: 'Ticket rejected',
  ticket_returned_to_review: 'Ticket returned to Under Review',
  ticket_category_corrected: 'Ticket category corrected',
  ticket_location_corrected: 'Ticket location corrected',
  report_moderated: 'Report moderated',
  work_order_created: 'Work order created',
  work_order_updated: 'Work order updated',
  work_order_status_changed: 'Work order status changed',
  work_order_completed: 'Work order completed',
  work_order_cancelled: 'Work order cancelled',
  report_acknowledged: 'Report acknowledged',
  report_screened: 'Report screened (retired)',
  report_severity_screened: 'Report severity screened',
  report_escalated: 'Report escalated (retired)',
  operational_assessment_created: 'Operational assessment created',
  operational_assessment_updated: 'Operational assessment updated',
  ticket_merged: 'Tickets merged',
  report_removed_from_ticket: 'Report removed from ticket',
  report_regrouped: 'Report moved to another ticket',
} satisfies Record<AdminAuditActionType, string>;

export type AdminAuditTargetType =
  'admin' | 'ticket' | 'report' | 'work_order' | 'export';
export interface AdminAuditItem {
  id: number;
  created_at: string;
  action: string; // Unknown historical actions remain readable, with no details.
  target_type: AdminAuditTargetType | 'unknown';
  target_id: number;
  target_label: string;
  actor: {
    id: number;
    name: string;
    account_type: 'PERSONNEL' | 'SYSTEM_ADMIN' | null;
    is_focal: boolean | null;
    display_label: string;
  };
  details: Record<string, string | number | boolean | null>;
}
export interface PaginatedAdminAudit {
  events: AdminAuditItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
