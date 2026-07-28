import { getAdminSession } from "@/lib/auth/getSession";
import AdminShell from "./AdminShell";

// proxy.ts already gates every /admin/* route except /admin/login, so a
// missing session here only happens on that login page — render it bare,
// with no nav/office badge/sign-out to show yet.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) return <>{children}</>;
  return <AdminShell session={session}>{children}</AdminShell>;
}
