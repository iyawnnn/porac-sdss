export interface AdminDirectoryRow {
  id: number;
  name: string;
  email: string;
  office: "MEO" | "MDRRMO" | null;
  // Always operational Personnel (PERSONNEL, not Focal) — the API filters
  // everyone else out.
  account_type: "PERSONNEL" | "SYSTEM_ADMIN";
  is_focal: boolean;
}
