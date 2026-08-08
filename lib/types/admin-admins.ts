export type AdminRole = "officer" | "supervisor" | "system_admin";
export type AdminOffice = "MEO" | "MDRRMO";

export interface AdminAccountRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRole;
  office: AdminOffice | null;
  created_at: string;
  is_active: boolean;
}
