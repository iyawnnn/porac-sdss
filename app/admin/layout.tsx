import { getAdminSessionFromApi } from "@/lib/api-client";
import AdminSidebar from "@/components/layouts/AdminSidebar";

// proxy.ts already gates every /admin/* route except /admin/login, so a
// missing session here only happens on that login page — render it bare,
// with no sidebar/office badge/sign-out to show yet.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSessionFromApi();
  if (!session) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <AdminSidebar session={session} />
      {/* pt-14 clears the mobile top bar; md:pl-64 clears the fixed sidebar once it's docked. */}
      <main className="min-h-screen pt-14 md:pl-64 md:pt-0">{children}</main>
    </div>
  );
}
