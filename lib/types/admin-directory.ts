export interface AdminDirectoryRow {
  id: number;
  name: string;
  email: string;
  office: "MEO" | "MDRRMO" | null;
  role: "officer" | "supervisor" | "system_admin";
}
