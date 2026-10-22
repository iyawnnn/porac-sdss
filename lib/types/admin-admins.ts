// The old role values: since Phase 2, step 2e only the type of the
// historical admin_audit_events.actor_role (the admins.role mirror is never
// returned by the API).
export type AdminRole = "officer" | "supervisor" | "focal" | "system_admin";
export type AdminAccountType = "PERSONNEL" | "SYSTEM_ADMIN";
export type AdminOffice = "MEO" | "MDRRMO";

export interface AdminAccountRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  account_type: AdminAccountType;
  is_focal: boolean;
  office: AdminOffice | null;
  created_at: string;
  is_active: boolean;
}
